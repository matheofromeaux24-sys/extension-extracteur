// Sélection par clic sur la page : survol surligné, bandeau d'instructions avec
// boutons, clics interceptés (le site ne réagit pas). Sert à choisir le bouton
// de pagination, la liste à extraire et les colonnes à ajouter.

import type { PageControl } from '../shared/types';
import { absoluteUrl } from '../shared/url';
import { uniqueSelector } from './selectors';
import { PICKER_TAG } from './traverse';

const CLICKABLE = 'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]';

const CSS = `
:host { all: initial; }
.box { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 2147483647; box-sizing: border-box;
  border: 2px solid #2F9E6E; background: rgba(47,158,110,.15); border-radius: 6px; display: none; }
.bar { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
  display: flex; align-items: center; gap: 12px; max-width: min(720px, calc(100vw - 24px));
  background: #111; color: #fff; font: 500 13px/1.4 Inter, system-ui, sans-serif; padding: 10px 12px 10px 16px;
  border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
.bar b { color: #7be0b3; font-weight: 600; }
.bar .flash { color: #fbbf24; }
button { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 8px; font: 600 12px/1 Inter, system-ui, sans-serif;
  background: rgba(255,255,255,.12); color: #fff; white-space: nowrap; }
button:hover { background: rgba(255,255,255,.2); }
button.primary { background: #2F9E6E; }
button.primary:hover { background: #278a5f; }
`;

export interface PickerButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface PickerOptions {
  /** Élément réellement visé à partir de l'élément survolé. */
  resolveTarget?: (raw: Element) => Element;
  onPick: (el: Element) => void;
  onCancel: () => void;
  onEnter?: () => void;
}

let active: PickerOverlay | null = null;

/** Annule toute sélection en cours sur la page. */
export function cancelPick(): void {
  active?.cancel();
}

export class PickerOverlay {
  private host = document.createElement(PICKER_TAG);
  private box: HTMLDivElement;
  private bar: HTMLDivElement;
  private events: Array<[string, EventListener]>;

  constructor(private opts: PickerOptions) {
    active?.cancel();
    active = this;
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.box = document.createElement('div');
    this.box.className = 'box';
    this.bar = document.createElement('div');
    this.bar.className = 'bar';
    shadow.append(style, this.box, this.bar);
    document.documentElement.appendChild(this.host);

    const own = (e: Event) => e.target === this.host;
    const block = (e: Event) => {
      if (own(e)) return; // clics sur le bandeau : laissés à ses boutons
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onMove = (e: Event) => {
      if (own(e)) return void (this.box.style.display = 'none');
      const el = this.target(e);
      if (el) this.outline(el);
    };
    const onClick = (e: Event) => {
      if (own(e)) return;
      block(e);
      const el = this.target(e);
      if (el) this.opts.onPick(el);
    };
    const onKey = (e: Event) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Escape') {
        block(e);
        this.cancel();
      } else if (k === 'Enter' && this.opts.onEnter) {
        block(e);
        this.opts.onEnter();
      }
    };
    this.events = [
      ['mousemove', onMove],
      ['click', onClick],
      ['mousedown', block],
      ['mouseup', block],
      ['pointerdown', block],
      ['pointerup', block],
      ['auxclick', block],
      ['keydown', onKey],
    ];
    this.events.forEach(([t, fn]) => window.addEventListener(t, fn, true));
  }

  private target(e: Event): Element | null {
    const t = e.composedPath()[0];
    if (!(t instanceof Element)) return null;
    return this.opts.resolveTarget ? this.opts.resolveTarget(t) : t;
  }

  private outline(el: Element): void {
    const r = el.getBoundingClientRect();
    Object.assign(this.box.style, {
      display: 'block',
      transform: `translate(${r.left}px, ${r.top}px)`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }

  /** Met à jour le bandeau. `html` provient toujours des textes de l'extension, jamais de la page. */
  setBanner(html: string, buttons: PickerButton[] = [], flash = false): void {
    this.bar.textContent = '';
    const text = document.createElement('span');
    text.innerHTML = html;
    if (flash) text.className = 'flash';
    this.bar.appendChild(text);
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.primary) btn.className = 'primary';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        b.onClick();
      });
      this.bar.appendChild(btn);
    }
  }

  destroy(): void {
    this.events.forEach(([t, fn]) => window.removeEventListener(t, fn, true));
    this.host.remove();
    if (active === this) active = null;
  }

  cancel(): void {
    this.destroy();
    this.opts.onCancel();
  }
}

/** Choix d'un bouton ou lien (pagination). */
export function pickElement(banner: string, cancelLabel: string): Promise<PageControl | null> {
  return new Promise((resolve) => {
    const overlay = new PickerOverlay({
      resolveTarget: (raw) => raw.closest(CLICKABLE) ?? raw,
      onPick: (el) => {
        overlay.destroy();
        const text = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        const href = el.tagName === 'A' ? absoluteUrl(el.getAttribute('href'), document.baseURI) : '';
        resolve({ selector: uniqueSelector(el), label: text.slice(0, 60) || '…', href: href || undefined });
      },
      onCancel: () => resolve(null),
    });
    overlay.setBanner(banner, [{ label: cancelLabel, onClick: () => overlay.cancel() }]);
  });
}
