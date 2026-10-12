// Content script, injecté à la demande dans l'onglet analysé.

import { messages } from '../shared/i18n';
import type { Column, ContentRequest, ContentResponses, Envelope, ExtractResult, ListDef, PageInfo } from '../shared/types';
import { domainOf } from '../shared/url';
import { rowsForColumns } from './detect/columns';
import { detectLists, type Candidate } from './detect/listDetector';
import { waitForDomStable } from './domStable';
import { extractCandidate, itemFields } from './extract';
import { Highlighter } from './highlight';
import { currentItems, fromCandidate, resolveList, type ActiveList } from './listResolver';
import { clickLoadMore, clickNext, detectPagination, findNext, scrollStep } from './paginate';
import { pickColumn, pickList } from './listPicker';
import { cancelPick, pickElement } from './picker';

const VERSION = chrome.runtime.getManifest().version;

const state: { candidates: Candidate[]; current: number; active: ActiveList | null } = {
  candidates: [],
  current: 0,
  active: null,
};
const highlighter = new Highlighter();

/** Liste active pour la pagination, retrouvée si besoin sur une nouvelle page. */
function activeList(def: ListDef, columns: Column[] = []): ActiveList | null {
  state.active = resolveList(def, columns, state.active);
  return state.active;
}

function itemsOf(def: ListDef): () => Element[] {
  return () => {
    const a = activeList(def);
    return a ? currentItems(a) : [];
  };
}

function pageInfo(): PageInfo {
  return { url: location.href, title: document.title || location.hostname, domain: domainOf(location.href) };
}

function select(index: number, startedAt: number): ExtractResult | null {
  const { candidates } = state;
  if (!candidates.length) {
    highlighter.clear();
    return null;
  }
  const i = ((index % candidates.length) + candidates.length) % candidates.length;
  state.current = i;
  const c = candidates[i];
  // La page a pu changer depuis la détection (SPA) : on ignore les items détachés.
  c.items = c.items.filter((e) => e.isConnected);
  const { columns, rows } = extractCandidate(c);
  state.active = fromCandidate(c);
  highlighter.show(c.items, c.container);
  highlighter.reveal();
  return {
    page: pageInfo(),
    list: { index: i, itemCount: c.items.length, score: Math.round(c.score * 10) / 10, selector: c.selector, isTable: c.isTable },
    listCount: candidates.length,
    columns,
    rows,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

async function handle(msg: ContentRequest): Promise<ContentResponses[ContentRequest['type']]> {
  switch (msg.type) {
    case 'ping':
      return { version: VERSION };
    case 'detect': {
      const t0 = performance.now();
      await waitForDomStable();
      state.candidates = detectLists();
      return select(0, t0);
    }
    case 'selectList': {
      const t0 = performance.now();
      if (!state.candidates.length || !state.candidates[0].items.some((e) => e.isConnected)) {
        await waitForDomStable({ timeoutMs: 2000 });
        state.candidates = detectLists();
      }
      return select(msg.index, t0);
    }
    case 'clearHighlight':
      highlighter.clear();
      return true;
    case 'detectPagination': {
      const a = state.active;
      return detectPagination(a ? currentItems(a) : []);
    }
    case 'extractList': {
      // Nouvelle page ou contenu rechargé : on attend que le DOM se stabilise.
      await waitForDomStable({ quietMs: 400, timeoutMs: 6000 });
      const a = activeList(msg.list, msg.columns);
      const items = a ? currentItems(a) : [];
      const rows = rowsForColumns(itemFields(msg.list, items), msg.columns);
      if (a) highlighter.show(items, a.container);
      return { rows, itemCount: items.length, page: pageInfo() };
    }
    case 'scrollStep':
      return scrollStep(itemsOf(msg.list), msg.waitMs);
    case 'clickLoadMore':
      return clickLoadMore(msg.selector, itemsOf(msg.list), msg.waitMs);
    case 'findNext':
      return findNext(msg.selector, state.active ? currentItems(state.active) : []);
    case 'clickNext':
      return clickNext(msg.selector, itemsOf(msg.list), msg.waitMs);
    case 'pickElement': {
      const P = messages.pagination;
      const banner = msg.purpose === 'next' ? P.pickNextBanner : msg.purpose === 'loadMore' ? P.pickLoadMoreBanner : P.pickAnyBanner;
      return pickElement(banner, messages.picker.cancel);
    }
    case 'pickList': {
      const t0 = performance.now();
      const previous = state.candidates[state.current];
      const picked = await pickList(highlighter, () => {
        if (previous?.items.some((e) => e.isConnected)) highlighter.show(previous.items, previous.container);
      });
      if (!picked) return null;
      // La liste choisie passe en tête : « Liste 1 sur N ».
      state.candidates = [picked, ...state.candidates.filter((c) => c.selector !== picked.selector)];
      return select(0, t0);
    }
    case 'pickColumn': {
      const a = state.active;
      if (!a) return null;
      return pickColumn(a, msg.columns, highlighter);
    }
    case 'cancelPick':
      cancelPick();
      return true;
  }
}

// Si une ancienne instance tourne encore (extension rechargée), on la remplace.
const KEY = '__scrapyEasyContent';
const w = window as unknown as Record<string, { dispose: () => void } | undefined>;
w[KEY]?.dispose();

const listener = (msg: ContentRequest, _sender: chrome.runtime.MessageSender, sendResponse: (r: Envelope<unknown>) => void) => {
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return false;
  handle(msg).then(
    (data) => sendResponse({ ok: true, data }),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
  );
  return true;
};
chrome.runtime.onMessage.addListener(listener);
w[KEY] = {
  dispose() {
    highlighter.clear();
    cancelPick();
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch {
      /* contexte d'extension invalidé */
    }
  },
};
