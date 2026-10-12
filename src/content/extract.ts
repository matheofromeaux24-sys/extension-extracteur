// Extraction des lignes d'une liste détectée.

import { RAW_KEY, type Column, type Row } from '../shared/types';
import { buildColumns } from './detect/columns';
import { extractItemFields, extractRowFields, fullText, tableHeaders, type Field } from './detect/fields';
import type { Candidate } from './detect/listDetector';

function baseUrl(el: Element): string {
  return el.ownerDocument.baseURI || location.href;
}

export function itemFields(c: Pick<Candidate, 'isTable'>, items: Element[]): Field[][] {
  return items.map((it) =>
    c.isTable ? extractRowFields(it as HTMLTableRowElement, baseUrl(it)) : extractItemFields(it, baseUrl(it)),
  );
}

/** Ajoute à chaque ligne le texte brut de son item. */
export function withRawText(rows: Row[], items: Element[]): Row[] {
  rows.forEach((r, i) => {
    if (items[i]) r[RAW_KEY] = fullText(items[i]).slice(0, 1500);
  });
  return rows;
}

export function extractCandidate(c: Candidate): { columns: Column[]; rows: Row[] } {
  const fields = itemFields(c, c.items);
  let out: { columns: Column[]; rows: Row[] };
  if (c.isTable) {
    const table = c.items[0].closest('table');
    const headers = table ? tableHeaders(table).headers : [];
    out = buildColumns(fields, { isTable: true, headers });
  } else out = buildColumns(fields);
  withRawText(out.rows, c.items);
  return out;
}
