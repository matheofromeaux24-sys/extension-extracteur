// Export des résultats : TSV (presse-papiers), CSV avec BOM, XLSX.

import type { Column, Row } from '../../shared/types';

export function toMatrix(columns: Column[], rows: Row[]): string[][] {
  return [columns.map((c) => c.name), ...rows.map((r) => columns.map((c) => r[c.id] ?? ''))];
}

/**
 * Neutralise les valeurs qu'Excel ou Google Sheets interpréteraient comme des
 * formules (« =HYPERLINK(...) » venant d'une page malveillante).
 * Les nombres négatifs (« -20 % ») et les téléphones (« +33… ») sont conservés.
 */
export function neutralizeFormula(v: string): string {
  return /^[=@\t\r]/.test(v) || /^[+-][^\d\s.,]/.test(v) ? `'${v}` : v;
}

export function toTSV(columns: Column[], rows: Row[]): string {
  return toMatrix(columns, rows)
    .map((line) => line.map((v) => neutralizeFormula(v.replace(/[\t\r\n]+/g, ' '))).join('\t'))
    .join('\n');
}

export function toCSV(columns: Column[], rows: Row[], sep: ',' | ';'): string {
  const escape = (raw: string) => {
    const v = neutralizeFormula(raw);
    return /[",;\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
  };
  // BOM UTF-8 : Excel affiche alors correctement les accents.
  return '\uFEFF' + toMatrix(columns, rows).map((line) => line.map(escape).join(sep)).join('\r\n');
}

/** Nom automatique : domaine_AAAA-MM-JJ_HH-MM. */
export function fileBaseName(domain: string, date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const safe = (domain || 'export').replace(/[^a-z0-9.-]+/gi, '-');
  return `${safe}_${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}`;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadCSV(base: string, columns: Column[], rows: Row[], sep: ',' | ';'): string {
  const name = `${base}.csv`;
  downloadBlob(name, new Blob([toCSV(columns, rows, sep)], { type: 'text/csv;charset=utf-8' }));
  return name;
}

const XLSX_CELL_MAX = 32767;

export async function downloadXLSX(base: string, columns: Column[], rows: Row[], sheetName: string): Promise<string> {
  // Chargée à la demande pour garder une interface légère.
  const XLSX = await import('xlsx');
  const matrix = toMatrix(columns, rows).map((line) => line.map((v) => (v.length > XLSX_CELL_MAX ? v.slice(0, XLSX_CELL_MAX) : v)));
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws['!cols'] = columns.map((c, i) => {
    const longest = matrix.slice(0, 200).reduce((m, line) => Math.max(m, (line[i] || '').length), c.name.length);
    return { wch: Math.min(60, Math.max(8, longest + 2)) };
  });
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: Math.max(0, columns.length - 1) } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Données');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer;
  const name = `${base}.xlsx`;
  downloadBlob(name, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  return name;
}

export async function copyTSV(columns: Column[], rows: Row[]): Promise<void> {
  await navigator.clipboard.writeText(toTSV(columns, rows));
}
