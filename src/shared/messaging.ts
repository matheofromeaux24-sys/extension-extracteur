// Injection à la demande du content script et messages typés vers l'onglet.

import type { ContentRequest, ContentResponse, Envelope } from './types';

/** Fichier généré par le plugin `scrapy-easy-content-script` (vite.config.ts). */
const CONTENT_SCRIPT = 'content.js';

export type ForbiddenReason = 'chrome' | 'file' | 'pdf';

export class AccessError extends Error {
  constructor(
    public readonly kind: 'forbidden' | 'permission' | 'loading',
    public readonly detail: { reason?: ForbiddenReason; origin?: string; domain?: string } = {},
    message: string = kind,
  ) {
    super(message);
  }
}

const FORBIDDEN_PREFIXES = [
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'brave:',
  'opera:',
  'vivaldi:',
  'about:',
  'view-source:',
  'data:',
  'blob:',
  'javascript:',
];
const STORE_RE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/;

/** Pages que Chrome interdit aux extensions de lire. */
export function forbiddenReason(url: string | undefined): ForbiddenReason | null {
  if (!url) return 'chrome';
  if (FORBIDDEN_PREFIXES.some((p) => url.startsWith(p)) || STORE_RE.test(url)) return 'chrome';
  if (url.startsWith('file:')) return null; // possible si l'utilisateur l'a autorisé
  if (/\.pdf($|[?#])/i.test(url)) return 'pdf';
  return null;
}

export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

async function rawSend<T>(tabId: number, msg: ContentRequest): Promise<Envelope<T>> {
  return chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }) as Promise<Envelope<T>>;
}

async function ping(tabId: number): Promise<boolean> {
  try {
    const res = await rawSend<{ version: string }>(tabId, { type: 'ping' });
    return !!res?.ok && res.data.version === chrome.runtime.getManifest().version;
  } catch {
    return false;
  }
}

/** Injecte le content script si nécessaire. Lève une AccessError explicite en cas d'échec. */
export async function ensureContentScript(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url || tab.pendingUrl || '';
  const reason = forbiddenReason(url);
  if (reason) throw new AccessError('forbidden', { reason });
  if (await ping(tabId)) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: [CONTENT_SCRIPT],
      // Sans attendre la fin du chargement (images, pubs…) : le script attend lui-même le DOM.
      injectImmediately: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (url.startsWith('file:')) throw new AccessError('forbidden', { reason: 'file' }, message);
    if (/gallery|webstore|chrome:\/\//i.test(message)) throw new AccessError('forbidden', { reason: 'chrome' }, message);
    if (/permission|Cannot access/i.test(message) && /^https?:/.test(url)) {
      throw new AccessError('permission', { origin: originPattern(url), domain: new URL(url).hostname }, message);
    }
    if (/Frame with ID 0 is showing error page|No tab with id|loading/i.test(message)) throw new AccessError('loading', {}, message);
    throw e;
  }
  // Petite marge si la page est encore occupée.
  for (let i = 0; i < 20; i++) {
    if (await ping(tabId)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new AccessError('loading');
}

export async function sendToTab<T extends ContentRequest>(tabId: number, msg: T): Promise<ContentResponse<T>> {
  const res = await rawSend<ContentResponse<T>>(tabId, msg);
  if (!res) throw new Error('Pas de réponse de la page.');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
