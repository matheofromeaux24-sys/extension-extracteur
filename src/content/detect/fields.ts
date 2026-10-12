// Extraction des champs (textes, liens, images) d'un item de liste.

import { absoluteUrl, backgroundImage, imageSource } from '../../shared/url';
import { isRendered, isSkippedTag, renderedChildren } from '../traverse';
import { looksLikePrice } from './fieldTypes';
import { normalizedClasses } from './similarity';

export type FieldType = 'text' | 'href' | 'src' | 'aria';

export interface Field {
  /** Chemin relatif à l'item + type (ex. « div.info>a.title@href »). */
  key: string;
  value: string;
  type: FieldType;
  /** Position dans l'ordre du document, pour ordonner les colonnes. */
  order: number;
  /** Indices de nommage : tag, classes et itemprop de l'élément et de son parent. */
  hint: string;
  inLink: boolean;
  inHeading: boolean;
  buttonLike: boolean;
}

const INLINE = new Set([
  'B', 'I', 'EM', 'STRONG', 'SMALL', 'SPAN', 'SUP', 'SUB', 'MARK', 'ABBR', 'U', 'S', 'DEL', 'INS',
  'CODE', 'TIME', 'A', 'BDI', 'BDO', 'Q', 'CITE', 'DFN', 'KBD', 'SAMP', 'VAR', 'FONT', 'LABEL', 'DATA', 'BR', 'WBR',
]);
const BLOCKISH = /^(P|DIV|LI|UL|OL|TR|TD|TH|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|DD|DT|BLOCKQUOTE|FIGCAPTION|TABLE|TBODY)$/;
const BUTTON_HINT = /(^|[^a-z])(btn|button|cart|panier|wishlist|favori|compare|quick-?view|apercu)/;
const MAX_LEN = 5000;

export function cleanText(s: string): string {
  const t = s
    .replace(/[\s\u00a0\u202f\u200b]+/g, ' ')
    .trim()
    // Séparateurs décoratifs en début / fin : « · Ferme à 21:30 ».
    .replace(/^[·⋅•|]\s*/, '')
    .replace(/\s*[·⋅•|]$/, '');
  return t.length > MAX_LEN ? t.slice(0, MAX_LEN) + '…' : t;
}

function ownText(el: Element): string {
  let s = '';
  for (const n of Array.from(el.childNodes)) if (n.nodeType === Node.TEXT_NODE) s += n.textContent;
  return s.trim();
}

/** Texte complet d'un élément, avec des espaces entre les blocs. */
export function fullText(el: Element): string {
  let out = '';
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const e = node as Element;
    if (isSkippedTag(e)) {
      if (e.tagName === 'BR') out += ' ';
      return;
    }
    const block = BLOCKISH.test(e.tagName);
    if (block) out += ' ';
    for (const c of Array.from((e.shadowRoot ?? e).childNodes)) visit(c);
    if (block) out += ' ';
  };
  visit(el);
  return cleanText(out);
}

function isInlineOnly(el: Element, depth = 0): boolean {
  if (depth > 4) return false;
  for (const c of Array.from(el.children)) {
    if (!INLINE.has(c.tagName) || !isInlineOnly(c, depth + 1)) return false;
  }
  return true;
}

export function segment(el: Element): string {
  const cls = normalizedClasses(el).slice(0, 2);
  return el.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : '');
}

function isStruck(el: Element): boolean {
  if (/^(S|DEL|STRIKE)$/.test(el.tagName) || el.getAttribute('data-a-strike') === 'true') return true;
  return el.ownerDocument.defaultView?.getComputedStyle(el).textDecorationLine.includes('line-through') ?? false;
}

function hintOf(el: Element): string {
  const parts = [el.tagName.toLowerCase(), ...Array.from(el.classList)];
  if (/^(S|DEL|STRIKE)$/.test(el.tagName) || el.getAttribute('data-a-strike') === 'true') parts.push('strike');
  const ip = el.getAttribute('itemprop');
  if (ip) parts.push(ip);
  const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
  if (testId) parts.push(testId);
  const label = el.getAttribute('aria-label');
  if (label && label.length <= 60) parts.push(label.replace(/[\d\s.,]+/g, ' '));
  return parts.join(' ').toLowerCase();
}

interface Ctx {
  inLink: boolean;
  inHeading: boolean;
  buttonLike: boolean;
  ariaHidden: boolean;
  textDone: boolean;
  parentHint: string;
}

/** Extrait tous les champs d'un item générique (carte, ligne de liste…). */
export function extractItemFields(item: Element, base: string): Field[] {
  const fields: Field[] = [];
  const occurrences = new Map<string, number>();
  let order = 0;

  const add = (key: string, value: string, type: FieldType, ctx: Ctx, hint: string) => {
    if (!value) return;
    const n = occurrences.get(key) || 0;
    occurrences.set(key, n + 1);
    fields.push({
      key: n ? `${key}[${n}]` : key,
      value,
      type,
      order: order++,
      hint: hint + ' | ' + ctx.parentHint,
      inLink: ctx.inLink,
      inHeading: ctx.inHeading,
      buttonLike: ctx.buttonLike,
    });
  };

  const visit = (el: Element, path: string, parent: Ctx) => {
    if (el !== item && (isSkippedTag(el) || !isRendered(el))) return;
    const tag = el.tagName;
    const hint = hintOf(el);
    const ctx: Ctx = {
      inLink: parent.inLink || tag === 'A',
      inHeading: parent.inHeading || /^H[1-6]$/.test(tag) || el.getAttribute('role') === 'heading',
      buttonLike: parent.buttonLike || tag === 'BUTTON' || el.getAttribute('role') === 'button' || BUTTON_HINT.test(hint),
      ariaHidden: parent.ariaHidden || el.getAttribute('aria-hidden') === 'true',
      textDone: parent.textDone,
      parentHint: parent.parentHint,
    };
    const p = path || '.';

    if (tag === 'A') add(`${p}@href`, absoluteUrl(el.getAttribute('href'), base), 'href', ctx, hint);
    if (tag === 'IMG') add(`${p}@src`, imageSource(el, base), 'src', ctx, hint);
    else {
      const bg = backgroundImage(el, base);
      if (bg) add(`${p}@bg`, bg, 'src', ctx, hint);
    }

    if (!ctx.textDone && !ctx.ariaHidden) {
      const own = ownText(el);
      const label = el.getAttribute('aria-label');
      if (label && el.getAttribute('role') === 'img') {
        // Étoiles de notation : « 4,6 étoiles 1 234 avis » (texte visible marqué aria-hidden).
        add(`${p}@aria`, cleanText(label), 'aria', ctx, hint);
        ctx.textDone = true;
      } else if (own) {
        // Prix barré (ancien prix) : on le signale pour le nommage.
        const textHint = looksLikePrice(own) && (isStruck(el) || (el.parentElement && el !== item && isStruck(el.parentElement))) ? hint + ' strike' : hint;
        if (isInlineOnly(el)) {
          add(p, fullText(el), 'text', ctx, textHint);
          ctx.textDone = true;
        } else {
          add(p, cleanText(own), 'text', ctx, textHint);
        }
      } else if (tag !== 'IMG' && !(el.textContent || '').trim()) {
        const alt = label || (tag === 'A' ? el.getAttribute('title') : '');
        if (alt) add(`${p}@aria`, cleanText(alt), 'aria', ctx, hint);
      }
    }

    const childCtx = { ...ctx, parentHint: hint };
    for (const c of renderedChildren(el)) {
      visit(c, path ? `${path}>${segment(c)}` : segment(c), childCtx);
    }
  };

  visit(item, '', {
    inLink: false,
    inHeading: false,
    buttonLike: false,
    ariaHidden: false,
    textDone: false,
    parentHint: '',
  });
  return fields;
}

/** Extraction dédiée aux lignes de tableau : une colonne par cellule. */
export function extractRowFields(tr: HTMLTableRowElement, base: string): Field[] {
  const fields: Field[] = [];
  let col = 0;
  let order = 0;
  const ctx = { inLink: false, inHeading: false, buttonLike: false };
  for (const cell of Array.from(tr.cells)) {
    const key = `cell${col}`;
    const text = fullText(cell);
    if (text) fields.push({ key, value: text, type: 'text', order: order++, hint: hintOf(cell), ...ctx });
    const a = cell.querySelector('a[href]');
    const href = a ? absoluteUrl(a.getAttribute('href'), base) : '';
    if (href) fields.push({ key: `${key}@href`, value: href, type: 'href', order: order++, hint: '', ...ctx });
    const img = cell.querySelector('img');
    const src = img ? imageSource(img, base) : '';
    if (src) fields.push({ key: `${key}@src`, value: src, type: 'src', order: order++, hint: '', ...ctx });
    col += Math.max(1, cell.colSpan || 1);
  }
  return fields;
}

/** En-têtes d'un tableau (thead, ou première ligne composée de <th>). */
export function tableHeaders(table: HTMLTableElement): { headers: string[]; headerRow: HTMLTableRowElement | null } {
  let headerRow: HTMLTableRowElement | null = null;
  if (table.tHead && table.tHead.rows.length) headerRow = table.tHead.rows[table.tHead.rows.length - 1];
  else {
    const first = table.rows[0];
    if (first && first.cells.length && Array.from(first.cells).every((c) => c.tagName === 'TH')) headerRow = first;
  }
  const headers: string[] = [];
  if (headerRow) {
    for (const cell of Array.from(headerRow.cells)) {
      const text = fullText(cell);
      for (let i = 0; i < Math.max(1, cell.colSpan || 1); i++) headers.push(text);
    }
  }
  return { headers, headerRow };
}
