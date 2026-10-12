// Sélecteur visuel : choisir la liste à extraire (1 ou 2 clics) et ajouter une
// colonne en cliquant sur une donnée.

import { format, messages } from '../shared/i18n';
import type { Column, ListDef, Row } from '../shared/types';
import { makeColumn, rowsForColumns } from './detect/columns';
import { extractItemFields, extractRowFields, type Field } from './detect/fields';
import { buildSelector, type Candidate } from './detect/listDetector';
import { groupSimilarity, jaccard, normalizedClasses, pickSpread } from './detect/similarity';
import { itemFields } from './extract';
import type { Highlighter } from './highlight';
import { currentItems, type ActiveList } from './listResolver';
import { PickerOverlay } from './picker';
import { deepText, isRendered, isSkippedTag, leafTextCount, renderedChildren } from './traverse';

const M = messages.picker;

function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function ancestors(el: Element, max = 25): Element[] {
  const out: Element[] = [];
  for (let cur: Element | null = el; cur && cur.tagName !== 'BODY' && cur.tagName !== 'HTML' && out.length < max; cur = parentOf(cur)) {
    out.push(cur);
  }
  return out;
}

function similar(a: Element, b: Element): boolean {
  return a.tagName === b.tagName && jaccard(normalizedClasses(a), normalizedClasses(b)) >= 0.5;
}

/** Frères de `el` (lui compris) qui lui ressemblent. */
function similarSiblings(el: Element): Element[] {
  const parent = parentOf(el);
  if (!parent) return [el];
  const kids = parent.shadowRoot && el.getRootNode() === parent.shadowRoot ? Array.from(parent.shadowRoot.children) : renderedChildren(parent);
  return kids.filter((k) => !isSkippedTag(k) && isRendered(k) && (k === el || similar(k, el)));
}

/** Valeur d'un groupe : nombre d'items × richesse du contenu × ressemblance. */
function groupScore(items: Element[]): number {
  const sample = pickSpread(items, 8);
  const avgText = sample.reduce((s, e) => s + Math.min(300, deepText(e, 900).replace(/\s+/g, ' ').trim().length), 0) / sample.length;
  const leafs = sample.reduce((s, e) => s + leafTextCount(e), 0) / sample.length;
  return Math.log2(items.length + 1) * (1 + avgText / 100) * (leafs >= 2 ? 1.5 : 1) * (0.3 + groupSimilarity(items));
}

export interface PickedList {
  items: Element[];
  container: Element;
  merged: boolean;
}

/** Un seul clic : on remonte les ancêtres et on garde le niveau le plus « liste ». */
export function inferFromOne(el: Element): PickedList {
  let best: PickedList | null = null;
  let bestScore = 0;
  for (const a of ancestors(el, 15)) {
    const sibs = similarSiblings(a);
    if (sibs.length < 2) continue;
    const score = groupScore(sibs);
    if (score > bestScore) {
      bestScore = score;
      best = { items: sibs, container: parentOf(a)!, merged: false };
    }
  }
  return best ?? { items: [el], container: parentOf(el) ?? el, merged: false };
}

/** Deux clics : les items sont les enfants de l'ancêtre commun qui contiennent chaque clic. */
export function inferFromTwo(a: Element, b: Element): PickedList {
  const chainB = ancestors(b, 40);
  const setB = new Set(chainB);
  const chainA = ancestors(a, 40);
  for (let i = 0; i < chainA.length; i++) {
    const lca = parentOf(chainA[i]);
    if (!lca || !setB.has(lca)) continue;
    const x = chainA[i];
    const y = chainB[chainB.indexOf(lca) - 1];
    if (!y || x === y) break; // les deux clics sont dans le même élément
    if (similar(x, y) || x.tagName === y.tagName) {
      const ref = new Set([...normalizedClasses(x)].filter((c) => normalizedClasses(y).includes(c)));
      const kids = renderedChildren(lca).filter(
        (k) => k.tagName === x.tagName && isRendered(k) && (k === x || k === y || similar(k, x) || similar(k, y) || (ref.size > 0 && jaccard(normalizedClasses(k), ref) >= 0.5)),
      );
      return { items: kids, container: lca, merged: false };
    }
    // Grille en rangées : x et y sont deux rangées, les items sont un niveau plus bas.
    const x2 = chainA[i - 1];
    const y2 = chainB[chainB.indexOf(lca) - 2];
    if (x2 && y2 && similar(x2, y2)) {
      const items = renderedChildren(lca)
        .filter((row) => row.tagName === x.tagName || row.tagName === y.tagName)
        .flatMap((row) => renderedChildren(row).filter((k) => isRendered(k) && similar(k, x2)));
      return { items, container: lca, merged: true };
    }
    break;
  }
  return inferFromOne(b);
}

function toCandidate(p: PickedList): Candidate {
  const isTable = p.items[0].tagName === 'TR';
  const items = isTable ? p.items.filter((tr) => Array.from((tr as HTMLTableRowElement).cells).some((c) => c.tagName === 'TD')) : p.items;
  return { items, container: p.container, merged: p.merged, isTable, score: 0, selector: buildSelector(p.container, items, p.merged) };
}

/** Sélection de la liste par clic, avec aperçu surligné en direct. */
export function pickList(highlighter: Highlighter, restore: () => void): Promise<Candidate | null> {
  return new Promise((resolve) => {
    let first: Element | null = null;
    let picked: PickedList | null = null;
    const done = (c: Candidate | null) => {
      overlay.destroy();
      resolve(c);
    };
    const validate = () => {
      if (picked && picked.items.length) done(toCandidate(picked));
    };
    const cancel = () => {
      restore();
      resolve(null);
    };
    const overlay = new PickerOverlay({
      onPick: (el) => {
        picked = first && first !== el && !first.contains(el) && !el.contains(first) ? inferFromTwo(first, el) : inferFromOne(el);
        first = first ?? el;
        highlighter.show(picked.items, picked.container);
        overlay.setBanner(format(picked.items.length > 1 ? M.listFound : M.listFoundOne, { count: picked.items.length }), [
          { label: M.validate, primary: true, onClick: validate },
          { label: M.restart, onClick: restart },
          { label: M.cancel, onClick: () => overlay.cancel() },
        ]);
      },
      onEnter: validate,
      onCancel: cancel,
    });
    const restart = () => {
      first = null;
      picked = null;
      highlighter.clear();
      overlay.setBanner(M.listStart, [{ label: M.cancel, onClick: () => overlay.cancel() }]);
    };
    highlighter.clear();
    overlay.setBanner(M.listStart, [{ label: M.cancel, onClick: () => overlay.cancel() }]);
  });
}

const TYPE_PREFERENCE: Record<Field['type'], number> = { text: 0, aria: 1, href: 2, src: 3 };

/** Champ correspondant à l'élément cliqué : lui-même, un descendant, puis un ancêtre. */
function fieldFor(el: Element, item: Element, track: Map<Element, Field[]>): Field | null {
  const pick = (fields: Field[] | undefined) =>
    fields?.slice().sort((a, b) => TYPE_PREFERENCE[a.type] - TYPE_PREFERENCE[b.type])[0] ?? null;
  const own = pick(track.get(el));
  if (own) return own;
  const inside = Array.from(track.entries())
    .filter(([node]) => node !== el && el.contains(node))
    .flatMap(([, fields]) => fields)
    .sort((a, b) => TYPE_PREFERENCE[a.type] - TYPE_PREFERENCE[b.type] || a.order - b.order)[0];
  if (inside) return inside;
  for (let cur = parentOf(el); cur && cur !== parentOf(item); cur = parentOf(cur)) {
    const f = pick(track.get(cur));
    if (f) return f;
  }
  return null;
}

export interface ColumnPickResult {
  columns: Column[];
  rows: Row[];
  added: Column | null;
}

/** Ajout d'une colonne : clic sur une donnée à l'intérieur d'un item surligné. */
export function pickColumn(active: ActiveList, columns: Column[], highlighter: Highlighter): Promise<ColumnPickResult | null> {
  return new Promise((resolve) => {
    let cols = columns.slice();
    let added: Column | null = null;
    const def: ListDef = active.def;
    const items = currentItems(active);
    highlighter.show(items, active.container);

    const finish = () => {
      overlay.destroy();
      resolve({ columns: cols, rows: rowsForColumns(itemFields(def, currentItems(active)), cols), added });
    };
    const buttons = () => [
      ...(added ? [{ label: M.done, primary: true, onClick: finish }] : []),
      { label: added ? M.close : M.cancel, onClick: () => (added ? finish() : overlay.cancel()) },
    ];
    const overlay = new PickerOverlay({
      onPick: (el) => {
        const item = items.find((it) => it === el || it.contains(el) || (el.getRootNode() instanceof ShadowRoot && it.contains((el.getRootNode() as ShadowRoot).host)));
        if (!item) return overlay.setBanner(M.columnOutside, buttons(), true);
        let key: string | null = null;
        if (def.isTable) {
          const cell = el.closest('td, th') as HTMLTableCellElement | null;
          if (cell) {
            let idx = 0;
            for (const c of Array.from((item as HTMLTableRowElement).cells)) {
              if (c === cell) break;
              idx += Math.max(1, c.colSpan || 1);
            }
            const field = extractRowFields(item as HTMLTableRowElement, document.baseURI).find((f) => f.key === `cell${idx}`);
            key = field?.key ?? null;
          }
        } else {
          const track = new Map<Element, Field[]>();
          extractItemFields(item, item.ownerDocument.baseURI, track);
          key = fieldFor(el, item, track)?.key ?? null;
        }
        if (!key) return overlay.setBanner(M.columnEmpty, buttons(), true);
        const existing = cols.find((c) => c.key === key && !c.derive);
        if (existing) return overlay.setBanner(format(M.columnExists, { name: existing.name }), buttons(), true);
        added = makeColumn(itemFields(def, items), key, cols);
        cols = [...cols, added];
        overlay.setBanner(format(M.columnAdded, { name: added.name }), buttons());
      },
      onEnter: () => added && finish(),
      onCancel: () => resolve(null),
    });
    overlay.setBanner(M.columnStart, buttons());
  });
}
