// Extraction des lignes d'une liste détectée.

import type { Column, Row } from '../shared/types';
import { buildColumns } from './detect/columns';
import { extractItemFields, extractRowFields, tableHeaders, type Field } from './detect/fields';
import type { Candidate } from './detect/listDetector';

function baseUrl(el: Element): string {
  return el.ownerDocument.baseURI || location.href;
}

export function itemFields(c: Pick<Candidate, 'isTable'>, items: Element[]): Field[][] {
  return items.map((it) =>
    c.isTable ? extractRowFields(it as HTMLTableRowElement, baseUrl(it)) : extractItemFields(it, baseUrl(it)),
  );
}

export function extractCandidate(c: Candidate): { columns: Column[]; rows: Row[] } {
  const fields = itemFields(c, c.items);
  if (c.isTable) {
    const table = c.items[0].closest('table');
    const headers = table ? tableHeaders(table).headers : [];
    return buildColumns(fields, { isTable: true, headers });
  }
  return buildColumns(fields);
}
