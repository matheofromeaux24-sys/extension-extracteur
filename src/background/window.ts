// Fenêtre popup détachée (720×800) qui reste ouverte pendant la navigation.

import type { UiMessage } from '../shared/types';

export const UI_PATH = 'src/ui/index.html';
const WIDTH = 720;
const HEIGHT = 800;
const KEY = 'uiWindowId';

async function storedWindowId(): Promise<number | null> {
  const data = await chrome.storage.session.get(KEY);
  return typeof data[KEY] === 'number' ? (data[KEY] as number) : null;
}

export async function forgetWindow(windowId: number): Promise<void> {
  if ((await storedWindowId()) === windowId) await chrome.storage.session.remove(KEY);
}

export async function openOrFocusWindow(tab: chrome.tabs.Tab): Promise<void> {
  const existing = await storedWindowId();
  if (existing !== null) {
    try {
      await chrome.windows.update(existing, { focused: true, drawAttention: true });
      if (tab.id !== undefined) {
        const msg: UiMessage = { type: 'ui:setTarget', tabId: tab.id };
        await chrome.runtime.sendMessage(msg).catch(() => undefined);
      }
      return;
    } catch {
      // La fenêtre a été fermée sans que l'on soit prévenu : on en ouvre une nouvelle.
      await chrome.storage.session.remove(KEY);
    }
  }

  // Placée à droite de la fenêtre du navigateur, sans déborder de l'écran.
  let left: number | undefined;
  let top: number | undefined;
  if (tab.windowId !== undefined) {
    try {
      const win = await chrome.windows.get(tab.windowId);
      if (win.left !== undefined && win.width !== undefined && win.top !== undefined) {
        left = Math.max(0, win.left + win.width - WIDTH - 16);
        top = Math.max(0, win.top + 72);
      }
    } catch {
      /* fenêtre introuvable : position par défaut */
    }
  }

  const url = chrome.runtime.getURL(`${UI_PATH}?tabId=${tab.id ?? ''}`);
  const created = await chrome.windows.create({ url, type: 'popup', width: WIDTH, height: HEIGHT, left, top, focused: true });
  if (created?.id !== undefined) await chrome.storage.session.set({ [KEY]: created.id });
}
