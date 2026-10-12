// Service worker : ouvre la fenêtre Scrapy Easy et l'associe à l'onglet courant.

import { openOrFocusWindow, forgetWindow } from './window';

// Clic sur l'icône ou raccourci Alt+Maj+S (commande _execute_action).
chrome.action.onClicked.addListener((tab) => {
  void openOrFocusWindow(tab);
});

chrome.windows.onRemoved.addListener((windowId) => {
  void forgetWindow(windowId);
});
