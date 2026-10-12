// Parcours du DOM qui traverse le Shadow DOM ouvert et les iframes accessibles
// (même origine). Les iframes cross-origin sont ignorées sans erreur.

export const OVERLAY_TAG = 'scrapy-easy-overlay';

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'META',
  'LINK',
  'HEAD',
  'TITLE',
  'svg',
  'SVG',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'OBJECT',
  'EMBED',
  'SELECT',
  'OPTION',
  'BR',
  'HR',
  'WBR',
]);

export function isSkippedTag(el: Element): boolean {
  return SKIP_TAGS.has(el.tagName) || el.tagName.toLowerCase() === OVERLAY_TAG;
}

/** Enfants « rendus » d'un élément : ceux de son shadow root ouvert s'il en a un, plus ses enfants. */
export function renderedChildren(el: Element): Element[] {
  const sr = el.shadowRoot;
  // Les enfants « light » passés par <slot> restent affichés : on garde les deux.
  if (sr) return [...Array.from(sr.children), ...Array.from(el.children)];
  return Array.from(el.children);
}

/** Document d'une iframe si elle est accessible (même origine), sinon null. */
export function frameDocument(el: Element): Document | null {
  if (el.tagName !== 'IFRAME' && el.tagName !== 'FRAME') return null;
  try {
    const doc = (el as HTMLIFrameElement).contentDocument;
    return doc && doc.documentElement ? doc : null;
  } catch {
    return null;
  }
}

/**
 * Parcourt tous les éléments sous `root`, en profondeur, y compris shadow roots
 * ouverts et iframes accessibles. `maxElements` protège des pages gigantesques.
 */
export function* walkElements(root: Element, maxElements = 60000): Generator<Element> {
  const stack: Element[] = [root];
  let count = 0;
  while (stack.length) {
    const el = stack.pop()!;
    if (isSkippedTag(el)) continue;
    yield el;
    if (++count >= maxElements) return;
    const doc = frameDocument(el);
    if (doc) {
      stack.push(doc.documentElement);
      continue;
    }
    const kids = renderedChildren(el);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
}

/** Fenêtre (viewport) à laquelle appartient un élément, utile pour les iframes. */
export function ownerWindow(el: Element): Window {
  return el.ownerDocument.defaultView ?? window;
}

/**
 * Rectangle d'un élément dans les coordonnées du viewport de la page principale,
 * en tenant compte du décalage des iframes.
 */
export function topLevelRect(el: Element): DOMRect {
  const r = el.getBoundingClientRect();
  let x = r.left;
  let y = r.top;
  let win: Window | null = ownerWindow(el);
  while (win && win !== window.top && win.frameElement) {
    const fr = win.frameElement.getBoundingClientRect();
    x += fr.left;
    y += fr.top;
    win = win.parent;
  }
  return new DOMRect(x, y, r.width, r.height);
}

export function isRendered(el: Element): boolean {
  const anyEl = el as Element & { checkVisibility?: (o?: object) => boolean };
  if (typeof anyEl.checkVisibility === 'function') {
    return anyEl.checkVisibility({ visibilityProperty: true, opacityProperty: false });
  }
  const st = ownerWindow(el).getComputedStyle(el);
  return st.display !== 'none' && st.visibility !== 'hidden';
}

/** Texte d'un élément, y compris celui de ses shadow roots ouverts. */
export function deepText(el: Element, max = 2000): string {
  if (!hasShadowDescendant(el)) {
    return (el.textContent || '').slice(0, max);
  }
  let out = '';
  for (const e of walkElements(el, 3000)) {
    for (const n of Array.from(e.childNodes)) if (n.nodeType === Node.TEXT_NODE) out += n.textContent + ' ';
    if (out.length > max) break;
  }
  return out.slice(0, max);
}

/** Vrai si l'élément ou un de ses descendants (shadow DOM compris) correspond au sélecteur. */
export function deepHas(el: Element, selector: string): boolean {
  if (el.matches(selector) || el.querySelector(selector)) return true;
  if (!hasShadowDescendant(el)) return false;
  for (const e of walkElements(el, 3000)) if (e.matches(selector)) return true;
  return false;
}

/** Nombre de nœuds texte non vides (plafonné), shadow DOM compris. */
export function leafTextCount(el: Element, cap = 12): number {
  let n = 0;
  for (const e of walkElements(el, 3000)) {
    for (const c of Array.from(e.childNodes)) if (c.nodeType === Node.TEXT_NODE && (c.textContent || '').trim()) n++;
    if (n >= cap) return cap;
  }
  return n;
}

function hasShadowDescendant(el: Element): boolean {
  if (el.shadowRoot) return true;
  const all = el.getElementsByTagName('*');
  for (let i = 0; i < all.length && i < 2000; i++) if (all[i].shadowRoot) return true;
  return false;
}
