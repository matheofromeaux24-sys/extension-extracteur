// Score « pub gagnante » : calcul local, sans IA.
//
// Meta ne publie pas les performances, mais une publicité qui reste longtemps
// en ligne, qui est déclinée en plusieurs versions ou dont le texte est réutilisé
// est presque toujours une publicité rentable pour l'annonceur.

import { daysBetween, findDates } from '../../shared/dates';
import { format, messages } from '../../shared/i18n';
import { RAW_KEY, type Column, type ExtractResult, type Row } from '../../shared/types';

const S = messages.score;
const ACTIVE_RE = /^(active?|actif|en ligne|en cours|live|online)$/i;
const INACTIVE_RE = /^(inactive?|inactif|terminée?|arrêtée?|ended|stopped)$/i;
const VERSIONS_RE = /(\d+)\s+(?:publicités|annonces|ads)\s+(?:utilisent|use)/i;
const MULTI_RE = /plusieurs versions|multiple versions/i;

function rowAllText(row: Row, columns: Column[]): string {
  return [row[RAW_KEY] ?? '', ...columns.map((c) => row[c.id] ?? '')].join(' \n ');
}

/** Dates de début et de fin de diffusion d'une ligne (fin = aujourd'hui si toujours active). */
export function runDates(row: Row, columns: Column[]): { start: Date | null; end: Date | null } {
  const dateCols = columns.filter((c) => c.kind === 'date');
  for (const c of dateCols) {
    const ds = findDates(row[c.id] ?? '');
    if (ds.length) return { start: ds[0], end: ds[1] ?? null };
  }
  const ds = findDates(row[RAW_KEY] ?? '');
  return ds.length ? { start: ds[0], end: ds[1] ?? null } : { start: null, end: null };
}

function statusOf(row: Row, columns: Column[]): 'active' | 'inactive' | null {
  for (const c of columns) {
    const v = (row[c.id] ?? '').trim();
    if (ACTIVE_RE.test(v)) return 'active';
    if (INACTIVE_RE.test(v)) return 'inactive';
  }
  return null;
}

/** Texte principal (description) servant à repérer les publicités relancées. */
function mainText(row: Row, columns: Column[]): string {
  const c = columns.find((col) => col.kind === 'description') ?? columns.find((col) => col.kind === 'title');
  return (c ? row[c.id] : '')?.trim().toLowerCase() ?? '';
}

export function computeWinningScore(result: ExtractResult): { result: ExtractResult; hadDates: boolean } {
  const { columns, rows } = result;
  const now = new Date();
  const texts = rows.map((r) => mainText(r, columns));
  const textCount = new Map<string, number>();
  for (const t of texts) if (t.length > 20) textCount.set(t, (textCount.get(t) || 0) + 1);
  let hadDates = false;

  const scored = rows.map((row, i) => {
    const { start, end } = runDates(row, columns);
    const status = statusOf(row, columns);
    const all = rowAllText(row, columns);
    const versionsMatch = all.match(VERSIONS_RE);
    const versions = versionsMatch ? Number(versionsMatch[1]) : MULTI_RE.test(all) ? 2 : 1;
    const reuse = texts[i].length > 20 ? textCount.get(texts[i]) ?? 1 : 1;
    const days = start ? daysBetween(start, end ?? now) : null;
    if (start) hadDates = true;

    // Durée : jusqu'à 55 points (courbe logarithmique, ~55 au-delà de 90 jours).
    let score = days === null ? 0 : Math.min(55, Math.round((Math.log1p(days) / Math.log1p(90)) * 55));
    if (status === 'active') score += days !== null && days >= 30 ? 15 : 5;
    score += Math.min(20, (versions - 1) * 5);
    score += Math.min(15, (reuse - 1) * 5);
    // Sans date, on remet à l'échelle sur les signaux disponibles.
    if (days === null) score = Math.round(score * (100 / 50));
    score = Math.max(0, Math.min(100, score));

    const signals = [
      days !== null ? format(S.signals.days, { days }) : '',
      status === 'active' ? S.signals.active : '',
      versions > 1 ? format(S.signals.versions, { count: versions }) : '',
      reuse > 1 ? format(S.signals.relaunched, { count: reuse }) : '',
    ].filter(Boolean);
    return { row: { ...row, ws_days: days === null ? '' : String(days), ws_score: String(score), ws_signals: signals.join(' · ') }, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const newCols: Column[] = [
    { id: 'ws_score', name: S.columns.score, kind: 'number', key: 'score:value' },
    { id: 'ws_days', name: S.columns.days, kind: 'number', key: 'score:days' },
    { id: 'ws_signals', name: S.columns.signals, kind: 'text', key: 'score:signals' },
  ];
  const kept = columns.filter((c) => !c.id.startsWith('ws_'));
  return { result: { ...result, columns: [...newCols, ...kept], rows: scored.map((s) => s.row) }, hadDates };
}
