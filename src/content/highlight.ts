// Surbrillance des items de la liste sélectionnée : contour coloré + numéro.
// L'overlay vit dans un Shadow DOM fermé pour ne jamais hériter du CSS du site.

import { OVERLAY_TAG, topLevelRect } from './traverse';

const MAX_BOXES = 1500;
const COLOR = '#2F9E6E';

const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.box { position: fixed; left: 0; top: 0; box-sizing: border-box; border: 2px solid ${COLOR}; background: rgba(47,158,110,.07);
  border-radius: 6px; transition: opacity .15s; }
.badge { position: absolute; top: -10px; left: -10px; min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box;
  border-radius: 10px; background: ${COLOR}; color: #fff; font: 600 11px/20px Inter, system-ui, sans-serif;
  text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.container { position: fixed; left: 0; top: 0; box-sizing: border-box; border: 2px dashed ${COLOR}; border-radius: 10px; }
`;

export class Highlighter {
  private host: HTMLElement | null = null;
  private layer: HTMLDivElement | null = null;
  private items: Element[] = [];
  private container: Element | null = null;
  private boxes: HTMLDivElement[] = [];
  private containerBox: HTMLDivElement | null = null;
  private frame = 0;
  private interval = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onChange = () => this.schedule();

  show(items: Element[], container: Element | null): void {
    this.ensureHost();
    this.items = items.slice(0, MAX_BOXES);
    this.container = container;
    const layer = this.layer!;
    layer.textContent = '';
    this.boxes = this.items.map((_, i) => {
      const box = document.createElement('div');
      box.className = 'box';
      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = String(i + 1);
      box.appendChild(badge);
      layer.appendChild(box);
      return box;
    });
    this.containerBox = null;
    if (container) {
      this.containerBox = document.createElement('div');
      this.containerBox.className = 'container';
      layer.appendChild(this.containerBox);
    }
    this.update();
    window.addEventListener('scroll', this.onChange, { capture: true, passive: true });
    window.addEventListener('resize', this.onChange, { passive: true });
    window.clearInterval(this.interval);
    // Les pages bougent (images qui se chargent, carrousels) : recalage immédiat
    // quand la taille du conteneur change, et régulier en filet de sécurité.
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(this.onChange);
    if (container) this.resizeObserver.observe(container);
    this.items.slice(0, 200).forEach((el) => this.resizeObserver!.observe(el));
    this.interval = window.setInterval(this.onChange, 600);
  }

  /** Fait défiler la page jusqu'au premier item. */
  reveal(): void {
    const first = this.items[0];
    if (!first) return;
    const r = first.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight - 80) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  clear(): void {
    window.removeEventListener('scroll', this.onChange, { capture: true });
    window.removeEventListener('resize', this.onChange);
    window.clearInterval(this.interval);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    cancelAnimationFrame(this.frame);
    this.host?.remove();
    this.host = null;
    this.layer = null;
    this.items = [];
    this.boxes = [];
  }

  private ensureHost(): void {
    if (this.host && this.host.isConnected) return;
    document.querySelectorAll(OVERLAY_TAG).forEach((n) => n.remove());
    this.host = document.createElement(OVERLAY_TAG);
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.layer = document.createElement('div');
    this.layer.className = 'layer';
    shadow.append(style, this.layer);
    document.documentElement.appendChild(this.host);
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.update());
  }

  private update(): void {
    const vh = window.innerHeight;
    // Toutes les lectures d'abord, puis toutes les écritures : alterner les deux
    // forcerait un recalcul de mise en page par item (très lent sur 10 000 items).
    const rects = this.items.map((el) => (el.isConnected ? topLevelRect(el) : null));
    const containerRect = this.containerBox && this.container?.isConnected ? topLevelRect(this.container) : null;
    rects.forEach((r, i) => {
      const box = this.boxes[i];
      if (!r || r.width === 0 || r.bottom < -50 || r.top > vh + 50) {
        if (box.style.display !== 'none') box.style.display = 'none';
        return;
      }
      box.style.display = 'block';
      box.style.transform = `translate(${r.left}px, ${r.top}px)`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    });
    if (this.containerBox && containerRect) {
      const pad = 4;
      this.containerBox.style.transform = `translate(${containerRect.left - pad}px, ${containerRect.top - pad}px)`;
      this.containerBox.style.width = `${containerRect.width + pad * 2}px`;
      this.containerBox.style.height = `${containerRect.height + pad * 2}px`;
    }
  }
}
