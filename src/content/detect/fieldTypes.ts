// Reconnaissance du type d'une valeur texte (prix, date, note…).

import type { ColumnKind } from '../../shared/types';

const CURRENCY = '(?:€|\\$|£|¥|₹|₽|₩|₺|EUR|USD|GBP|CHF|CAD|AUD|JPY|MAD|DH|FCFA|XOF|XAF|zł|kr|R\\$|Fr\\.?)';
const AMOUNT = '\\d{1,3}(?:[\\s\\u00a0\\u202f.,\']\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';

export const PRICE_RE = new RegExp(
  `(?:${CURRENCY}\\s?(?:${AMOUNT}))|(?:(?:${AMOUNT})\\s?(?:${CURRENCY}|TTC|HT))`,
  'i',
);
const RATING_RE =
  /^\s*(?:note\s*:?\s*)?\d(?:[.,]\d{1,2})?\s*(?:\/\s*(?:5|10)|sur\s*(?:5|10)|out of\s*(?:5|10)|étoiles?|stars?|★)|^[★☆]{3,}|^\s*\d[.,]\d\s*$/i;
const EMAIL_RE = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;
const PHONE_RE = /^(?:\+|00|0|\()[\d\s().-]{7,20}$/;
/** Grand nombre avec séparateurs de milliers (« 1 450 935 791 »), à ne pas confondre avec un téléphone. */
const GROUPED_NUMBER_RE = /^\d{1,3}(?:[\s\u00a0\u202f.,']\d{3})+(?:[.,]\d+)?$/;
export const ADDRESS_RE =
  /^\d{1,5}(?:\s?(?:bis|ter|[a-c]))?,?\s+(?:rue|avenue|av\.?|bd|boulevard|quai|place|pl\.|cours|chemin|ch\.|allée|impasse|route|rte|square|passage|faubourg|street|st\.?|road|rd\.?|ave\.?|drive|lane|way|calle|via)\b/i;
const MONTHS =
  'janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec|jan|feb|mar|apr|may|jun|jul|aug|sep';
const DATE_RE = new RegExp(
  [
    '\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b',
    '\\b\\d{4}-\\d{2}-\\d{2}',
    `\\b\\d{1,2}(?:er)?\\s+(?:${MONTHS})[a-zéû]*\\.?\\s+\\d{4}`,
    `\\b(?:${MONTHS})[a-zéû]*\\.?\\s+\\d{1,2},?\\s+\\d{4}`,
    '\\bil y a \\d+\\s+\\w+',
    '\\b\\d+\\s+(?:minutes?|hours?|days?|weeks?|months?|years?)\\s+ago\\b',
  ].join('|'),
  'i',
);
const NUMBER_RE = /^[(]?[+-]?\d[\d\s\u00a0\u202f.,]*[)]?\s?%?$/;

export function valueKind(v: string): ColumnKind {
  const s = v.trim();
  if (!s) return 'text';
  if (EMAIL_RE.test(s)) return 'email';
  if (s.length <= 40 && PRICE_RE.test(s)) return 'price';
  if (s.length <= 40 && RATING_RE.test(s)) return 'rating';
  if (s.length <= 60 && DATE_RE.test(s)) return 'date';
  if (GROUPED_NUMBER_RE.test(s)) return 'number';
  if (PHONE_RE.test(s) && (s.match(/\d/g) || []).length >= 9) return 'phone';
  if (NUMBER_RE.test(s)) return 'number';
  return 'text';
}

/** Type majoritaire (≥ 60 % des valeurs non vides), sinon « text ». */
export function dominantKind(values: string[]): ColumnKind {
  const filled = values.filter((v) => v && v.trim());
  if (!filled.length) return 'text';
  const counts = new Map<ColumnKind, number>();
  for (const v of filled) {
    const k = valueKind(v);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best: ColumnKind = 'text';
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return bestCount / filled.length >= 0.6 ? best : 'text';
}

export function looksLikePrice(text: string): boolean {
  return text.length <= 60 && PRICE_RE.test(text);
}
