// Suit l'onglet actif du navigateur pendant que la fenêtre Scrapy Easy reste ouverte.

import { sendToTab } from '../../shared/messaging';
import type { UiMessage } from '../../shared/types';
import { getState, setState } from '../store/useStore';
import { analyze, onPaginationProgress, restoreRunningJob } from './controller';

let ownWindowId: number | undefined;

async function setTarget(tabId: number, opts: { forceAnalyze?: boolean } = {}): Promise<void> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (tab.windowId === ownWindowId) return;
  setState({
    target: { tabId, url: tab.url || tab.pendingUrl || '', title: tab.title || '', favIconUrl: tab.favIconUrl },
  });
  const { status } = getState();
  // Sans résultat affiché, on analyse automatiquement ; sinon un bandeau propose de le faire.
  if (opts.forceAnalyze || status !== 'ready') void analyze(tabId);
}

async function activeTabOfLastNormalWindow(): Promise<number | undefined> {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    return tab?.id;
  } catch {
    return undefined;
  }
}

export async function initTargetTracking(): Promise<void> {
  ownWindowId = (await chrome.windows.getCurrent()).id;

  const param = Number(new URLSearchParams(location.search).get('tabId'));
  const initial = Number.isInteger(param) && param > 0 ? param : await activeTabOfLastNormalWindow();
  // Fenêtre rouverte pendant une extraction multi-pages : on reprend son affichage.
  const restored = await restoreRunningJob();
  if (initial !== undefined) await setTarget(initial, { forceAnalyze: !restored });

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    if (windowId !== ownWindowId) void setTarget(tabId);
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === ownWindowId || windowId === chrome.windows.WINDOW_ID_NONE) return;
    try {
      const win = await chrome.windows.get(windowId);
      if (win.type !== 'normal') return;
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab?.id !== undefined && tab.id !== getState().target?.tabId) void setTarget(tab.id);
    } catch {
      /* fenêtre fermée entre-temps */
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    const { target, status } = getState();
    if (!target || tabId !== target.tabId) return;
    setState({ target: { tabId, url: tab.url || target.url, title: tab.title || target.title, favIconUrl: tab.favIconUrl } });
    // Page chargée alors qu'aucun résultat n'est affiché (page interdite quittée, autorisation…) : on relance.
    if (info.status === 'complete' && status !== 'ready' && status !== 'loading') void analyze(tabId);
  });

  chrome.runtime.onMessage.addListener((msg: UiMessage) => {
    if (msg?.type === 'ui:setTarget') void setTarget(msg.tabId, { forceAnalyze: getState().status !== 'ready' });
    if (msg?.type === 'paginate:progress') onPaginationProgress(msg.job, msg.rows, msg.reset);
  });

  // Fermeture de la fenêtre : on retire la surbrillance de la page.
  window.addEventListener('pagehide', () => {
    const { analyzed } = getState();
    if (analyzed) sendToTab(analyzed.tabId, { type: 'clearHighlight' }).catch(() => undefined);
  });
}
