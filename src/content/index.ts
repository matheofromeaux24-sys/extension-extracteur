// Content script, injecté à la demande dans l'onglet analysé.

import type { ContentRequest, ContentResponses, Envelope, ExtractResult, PageInfo } from '../shared/types';
import { domainOf } from '../shared/url';
import { detectLists, type Candidate } from './detect/listDetector';
import { waitForDomStable } from './domStable';
import { extractCandidate } from './extract';
import { Highlighter } from './highlight';

const VERSION = chrome.runtime.getManifest().version;

const state: { candidates: Candidate[]; current: number } = { candidates: [], current: 0 };
const highlighter = new Highlighter();

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
  highlighter.show(c.items, c.container);
  highlighter.reveal();
  return {
    page: pageInfo(),
    list: { index: i, itemCount: c.items.length, score: Math.round(c.score * 10) / 10, selector: c.selector },
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
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch {
      /* contexte d'extension invalidé */
    }
  },
};
