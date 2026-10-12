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
  isTable: boolean;
}

/** Ce qu'il faut pour retrouver une liste sur une autre page du même site. */
export interface ListDef {
  selector: string;
  isTable: boolean;
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
  | { type: 'clearHighlight' }
  | { type: 'detectPagination' }
  | { type: 'extractList'; list: ListDef; columns: Column[] }
  | { type: 'scrollStep'; list: ListDef; waitMs: number }
  | { type: 'clickLoadMore'; selector?: string; list: ListDef; waitMs: number }
  | { type: 'findNext'; selector?: string }
  | { type: 'clickNext'; selector?: string; list: ListDef; waitMs: number }
  | { type: 'pickElement'; purpose: 'next' | 'loadMore' | 'any' }
  | { type: 'cancelPick' }
  | { type: 'pickList' }
  | { type: 'pickColumn'; columns: Column[] };

/** Élément de pagination trouvé sur la page. */
export interface PageControl {
  selector: string;
  label: string;
  href?: string;
}

export interface PaginationDetection {
  next: PageControl | null;
  loadMore: PageControl | null;
  /** Zone qui défile : la page entière ou un panneau interne (ex. Google Maps). */
  scroll: { inner: boolean };
}

export interface ContentResponses {
  ping: { version: string };
  detect: ExtractResult | null;
  selectList: ExtractResult | null;
  clearHighlight: true;
  detectPagination: PaginationDetection;
  extractList: { rows: Row[]; itemCount: number; page: PageInfo };
  scrollStep: { grew: boolean; itemCount: number };
  clickLoadMore: { clicked: boolean; grew: boolean };
  findNext: PageControl | null;
  clickNext: { clicked: boolean; changed: boolean };
  pickElement: PageControl | null;
  cancelPick: true;
  pickList: ExtractResult | null;
  pickColumn: { columns: Column[]; rows: Row[]; added: Column | null } | null;
}

export type ContentResponse<T extends ContentRequest> = ContentResponses[T['type']];

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Pagination (orchestrée par le service worker)

export type PaginationMode = 'none' | 'scroll' | 'loadMore' | 'next';

export interface PaginationConfig {
  mode: PaginationMode;
  /** Nombre maximal de pages (ou de défilements / clics), page de départ comprise. */
  maxPages: number;
  /** Délai aléatoire entre deux pages, en millisecondes. */
  delayMin: number;
  delayMax: number;
  /** Élément choisi à la main ; sinon détection automatique à chaque page. */
  selector?: string;
}

export type JobStatus = 'running' | 'paused' | 'needsPermission' | 'done' | 'stopped' | 'error';
export type JobEndReason = 'maxPages' | 'noMore' | 'noNewRows' | 'stopped' | 'error';

export interface JobState {
  id: number;
  tabId: number;
  status: JobStatus;
  page: number;
  maxPages: number;
  rowCount: number;
  startedAt: number;
  endedAt: number | null;
  /** URL de la dernière page extraite. */
  url?: string;
  reason?: JobEndReason;
  error?: string;
  /** Domaine à autoriser pour continuer (navigation vers un autre site). */
  permission?: { origin: string; domain: string };
}

export type BackgroundRequest =
  | { type: 'paginate:start'; tabId: number; config: PaginationConfig; list: ListDef; columns: Column[] }
  | { type: 'paginate:pause' }
  | { type: 'paginate:resume' }
  | { type: 'paginate:stop' }
  | { type: 'paginate:get' };

// ---------------------------------------------------------------------------
// Messages service worker → UI

export type UiMessage =
  | { type: 'ui:setTarget'; tabId: number }
  /** `rows` contient toutes les lignes si `reset`, sinon seulement les nouvelles. */
  | { type: 'paginate:progress'; job: JobState; rows: Row[]; reset: boolean };
