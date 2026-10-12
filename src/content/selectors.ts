// Génération de sélecteurs CSS lisibles et robustes.

import { normalizedClasses, rankClasses } from './detect/similarity';

/** Attributs stables, préférés aux classes souvent générées. */
const STABLE_ATTRS = ['data-component-type', 'data-testid', 'data-test', 'data-qa', 'itemtype', 'role'];
const STABLE_ROLES = new Set(['feed', 'list', 'listbox', 'grid', 'table', 'main', 'region', 'article', 'listitem', 'row']);

function stableAttr(el: Element): string {
  for (const a of STABLE_ATTRS) {
    const v = el.getAttribute(a);
    if (!v || v.length > 60) continue;
    if (a === 'role' && !STABLE_ROLES.has(v)) continue;
    return `[${a}="${CSS.escape(v)}"]`;
  }
  return '';
}

function isStableId(id: string): boolean {
  return (
    id.length < 48 &&
    !/\d{4,}/.test(id) &&
    !/^[a-f0-9-]{12,}$/i.test(id) &&
    !/^(ember|react|radix|headlessui|mui|:r)/i.test(id) &&
    !id.includes(':')
  );
}

function rootOf(el: Element): Document | ShadowRoot {
  const r = el.getRootNode();
  return r instanceof ShadowRoot || r instanceof Document ? r : el.ownerDocument;
}

function countMatches(root: Document | ShadowRoot, sel: string): number {
  try {
    return root.querySelectorAll(sel).length;
  } catch {
    return -1;
  }
}

/** Segment « tag.classe1.classe2 » d'un élément. */
export function elementSegment(el: Element, maxClasses = 2): string {
  const attr = stableAttr(el);
  const cls = rankClasses(normalizedClasses(el)).slice(0, attr ? 1 : maxClasses);
  return el.tagName.toLowerCase() + attr + cls.map((c) => '.' + CSS.escape(c)).join('');
}

/** Sélecteur qui identifie l'élément de manière unique dans son document / shadow root. */
export function uniqueSelector(el: Element): string {
  const root = rootOf(el);
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.tagName !== 'HTML') {
    if (cur.id && isStableId(cur.id)) {
      const idSel = '#' + CSS.escape(cur.id);
      parts.unshift(idSel);
      if (countMatches(root, idSel) === 1) break;
      parts.shift();
    }
    let seg = elementSegment(cur);
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => {
        try {
          return c.matches(seg);
        } catch {
          return false;
        }
      });
      if (same.length > 1) seg += `:nth-child(${Array.from(parent.children).indexOf(cur) + 1})`;
    }
    parts.unshift(seg);
    if (countMatches(root, parts.join(' > ')) === 1) break;
    cur = parent;
  }
  return parts.join(' > ');
}

/** Classes communes à tous les éléments, au format « tag.a.b ». */
export function commonSegment(items: Element[]): string {
  const tag = items[0].tagName.toLowerCase();
  const sample = items.slice(0, 50);
  let common = rankClasses(normalizedClasses(items[0]));
  for (const it of sample.slice(1)) {
    const cls = new Set(normalizedClasses(it));
    common = common.filter((c) => cls.has(c));
  }
  const attr = stableAttr(items[0]);
  const sharedAttr = attr && sample.every((it) => stableAttr(it) === attr) ? attr : '';
  return tag + sharedAttr + common.slice(0, sharedAttr ? 1 : 3).map((c) => '.' + CSS.escape(c)).join('');
}
