// Sélection d'un élément par clic sur la page (bouton « Page suivante »,
// « Charger plus »…). Les clics sont interceptés : le site ne réagit pas.

import type { PageControl } from '../shared/types';
import { absoluteUrl } from '../shared/url';
import { uniqueSelector } from './selectors';
import { PICKER_TAG } from './traverse';

const CLICKABLE = 'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]';

const CSS = `
:host { all: initial; }
.box { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 2147483647; box-sizing: border-box;
  border: 2px solid #2F9E6E; background: rgba(47,158,110,.15); border-radius: 6px; display: none; }
.bar { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647; pointer-events: none;
  background: #111; color: #fff; font: 500 13px/1.4 Inter, system-ui, sans-serif; padding: 10px 16px; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,.25); }
.bar b { color: #7be0b3; font-weight: 600; }
`;

let cancelCurrent: (() => void) | null = null;

export function cancelPick(): void {
  cancelCurrent?.();
}

function targetOf(e: Event): Element | null {
  const t = e.composedPath()[0];
  if (!(t instanceof Element)) return null;
  return t.closest(CLICKABLE) ?? t;
}

export function pickElement(message: string): Promise<PageControl | null> {
  cancelPick();
  return new Promise((resolve) => {
    const host = document.createElement(PICKER_TAG);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const box = document.createElement('div');
    box.className = 'box';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = message; // texte interne de l'extension, jamais issu de la page
    shadow.append(style, box, bar);
    document.documentElement.appendChild(host);

    const onMove = (e: MouseEvent) => {
      const el = targetOf(e);
      if (!el) return;
      const r = el.getBoundingClientRect();
      Object.assign(box.style, {
        display: 'block',
        transform: `translate(${r.left}px, ${r.top}px)`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
    };
    const block = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onClick = (e: MouseEvent) => {
      block(e);
      const el = targetOf(e);
      if (!el) return;
      const text = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      const href = el.tagName === 'A' ? absoluteUrl(el.getAttribute('href'), document.baseURI) : '';
      finish({ selector: uniqueSelector(el), label: text.slice(0, 60) || '…', href: href || undefined });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        block(e);
        finish(null);
      }
    };
    const events: Array<[string, EventListener]> = [
      ['mousemove', onMove as EventListener],
      ['click', onClick as EventListener],
      ['mousedown', block],
      ['mouseup', block],
      ['pointerdown', block],
      ['pointerup', block],
      ['keydown', onKey as EventListener],
    ];
    events.forEach(([t, fn]) => window.addEventListener(t, fn, true));

    function finish(result: PageControl | null) {
      events.forEach(([t, fn]) => window.removeEventListener(t, fn, true));
      host.remove();
      cancelCurrent = null;
      resolve(result);
    }
    cancelCurrent = () => finish(null);
  });
}
