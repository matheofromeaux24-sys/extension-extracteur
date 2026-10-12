// Service worker : ouvre la fenêtre Scrapy Easy, orchestre la pagination.

import type { BackgroundRequest } from '../shared/types';
import { handlePaginationMessage } from './pagination';
import { forgetWindow, openOrFocusWindow } from './window';

// Clic sur l'icône ou raccourci Alt+Maj+S (commande _execute_action).
chrome.action.onClicked.addListener((tab) => {
  void openOrFocusWindow(tab);
});

chrome.windows.onRemoved.addListener((windowId) => {
  void forgetWindow(windowId);
});

chrome.runtime.onMessage.addListener((msg: BackgroundRequest, sender, sendResponse) => {
  // Seules les pages de l'extension (pas les content scripts des sites) pilotent la pagination.
  const fromExtension = sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
  if (!fromExtension || typeof msg?.type !== 'string' || !msg.type.startsWith('paginate:')) return false;
  sendResponse(handlePaginationMessage(msg));
  return false;
});
