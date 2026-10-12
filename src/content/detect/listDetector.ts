// Détection automatique des listes répétitives d'une page.
//
// 1. On regroupe les enfants de chaque élément en « familles » de frères au
//    même tag et aux classes proches (Jaccard ≥ 0,5).
// 2. Les familles « cousines » (même structure, parents frères identiques,
//    ex. une grille découpée en rangées) sont fusionnées.
// 3. Chaque famille reçoit un score : nombre d'items × richesse du contenu
//    (texte, liens, images, prix) × surface visible × similarité structurelle,
//    avec des pénalités pour les menus, en-têtes et pieds de page.

import { commonSegment, elementSegment, uniqueSelector } from '../selectors';
import { deepHas, deepText, isRendered, isSkippedTag, leafTextCount, renderedChildren, topLevelRect, walkElements } from '../traverse';
import { looksLikePrice } from './fieldTypes';
import { groupSimilarity, jaccard, normalizedClasses, pickSpread, signature } from './similarity';

export interface Candidate {
  items: Element[];
  /** Élément commun qui contient les items (parent ou grand-parent si fusion). */
  container: Element;
  score: number;
  isTable: boolean;
  selector: string;
  /** Vrai si la liste réunit plusieurs conteneurs frères (grille en rangées). */
  merged: boolean;
}

interface RawGroup {
  parent: Element;
  items: Element[];
  sig: string;
}

const MIN_ITEMS = 3;
/** Les cellules ne sont jamais des items : on extrait les lignes <tr>. */
const NEVER_ITEMS = new Set(['TD', 'TH', 'THEAD', 'TBODY', 'TFOOT', 'COLGROUP', 'COL', 'CAPTION', 'SOURCE', 'TRACK', 'PARAM', 'AREA']);
const MAX_CANDIDATES = 12;
const NAV_RE = /(^|[^a-z])(nav|navbar|menu|header|footer|breadcrumb|pagination|pager|social|share|lang|cookie)([^a-z]|$)/;

function clusterSiblings(kids: Element[]): Array<{ sig: string; items: Element[] }> {
  const clusters: Array<{ tag: string; cls: Set<string>; sig: string; items: Element[] }> = [];
  for (const k of kids) {
    if (isSkippedTag(k) || NEVER_ITEMS.has(k.tagName)) continue;
    const tag = k.tagName;
    const cls = new Set(normalizedClasses(k));
    const match = clusters.find((c) => c.tag === tag && jaccard(c.cls, cls) >= 0.5);
    if (match) match.items.push(k);
    else clusters.push({ tag, cls, sig: signature(k), items: [k] });
  }
  return clusters.map((c) => ({ sig: c.sig, items: c.items }));
}

function collectGroups(root: Element): RawGroup[] {
  const groups: RawGroup[] = [];
  for (const el of walkElements(root)) {
    const kids = renderedChildren(el);
    if (kids.length < 2) continue;
    for (const c of clusterSiblings(kids)) {
      // Seuil bas ici : deux rangées de 2 cartes peuvent encore être fusionnées.
      if (c.items.length >= 2) groups.push({ parent: el, items: c.items, sig: c.sig });
    }
  }
  return groups;
}

/** Fusionne les groupes dont les parents sont des frères identiques (grilles en rangées). */
function mergeCousins(groups: RawGroup[]): Array<RawGroup & { container: Element; merged: boolean }> {
  const buckets = new Map<string, RawGroup[]>();
  const gpIds = new Map<Element, number>();
  for (const g of groups) {
    const gp = g.parent.parentElement;
    if (!gp) continue;
    if (!gpIds.has(gp)) gpIds.set(gp, gpIds.size);
    const key = `${gpIds.get(gp)}|${signature(g.parent)}|${g.sig}`;
    const b = buckets.get(key);
    if (b) b.push(g);
    else buckets.set(key, [g]);
  }
  const mergedAway = new Set<RawGroup>();
  const out: Array<RawGroup & { container: Element; merged: boolean }> = [];
  for (const b of buckets.values()) {
    if (b.length < 2) continue;
    b.forEach((g) => mergedAway.add(g));
    out.push({
      parent: b[0].parent,
      container: b[0].parent.parentElement!,
      items: b.flatMap((g) => g.items),
      sig: b[0].sig,
      merged: true,
    });
  }
  for (const g of groups) if (!mergedAway.has(g)) out.push({ ...g, container: g.parent, merged: false });
  return out;
}

function textLen(el: Element): number {
  return Math.min(400, deepText(el, 1200).replace(/\s+/g, ' ').trim().length);
}

function insideNavigation(el: Element): boolean {
  let cur: Element | null = el;
  for (let depth = 0; cur && depth < 12; depth++, cur = cur.parentElement) {
    const tag = cur.tagName;
    if (tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER') return true;
    const role = cur.getAttribute('role');
    if (role === 'navigation' || role === 'menubar' || role === 'menu' || role === 'tablist' || role === 'contentinfo' || role === 'banner') return true;
    if (NAV_RE.test(((cur.id || '') + ' ' + (typeof cur.className === 'string' ? cur.className : '')).toLowerCase())) return true;
  }
  return false;
}

function scoreGroup(items: Element[], container: Element, vw: number, vh: number): number {
  const sample = pickSpread(items, 40);
  const isRow = items[0].tagName === 'TR';
  const rects = sample.map((e) => topLevelRect(e));
  const visible = rects.filter((r) => r.width > 0 && r.height > 0).length / sample.length;
  if (visible < 0.5) return 0;

  const n = items.length;
  const avgText = sample.reduce((s, e) => s + textLen(e), 0) / sample.length;
  const linkFrac = sample.filter((e) => deepHas(e, 'a[href]')).length / sample.length;
  const imgFrac = sample.filter((e) => deepHas(e, 'img, picture, [style*="background-image"]')).length / sample.length;
  const priceFrac = sample.filter((e) => looksLikePrice(deepText(e).replace(/\s+/g, ' '))).length / sample.length;
  const leafs = pickSpread(sample, 6).reduce((s, e) => s + leafTextCount(e), 0) / Math.min(6, sample.length);

  const avgArea = rects.reduce((s, r) => s + Math.min(r.width, vw) * r.height, 0) / rects.length;
  const avgHeight = rects.reduce((s, r) => s + r.height, 0) / rects.length;
  const areaRatio = (avgArea * n) / (vw * vh);
  const similarity = groupSimilarity(items);
  if (similarity < 0.25 && !isRow) return 0;

  const richness =
    1 + linkFrac * 0.8 + imgFrac * 0.8 + priceFrac * 1.2 + (Math.min(avgText, 200) / 200) * 1.5 + (Math.min(leafs, 8) / 8) * 1.5;
  const areaScore = Math.min(1.6, 0.3 + Math.sqrt(areaRatio));
  let score = Math.log2(n + 1) * richness * areaScore * (0.4 + similarity);

  if (insideNavigation(container)) score *= 0.35;
  if (avgText < 4 && imgFrac < 0.5) score *= 0.2;
  if (avgHeight < 12) score *= 0.3;
  if (leafs <= 1.2 && avgText < 30 && imgFrac < 0.3) score *= 0.35; // simple liste de liens / menu
  if (avgArea > vw * vh * 0.6 && n < 6) score *= 0.3; // grandes sections de mise en page
  if (isRow && container.closest('table')?.querySelector('th')) score *= 1.3;
  return score;
}

function prescore(g: { items: Element[] }): number {
  const sample = pickSpread(g.items, 12);
  const avgText = sample.reduce((s, e) => s + textLen(e), 0) / sample.length;
  return Math.log2(g.items.length + 1) * (1 + Math.min(avgText, 200) / 60);
}

export function buildSelector(container: Element, items: Element[], merged: boolean): string {
  try {
    const itemSeg = commonSegment(items);
    if (merged && items[0].parentElement) {
      return `${uniqueSelector(container)} > ${elementSegment(items[0].parentElement, 1)} > ${itemSeg}`;
    }
    return `${uniqueSelector(container)} > ${itemSeg}`;
  } catch {
    return '';
  }
}

export function detectLists(root: Element = document.documentElement): Candidate[] {
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 800;
  const merged = mergeCousins(collectGroups(root));

  const eligible = merged
    .map((g) => {
      let items = g.items.filter((e) => isRendered(e));
      if (items[0]?.tagName === 'TR') {
        // La ligne d'en-tête (uniquement des <th>) n'est pas une donnée.
        items = items.filter((tr) => Array.from((tr as HTMLTableRowElement).cells).some((c) => c.tagName === 'TD'));
      }
      return { ...g, items };
    })
    .filter((g) => g.items.length >= (g.items[0]?.tagName === 'TR' ? 2 : MIN_ITEMS));

  const shortlisted = eligible
    .map((g) => ({ g, pre: prescore(g) }))
    .sort((a, b) => b.pre - a.pre)
    .slice(0, 80);

  const scored: Candidate[] = [];
  for (const { g } of shortlisted) {
    const score = scoreGroup(g.items, g.container, vw, vh);
    if (score <= 0) continue;
    scored.push({
      items: g.items,
      container: g.container,
      score,
      isTable: g.items[0].tagName === 'TR',
      selector: '',
      merged: g.merged,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  const result = scored.filter((c) => c.score >= top * 0.04).slice(0, MAX_CANDIDATES);
  for (const c of result) c.selector = buildSelector(c.container, c.items, c.merged);
  return result;
}
