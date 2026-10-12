// Types partagés entre le service worker, le content script et l'interface.

export type ColumnKind =
  | 'text'
  | 'title'
  | 'description'
  | 'link'
  | 'image'
  | 'price'
  | 'date'
  | 'rating'
  | 'number'
  | 'email'
  | 'phone';

export interface Column {
  /** Identifiant stable, utilisé comme clé dans les lignes. */
  id: string;
  /** Nom affiché (« Titre », « Prix »…). */
  name: string;
  kind: ColumnKind;
  /** Chemin relatif à l'item permettant de retrouver la valeur. */
  key: string;
  /** Partie extraite d'une valeur composite (« 4,6 étoiles 1 234 avis » → note / nombre d'avis). */
  derive?: Derive;
}

export type Derive = 'rating' | 'count';

export type Row = Record<string, string>;

export interface PageInfo {
  url: string;
  title: string;
  domain: string;
}

/** Résumé d'une liste détectée, affiché dans le navigateur de listes. */
export interface ListSummary {
  index: number;
  itemCount: number;
  score: number;
  /** Sélecteur CSS qui cible les items de la liste. */
  selector: string;
}

export interface ExtractResult {
  page: PageInfo;
  list: ListSummary;
  listCount: number;
  columns: Column[];
  rows: Row[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Messages UI → content script

export type ContentRequest =
  | { type: 'ping' }
  | { type: 'detect' }
  | { type: 'selectList'; index: number }
  | { type: 'clearHighlight' };

export interface ContentResponses {
  ping: { version: string };
  detect: ExtractResult | null;
  selectList: ExtractResult | null;
  clearHighlight: true;
}

export type ContentResponse<T extends ContentRequest> = ContentResponses[T['type']];

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Messages service worker → UI

export type UiMessage = { type: 'ui:setTarget'; tabId: number };
