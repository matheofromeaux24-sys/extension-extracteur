// Transforme les champs extraits de chaque item en colonnes nommées et en lignes.

import { messages } from '../../shared/i18n';
import type { Column, ColumnKind, Derive, Row } from '../../shared/types';
import { ADDRESS_RE, dominantKind } from './fieldTypes';
import type { Field, FieldType } from './fields';
import { isHashyClass } from './similarity';

type ColumnLabel = keyof typeof messages.columns;

interface Agg {
  key: string;
  derive?: Derive;
  type: FieldType;
  values: string[];
  count: number;
  orderSum: number;
  /** Indices de l'élément et de son parent uniquement : un conteneur « product-description »
   *  ne doit pas faire de chaque champ une « Description ». */
  hint: string;
  inLink: number;
  inHeading: number;
  buttonLike: number;
}

const UI_LABELS =
  /^(ajouter au panier|add to (cart|basket|bag)|acheter|buy( now)?|voir( le produit| plus| détails?)?|view( details| more)?|lire la suite|read more|en savoir plus|learn more|détails?|details|aperçu rapide|quick ?view|comparer|compare|choisir|select options|commander|shop now|découvrir|sponsoris[ée]e?|sponsored|publicité|ad)$/i;

const MAX_COLUMNS = 40;

export interface BuildOptions {
  /** En-têtes de tableau (index = numéro de cellule). */
  headers?: string[];
  isTable?: boolean;
}

export function buildColumns(perItem: Field[][], opts: BuildOptions = {}): { columns: Column[]; rows: Row[] } {
  const n = perItem.length;
  const aggs = new Map<string, Agg>();
  perItem.forEach((fields, i) => {
    for (const f of fields) {
      let a = aggs.get(f.key);
      if (!a) {
        a = {
          key: f.key,
          type: f.type,
          values: new Array(n).fill(''),
          count: 0,
          orderSum: 0,
          hint: f.hint,
          inLink: 0,
          inHeading: 0,
          buttonLike: 0,
        };
        aggs.set(f.key, a);
      }
      if (a.values[i]) continue;
      a.values[i] = f.value;
      a.count++;
      a.orderSum += f.order;
      if (f.inLink) a.inLink++;
      if (f.inHeading) a.inHeading++;
      if (f.buttonLike) a.buttonLike++;
    }
  });

  const minCount = opts.isTable ? 1 : Math.max(2, Math.ceil(n * 0.2));
  let cols = Array.from(aggs.values()).filter((a) => a.count >= Math.min(minCount, n));

  if (!opts.isTable) cols = cols.filter((a) => !isNoise(a, n));
  cols = dropDuplicates(cols);
  cols.sort((a, b) => a.orderSum / a.count - b.orderSum / b.count);
  if (opts.isTable) cols.sort((a, b) => cellIndex(a.key) - cellIndex(b.key));
  cols = splitRatingCounts(cols).slice(0, MAX_COLUMNS);

  for (const a of cols) if (isTextual(a.type)) stripCommonLabel(a);
  const columns = nameColumns(cols, opts);
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const row: Row = {};
    cols.forEach((a, j) => (row[columns[j].id] = a.values[i]));
    rows.push(row);
  }
  return { columns, rows };
}

/** Reconstruit les lignes de nouveaux items à partir de colonnes existantes. */
export function rowsForColumns(perItem: Field[][], columns: Column[]): Row[] {
  return perItem.map((fields) => {
    const byKey = new Map<string, string>();
    for (const f of fields) if (!byKey.has(f.key)) byKey.set(f.key, f.value);
    const row: Row = {};
    for (const c of columns) row[c.id] = applyDerive(byKey.get(c.key) ?? '', c.derive);
    return row;
  });
}

const RATING_COUNT_RE =
  /^(\d(?:[.,]\d{1,2})?)\s*(?:étoiles?|stars?|sur\s*5|out of\s*5|\/\s*5)?[^\d]{0,12}?(\d[\d\s\u00a0\u202f.,]*)\s*(?:avis|reviews?|évaluations?|ratings?|notes?)\b/i;

function applyDerive(v: string, derive?: Derive): string {
  if (!derive || !v) return v;
  const m = v.match(RATING_COUNT_RE);
  if (!m) return derive === 'rating' ? v : '';
  return derive === 'rating' ? m[1] : m[2].trim();
}

/** Sépare « 4,6 étoiles 1 234 avis » en deux colonnes : la note et le nombre d'avis. */
function splitRatingCounts(cols: Agg[]): Agg[] {
  const out: Agg[] = [];
  for (const a of cols) {
    const filled = a.values.filter(Boolean);
    if (!isTextual(a.type) || filled.length < 2 || filled.filter((v) => RATING_COUNT_RE.test(v)).length / filled.length < 0.6) {
      out.push(a);
      continue;
    }
    out.push(
      { ...a, derive: 'rating', values: a.values.map((v) => applyDerive(v, 'rating')), hint: 'rating' },
      { ...a, derive: 'count', values: a.values.map((v) => applyDerive(v, 'count')), hint: 'avis' },
    );
  }
  return out;
}

function cellIndex(key: string): number {
  const m = key.match(/^cell(\d+)/);
  return m ? Number(m[1]) * 3 + (key.includes('@href') ? 1 : key.includes('@src') ? 2 : 0) : 0;
}

function isNoise(a: Agg, n: number): boolean {
  const filled = a.values.filter(Boolean);
  const distinct = new Set(filled);
  if (a.type === 'text' || a.type === 'aria') {
    if (filled.every((v) => UI_LABELS.test(v))) return true;
    // Libellé de bouton répété à l'identique (« Ajouter au panier », « ♡ »…).
    if (distinct.size === 1 && n >= 4 && (a.buttonLike > 0 || [...distinct][0].length <= 2)) return true;
    // Libellé fixe (« Prix conseillé : »).
    if (distinct.size === 1 && /:\s*$/.test([...distinct][0])) return true;
    return false;
  }
  // Lien ou image identique pour tous les items : aucune information.
  if (distinct.size === 1 && a.count >= 4) return true;
  if (a.type === 'href' && a.buttonLike === a.count && distinct.size === 1) return true;
  return false;
}

/** Retire un préfixe commun du type « Catégorie : » présent dans presque toutes les valeurs. */
function stripCommonLabel(a: Agg): void {
  const filled = a.values.filter(Boolean);
  if (filled.length < 2) return;
  const m = filled[0].match(/^([^:]{1,25}):\s+(?=\S)/);
  if (!m) return;
  const prefix = m[0];
  if (filled.filter((v) => v.startsWith(prefix)).length / filled.length < 0.8) return;
  a.values = a.values.map((v) => (v.startsWith(prefix) ? v.slice(prefix.length) : v));
  a.hint += ' ' + m[1].toLowerCase();
}

/** Valeur comparable : les liens sont comparés sans leur ancre (#…). */
function comparable(a: Agg, v: string): string {
  return a.type === 'href' ? v.replace(/#.*$/, '') : v;
}

/**
 * Fusionne les colonnes qui portent la même information (ex. le lien de
 * l'image et le lien du titre) : on garde la première et on comble ses trous.
 */
function dropDuplicates(cols: Agg[]): Agg[] {
  const kept: Agg[] = [];
  outer: for (const c of cols) {
    for (const k of kept) {
      if (k.type !== c.type && !(isTextual(k.type) && isTextual(c.type))) continue;
      let same = 0;
      let both = 0;
      for (let i = 0; i < c.values.length; i++) {
        if (!c.values[i] || !k.values[i]) continue;
        both++;
        if (comparable(c, c.values[i]) === comparable(k, k.values[i])) same++;
      }
      if (both >= Math.max(1, Math.min(c.count, k.count) * 0.5) && same / both >= 0.95) {
        for (let i = 0; i < c.values.length; i++) {
          if (!k.values[i] && c.values[i]) {
            k.values[i] = c.values[i];
            k.count++;
          }
        }
        k.inHeading = Math.max(k.inHeading, c.inHeading);
        k.inLink = Math.max(k.inLink, c.inLink);
        continue outer;
      }
    }
    kept.push(c);
  }
  return kept;
}

function isTextual(t: FieldType): boolean {
  return t === 'text' || t === 'aria';
}

// ---------------------------------------------------------------------------
// Nommage

const B = '(?:^|[^a-z])';
const HINTS: Array<[RegExp, ColumnLabel, ColumnKind[]?]> = [
  [new RegExp(`${B}(old|before|was|regular|barr|ancien|strike|crossed|list-?price|original|regular-price)`), 'oldPrice', ['price']],
  [new RegExp(`${B}(reviews?|avis|ratings?-?count|nb-?avis|comments?-?count|évaluations?|evaluations?)`), 'reviews', ['number', 'text']],
  [new RegExp(`${B}(rating|stars?|etoiles?|note|score)`), 'rating'],
  [new RegExp(`${B}(author|auteur|byline|writer|posted-?by)`), 'author'],
  [new RegExp(`${B}(brand|marque|manufacturer|fabricant)`), 'brand'],
  [new RegExp(`${B}(address|adresse|street|addr)`), 'address'],
  [new RegExp(`${B}(categor|cat-?links|rubrique|breadcrumb)`), 'category'],
  [new RegExp(`${B}(stock|availab|dispo)`), 'availability'],
  [new RegExp(`${B}(discount|promo|remise|reduc|saving|percent|sale-?badge)`), 'discount'],
  [new RegExp(`${B}(location|lieu|city|ville|region)`), 'location'],
  [new RegExp(`${B}(date|time|publish|posted|updated)`), 'date', ['date', 'text']],
  [new RegExp(`${B}(desc|summary|excerpt|resume|teaser|snippet|abstract|chapo|intro)`), 'description', ['text']],
  [new RegExp(`${B}(tags?|label|chip|badge|flags?)`), 'tag', ['text']],
];
const TITLE_HINT = new RegExp(`${B}(title|titre|name|nom|heading|headline|product-?name)`);

const KIND_LABEL: Partial<Record<ColumnKind, ColumnLabel>> = {
  price: 'price',
  date: 'date',
  rating: 'rating',
  number: 'number',
  email: 'email',
  phone: 'phone',
};

function avgLength(a: Agg): number {
  const filled = a.values.filter(Boolean);
  return filled.length ? filled.reduce((s, v) => s + v.length, 0) / filled.length : 0;
}

/** Classes purement visuelles, qui ne disent rien du contenu. */
const UTILITY_CLASS =
  /(^|[-_])(size|color|colour|text|font|spacing|align|padding|margin|bold|normal|base|secondary|primary|small|medium|large|muted|light|dark|inline|block|flex|grid|hidden|visible|row|col|wrap|inner|outer|container|section|item|content|body|fs|fw|mt|mb|ml|mr|px|py)([-_]|$)/i;

function elementPath(key: string): string {
  return key.replace(/\[\d+\]$/, '').replace(/@\w+$/, '');
}

/** Nom lisible tiré d'une classe CSS : « product-brand » → « Product brand ». */
function humanizeKey(key: string): string {
  const last = elementPath(key).split('>').pop() || '';
  const classes = last
    .split('.')
    .slice(1)
    .filter((c) => !isHashyClass(c) && c.length >= 3 && !UTILITY_CLASS.test(c));
  const c = classes[0];
  if (!c) return '';
  const words = c
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!/[a-zà-ÿ]{3,}/.test(words) || words.length > 32) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function nameColumns(cols: Agg[], opts: BuildOptions): Column[] {
  const L = messages.columns;
  const kinds = cols.map<ColumnKind>((a) =>
    a.type === 'href' ? 'link' : a.type === 'src' ? 'image' : dominantKind(a.values),
  );
  const names: string[] = new Array(cols.length).fill('');

  if (opts.isTable && opts.headers?.length) {
    cols.forEach((a, i) => {
      const idx = Number(a.key.match(/^cell(\d+)/)?.[1] ?? -1);
      const header = opts.headers![idx];
      if (!header) return;
      names[i] = a.type === 'href' ? `${header} (${L.link.toLowerCase()})` : a.type === 'src' ? `${header} (${L.image.toLowerCase()})` : header;
    });
  }

  // Titre : un seul, choisi par score.
  let titleIdx = -1;
  let titleScore = 1.5;
  cols.forEach((a, i) => {
    if (names[i] || kinds[i] !== 'text') return;
    const len = avgLength(a);
    if (len < 3 || len > 250) return;
    let s = 0;
    if (a.inHeading / a.count > 0.5) s += 3;
    if (TITLE_HINT.test(a.hint)) s += 2;
    if (a.inLink / a.count > 0.5) s += 1;
    if (len >= 12) s += 1;
    if (a.count / a.values.length > 0.8) s += 0.5;
    if (s > titleScore) {
      titleScore = s;
      titleIdx = i;
    }
  });
  if (titleIdx >= 0) {
    names[titleIdx] = L.title;
    kinds[titleIdx] = 'title';
  }

  let descriptionUsed = false;
  cols.forEach((a, i) => {
    if (names[i]) return;
    const kind = kinds[i];
    if (kind === 'link') return void (names[i] = L.link);
    if (kind === 'image') return void (names[i] = L.image);
    const hint = a.hint;
    for (const [re, label, allowed] of HINTS) {
      if (re.test(hint) && (!allowed || allowed.includes(kind))) {
        names[i] = L[label];
        if (label === 'description') {
          kinds[i] = 'description';
          descriptionUsed = true;
        }
        if (label === 'rating') kinds[i] = 'rating';
        return;
      }
    }
    const byKind = KIND_LABEL[kind];
    if (byKind) return void (names[i] = L[byKind]);
    const filled = a.values.filter(Boolean);
    if (filled.length && filled.filter((v) => ADDRESS_RE.test(v)).length / filled.length >= 0.6) {
      return void (names[i] = L.address);
    }
    if (!descriptionUsed && avgLength(a) >= 80) {
      descriptionUsed = true;
      kinds[i] = 'description';
      return void (names[i] = L.description);
    }
    names[i] = humanizeKey(a.key) || (opts.isTable ? `${L.column} ${i + 1}` : L.text);
  });

  // Un lien qui entoure un champ nommé prend son nom : « Lien (Auteur) ».
  const GENERIC = new Set<string>([L.title, L.text, L.link, L.image, L.description, L.price, L.number]);
  cols.forEach((a, i) => {
    if (kinds[i] !== 'link' || names[i] !== L.link) return;
    const linkPath = elementPath(a.key);
    const j = cols.findIndex((t, tj) => isTextual(t.type) && tj !== i && (elementPath(t.key) === linkPath || elementPath(t.key).startsWith(linkPath + '>')));
    if (j >= 0 && names[j] && !GENERIC.has(names[j])) names[i] = `${L.link} (${names[j].toLowerCase()})`;
  });

  // Noms uniques : « Lien », « Lien 2 »…
  const seen = new Map<string, number>();
  return cols.map((a, i) => {
    const base = names[i];
    const k = (seen.get(base) || 0) + 1;
    seen.set(base, k);
    const col: Column = { id: `c${i}`, name: k > 1 ? `${base} ${k}` : base, kind: kinds[i], key: a.key };
    if (a.derive) col.derive = a.derive;
    return col;
  });
}
