// Retrouve la liste à extraire : après un défilement (nouveaux items ajoutés au
// même conteneur) ou sur une nouvelle page du site (sélecteur, puis détection).

import type { Column, ListDef } from '../shared/types';
import { detectLists, type Candidate } from './detect/listDetector';
import { jaccard, normalizedClasses, signature } from './detect/similarity';
import { itemFields } from './extract';
import { isRendered, renderedChildren } from './traverse';

export interface ActiveList {
  def: ListDef;
  container: Element;
  /** Items répartis dans plusieurs conteneurs frères (grille en rangées). */
  merged: boolean;
  parentSig: string;
  tag: string;
  classes: string[];
}

function isDataRow(el: Element): boolean {
  return el.tagName !== 'TR' || Array.from((el as HTMLTableRowElement).cells).some((c) => c.tagName === 'TD');
}

function describe(def: ListDef, items: Element[], container: Element, merged: boolean): ActiveList {
  const first = items[0];
  return {
    def,
    container,
    merged,
    parentSig: first.parentElement ? signature(first.parentElement) : '',
    tag: first.tagName,
    classes: normalizedClasses(first),
  };
}

export function fromCandidate(c: Candidate): ActiveList {
  return describe({ selector: c.selector, isTable: c.isTable }, c.items, c.container, c.merged);
}

function fromItems(def: ListDef, items: Element[]): ActiveList {
  const parents = new Set(items.map((e) => e.parentElement ?? (e.getRootNode() as ShadowRoot).host));
  if (parents.size === 1) return describe(def, items, [...parents][0]!, false);
  const gp = items[0].parentElement?.parentElement ?? items[0].parentElement!;
  return describe(def, items, gp, true);
}

/** Items actuellement présents dans la liste (y compris ceux chargés depuis). */
export function currentItems(a: ActiveList): Element[] {
  if (!a.container.isConnected) return [];
  const parents = a.merged ? renderedChildren(a.container).filter((p) => signature(p) === a.parentSig) : [a.container];
  return parents
    .flatMap((p) => renderedChildren(p))
    .filter((e) => e.tagName === a.tag && jaccard(normalizedClasses(e), a.classes) >= 0.5 && isDataRow(e) && isRendered(e));
}

function bySelector(def: ListDef): Element[] {
  try {
    return Array.from(document.querySelectorAll(def.selector)).filter((e) => isDataRow(e) && isRendered(e));
  } catch {
    return [];
  }
}

/** Part des colonnes connues retrouvées dans les items d'une liste candidate. */
function columnOverlap(c: Candidate, columns: Column[]): number {
  const wanted = new Set(columns.map((col) => col.key));
  if (!wanted.size) return 0;
  const found = new Set<string>();
  for (const fields of itemFields(c, c.items.slice(0, 5))) for (const f of fields) if (wanted.has(f.key)) found.add(f.key);
  return found.size / wanted.size;
}

export function resolveList(def: ListDef, columns: Column[], preferred: ActiveList | null): ActiveList | null {
  if (preferred && preferred.def.selector === def.selector && currentItems(preferred).length) return preferred;

  const items = bySelector(def);
  if (items.length) return fromItems(def, items);

  // Le sélecteur ne correspond plus (mise en page différente) : on re-détecte et on
  // garde la liste qui contient le plus de colonnes déjà connues.
  let best: Candidate | null = null;
  let bestOverlap = 0.3;
  for (const c of detectLists()) {
    const o = columnOverlap(c, columns);
    if (o > bestOverlap) {
      best = c;
      bestOverlap = o;
    }
  }
  return best ? { ...fromCandidate(best), def } : null;
}
