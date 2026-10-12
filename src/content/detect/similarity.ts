// Outils de comparaison de structure DOM.

import { renderedChildren, isSkippedTag } from '../traverse';

const STATE_CLASS =
  /^(active|selected|current|first|last|odd|even|hover|focus|focused|open|opened|closed|visible|hidden|show|shown|lazy|lazyload|lazyloaded|loaded|loading|clearfix|is-[\w-]+|has-[\w-]+|ng-[\w-]+|animated?|fade|in)$/i;
const LAYOUT_PREFIX = /^(col|row|w|h|m[trblxy]?|p[trblxy]?|gap|grid|span|order|offset|text|font|bg|flex|basis|sm|md|lg|xl)[-:]/i;

/** Retire le suffixe de hachage des CSS Modules : `card__a1B2c` → `card`. */
function stripModuleHash(c: string): string {
  return c.replace(/_{1,2}[A-Za-z0-9-]{5,8}$/, (m) => (/\d/.test(m) ? '' : m));
}

export function isHashyClass(c: string): boolean {
  if (/^(css|sc|jsx|emotion|svelte|tw|astro)-[A-Za-z0-9]+$/.test(c)) return true;
  if (LAYOUT_PREFIX.test(c)) return false;
  const digits = (c.match(/\d/g) || []).length;
  return digits >= 3 && digits / c.length > 0.25;
}

/** Classes « signifiantes » triées : sans classes d'état ni noms générés. */
export function normalizedClasses(el: Element): string[] {
  const out = new Set<string>();
  for (const raw of Array.from(el.classList)) {
    if (raw.length > 48 || STATE_CLASS.test(raw) || isHashyClass(raw)) continue;
    const c = stripModuleHash(raw);
    if (c) out.add(c);
  }
  return Array.from(out).sort();
}

/** Classes classées de la plus parlante à la moins parlante (mise en page en dernier). */
export function rankClasses(classes: string[]): string[] {
  return classes
    .map((c, i) => ({ c, i, w: LAYOUT_PREFIX.test(c) ? 2 : /^(js|is|has)-|^[a-z]{1,2}$/i.test(c) ? 1 : 0 }))
    .sort((a, b) => a.w - b.w || a.i - b.i)
    .map((x) => x.c);
}

export function signature(el: Element): string {
  const cls = normalizedClasses(el);
  return el.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : '');
}

export function jaccard<T>(a: Set<T> | T[], b: Set<T> | T[]): number {
  const sa = a instanceof Set ? a : new Set(a);
  const sb = b instanceof Set ? b : new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Empreinte structurelle d'un sous-arbre : ensemble des chemins de tags
 * jusqu'à une profondeur de 3 (ex. « div>a>img »).
 */
export function fingerprint(el: Element, maxDepth = 3, maxNodes = 120): Set<string> {
  const out = new Set<string>();
  const queue: Array<[Element, string, number]> = [[el, '', 0]];
  let seen = 0;
  while (queue.length && seen < maxNodes) {
    const [node, path, depth] = queue.shift()!;
    seen++;
    if (depth >= maxDepth) continue;
    for (const c of renderedChildren(node)) {
      if (isSkippedTag(c) && c.tagName !== 'svg' && c.tagName !== 'SVG') continue;
      const p = path + '>' + c.tagName.toLowerCase();
      out.add(p);
      queue.push([c, p, depth + 1]);
    }
  }
  return out;
}

/** Similarité structurelle moyenne d'un groupe (échantillonné pour la performance). */
export function groupSimilarity(items: Element[]): number {
  const sample = items.length <= 8 ? items : pickSpread(items, 8);
  const fps = sample.map((e) => fingerprint(e));
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      total += jaccard(fps[i], fps[j]);
      pairs++;
    }
  }
  return pairs ? total / pairs : 1;
}

export function pickSpread<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const out: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return out;
}
