// Pagination côté page : repérage du lien « Page suivante », du bouton
// « Charger plus » et du conteneur qui défile, puis actions correspondantes.

import type { PageControl, PaginationDetection } from '../shared/types';
import { absoluteUrl } from '../shared/url';
import { waitForDomStable } from './domStable';
import { uniqueSelector } from './selectors';
import { isRendered, OVERLAY_PREFIX } from './traverse';

const NEXT_EXACT =
  /^(suivant|suivante|suivants|page suivante|articles suivants|résultats suivants|produits suivants|next|next page|older posts|›|»|→|>|>>|›»|weiter|siguiente|successivo|volgende)\s*[›»→>]?$/i;
const NEXT_LOOSE = /(^|[\s(])(suivante?s?|next)([\s)›»→>]|$)/i;
const NEXT_CLASS = /(^|[-_\s])(next|suivant|pagination-next|pager-next)([-_\s]|$)/i;
const PAGINATION_CTX = /(pagination|pager|paging|page-?list|page-?numbers|pages)/i;
const LOAD_MORE =
  /((charger|afficher|voir|montrer)\s+(plus|davantage|la suite|d['’]autres|encore))|plus de (résultats|produits|articles|annonces)|^plus$|load more|show more|see more|view more|more results|mehr laden|cargar más|ver más/i;

const CLICKABLE = 'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ICON_CLASS = /(^|\s)(material-icons|material-symbols[\w-]*|google-symbols|fa|fas|far|fab|glyphicon|icon|icons?-[\w-]+)(\s|$)/i;

/** Texte visible sans les polices d'icônes (« chevron_right », glyphes privés U+E000…). */
function visibleText(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent;
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as Element;
      if (ICON_CLASS.test(typeof e.className === 'string' ? e.className : '') || e.getAttribute('aria-hidden') === 'true') return;
      if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE') return;
      e.childNodes.forEach(walk);
    }
  };
  walk(el);
  return out.replace(/[\uE000-\uF8FF]/g, '').replace(/\s+/g, ' ').trim();
}

function labelOf(el: Element): string {
  const text = visibleText(el);
  const value = el instanceof HTMLInputElement ? el.value : '';
  const s = text || value || el.getAttribute('aria-label') || el.getAttribute('title') || '';
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

function isDisabled(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return true;
  const cls = typeof el.className === 'string' ? el.className : '';
  return /(^|\s)(disabled|is-disabled|inactive)(\s|$)/i.test(cls) || !!el.closest('.disabled, [aria-disabled="true"]');
}

function isUsable(el: Element): boolean {
  if (el.tagName.toLowerCase().startsWith(OVERLAY_PREFIX)) return false;
  if (!isRendered(el) || isDisabled(el)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function sameDocument(href: string): boolean {
  return href.replace(/#.*$/, '') === location.href.replace(/#.*$/, '');
}

function control(el: Element): PageControl {
  const href = el.tagName === 'A' ? absoluteUrl(el.getAttribute('href'), document.baseURI) : '';
  return { selector: uniqueSelector(el), label: labelOf(el) || '…', href: href && !sameDocument(href) ? href : undefined };
}

function inPagination(el: Element): boolean {
  let cur: Element | null = el.parentElement;
  for (let d = 0; cur && d < 5; d++, cur = cur.parentElement) {
    const s = `${typeof cur.className === 'string' ? cur.className : ''} ${cur.id} ${cur.getAttribute('aria-label') || ''} ${cur.getAttribute('role') || ''}`;
    if (PAGINATION_CTX.test(s)) return true;
    if (cur.tagName === 'NAV') return true;
  }
  return false;
}

/** Lien juste après la page courante dans une pagination numérotée (1 [2] 3 → 3). */
function afterCurrentPage(): Element | null {
  const current = Array.from(document.querySelectorAll('[aria-current="page"], .current, .active, .selected')).find(
    (el) => inPagination(el) && /^\d+$/.test(labelOf(el)),
  );
  if (!current) return null;
  const item = current.closest('li') ?? current;
  let sib = item.nextElementSibling;
  while (sib && !sib.matches(CLICKABLE) && !sib.querySelector(CLICKABLE)) sib = sib.nextElementSibling;
  const link = sib ? (sib.matches(CLICKABLE) ? sib : sib.querySelector(CLICKABLE)) : null;
  return link && /^\d+$/.test(labelOf(link)) ? link : null;
}

function bySelector(selector?: string): Element | null {
  if (!selector) return null;
  try {
    const el = document.querySelector(selector);
    return el && isUsable(el) ? el : null;
  } catch {
    return null;
  }
}

export function findNextElement(selector?: string): Element | null {
  const chosen = bySelector(selector);
  if (chosen) return chosen;

  let best: Element | null = null;
  let bestScore = 0;
  const all = Array.from(document.querySelectorAll(CLICKABLE)).slice(0, 4000);
  for (const el of all) {
    const text = labelOf(el);
    const aria = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`.trim();
    const rel = (el.getAttribute('rel') || '').toLowerCase().split(/\s+/);
    const cls = `${typeof el.className === 'string' ? el.className : ''} ${el.id}`;
    let score = 0;
    if (rel.includes('next')) score += 6;
    if (NEXT_EXACT.test(text)) score += 4;
    else if (text.length <= 30 && NEXT_LOOSE.test(text)) score += 2;
    if (aria && (NEXT_EXACT.test(aria) || (aria.length <= 40 && NEXT_LOOSE.test(aria)))) score += 3;
    if (NEXT_CLASS.test(cls)) score += 2;
    if (score > 0 && inPagination(el)) score += 2;
    if (/pr[ée]c[ée]dent|previous|prev\b|newer/i.test(`${text} ${aria} ${cls}`)) score = 0;
    if (score < 4 || score <= bestScore || !isUsable(el)) continue;
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      const abs = absoluteUrl(href, document.baseURI);
      if (abs && sameDocument(abs) && !href.startsWith('#') && href !== '') continue; // lien vers la page actuelle
    }
    best = el;
    bestScore = score;
  }
  if (best) return best;
  const numbered = afterCurrentPage();
  return numbered && isUsable(numbered) ? numbered : null;
}

export function findLoadMoreElement(selector?: string, listEnd?: Element | null): Element | null {
  const chosen = bySelector(selector);
  if (chosen) return chosen;
  let best: Element | null = null;
  let bestScore = 0;
  const endRect = listEnd?.getBoundingClientRect();
  for (const el of Array.from(document.querySelectorAll(CLICKABLE)).slice(0, 4000)) {
    const text = labelOf(el);
    if (!text || text.length > 50 || !LOAD_MORE.test(text)) continue;
    if (el.tagName === 'A' && NEXT_EXACT.test(text)) continue;
    if (!isUsable(el)) continue;
    let score = 3;
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') score += 1;
    if (endRect) {
      const r = el.getBoundingClientRect();
      if (r.top >= endRect.top - 50 && r.top - endRect.bottom < 800) score += 2;
    }
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return best;
}

function parentAcrossShadow(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Premier ancêtre qui défile réellement (panneau interne), sinon null = la fenêtre. */
export function scrollableAncestor(el: Element): Element | null {
  for (let cur = parentAcrossShadow(el); cur && cur !== document.body && cur !== document.documentElement; cur = parentAcrossShadow(cur)) {
    const oy = getComputedStyle(cur).overflowY;
    if (/(auto|scroll|overlay)/.test(oy) && cur.scrollHeight > cur.clientHeight + 20) return cur;
  }
  return null;
}

export function detectPagination(items: Element[]): PaginationDetection {
  const next = findNextElement();
  const loadMore = findLoadMoreElement(undefined, items[items.length - 1]);
  const inner = items.length ? scrollableAncestor(items[0]) : null;
  return {
    next: next ? control(next) : null,
    loadMore: loadMore ? control(loadMore) : null,
    scroll: { inner: !!inner },
  };
}

export function findNext(selector?: string): PageControl | null {
  const el = findNextElement(selector);
  return el ? control(el) : null;
}

interface Snapshot {
  count: number;
  last: Element | null;
  first: string;
  height: number;
}

function snapshot(items: Element[], scroller: Element | null): Snapshot {
  return {
    count: items.length,
    last: items[items.length - 1] ?? null,
    first: (items[0]?.textContent || '').slice(0, 300),
    height: scroller ? scroller.scrollHeight : document.documentElement.scrollHeight,
  };
}

/** Attend l'arrivée de nouveaux items (ou le remplacement de la liste) pendant `waitMs`. */
async function waitForChange(
  getItems: () => Element[],
  before: Snapshot,
  scroller: Element | null,
  waitMs: number,
  mode: 'grow' | 'replace',
): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(250);
    const items = getItems();
    const now = snapshot(items, scroller);
    const grew = now.count > before.count || (now.last !== before.last && now.last !== null) || now.height > before.height + 10;
    const replaced = now.first !== before.first || (before.last !== null && !before.last.isConnected);
    if (mode === 'grow' ? grew : replaced) {
      await waitForDomStable({ quietMs: 300, timeoutMs: 2500 });
      return true;
    }
  }
  return false;
}

export async function scrollStep(getItems: () => Element[], waitMs: number): Promise<{ grew: boolean; itemCount: number }> {
  const items = getItems();
  const scroller = items.length ? scrollableAncestor(items[0]) : null;
  const before = snapshot(items, scroller);
  // Faire apparaître le dernier item déclenche les chargeurs à base d'IntersectionObserver…
  before.last?.scrollIntoView({ block: 'end' });
  // … et aller tout en bas déclenche ceux qui écoutent le défilement.
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  else window.scrollTo(0, document.documentElement.scrollHeight);
  const grew = await waitForChange(getItems, before, scroller, waitMs, 'grow');
  return { grew, itemCount: getItems().length };
}

function humanClick(el: Element): void {
  el.scrollIntoView({ block: 'center' });
  (el as HTMLElement).click();
}

export async function clickLoadMore(
  selector: string | undefined,
  getItems: () => Element[],
  waitMs: number,
): Promise<{ clicked: boolean; grew: boolean }> {
  const items = getItems();
  const el = findLoadMoreElement(selector, items[items.length - 1]);
  if (!el) return { clicked: false, grew: false };
  const scroller = items.length ? scrollableAncestor(items[0]) : null;
  const before = snapshot(items, scroller);
  humanClick(el);
  return { clicked: true, grew: await waitForChange(getItems, before, scroller, waitMs, 'grow') };
}

/** Clic sur « Suivant » quand la page ne se recharge pas (sites SPA). */
export async function clickNext(
  selector: string | undefined,
  getItems: () => Element[],
  waitMs: number,
): Promise<{ clicked: boolean; changed: boolean }> {
  const el = findNextElement(selector);
  if (!el) return { clicked: false, changed: false };
  const items = getItems();
  const before = snapshot(items, null);
  humanClick(el);
  return { clicked: true, changed: await waitForChange(getItems, before, null, waitMs, 'replace') };
}
