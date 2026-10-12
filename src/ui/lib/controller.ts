// Actions de l'interface : analyse de la page, navigation entre listes, autorisations.

import type { BackgroundResponse } from '../../background/pagination';
import { format, messages } from '../../shared/i18n';
import { AccessError, ensureContentScript, sendToTab } from '../../shared/messaging';
import type { BackgroundRequest, JobState, PaginationMode, Row } from '../../shared/types';
import { domainOf } from '../../shared/url';
import { getState, jobActive, setPagination, setState, showToast } from '../store/useStore';

let runId = 0;

export async function analyze(tabId: number): Promise<void> {
  const id = ++runId;
  const previous = getState().analyzed;
  if (previous && previous.tabId !== tabId) {
    // On retire la surbrillance laissée sur l'ancien onglet.
    sendToTab(previous.tabId, { type: 'clearHighlight' }).catch(() => undefined);
  }
  setPagination({ modeTouched: false, selector: undefined, selectorLabel: undefined, detection: null });
  setState({
    status: 'loading',
    loadingStep: 'injecting',
    error: null,
    forbiddenReason: null,
    permission: null,
    startedAt: Date.now(),
    endedAt: null,
  });
  try {
    await ensureContentScript(tabId);
    if (id !== runId) return;
    setState({ loadingStep: 'detecting' });
    const result = await sendToTab(tabId, { type: 'detect' });
    if (id !== runId) return;
    setState({
      status: result ? 'ready' : 'empty',
      result,
      pages: result ? 1 : 0,
      analyzed: { tabId, url: result?.page.url ?? getState().target?.url ?? '' },
      endedAt: Date.now(),
      job: null,
    });
    if (result) void loadPaginationDetection(tabId);
  } catch (e) {
    if (id !== runId) return;
    handleError(e);
  }
}

function handleError(e: unknown): void {
  const endedAt = Date.now();
  if (e instanceof AccessError) {
    if (e.kind === 'forbidden') return void setState({ status: 'forbidden', forbiddenReason: e.detail.reason ?? 'chrome', endedAt });
    if (e.kind === 'permission') {
      return void setState({ status: 'permission', permission: { origin: e.detail.origin!, domain: e.detail.domain! }, endedAt });
    }
    return void setState({ status: 'error', error: messages.errors.loading, endedAt });
  }
  const msg = e instanceof Error ? e.message : String(e);
  const friendly = /Receiving end does not exist|Could not establish connection/i.test(msg) ? messages.errors.loading : msg;
  setState({ status: 'error', error: friendly, endedAt });
}

export async function moveList(delta: number): Promise<void> {
  const { result, analyzed } = getState();
  if (!result || !analyzed) return;
  const id = ++runId;
  setState({ startedAt: Date.now(), endedAt: null });
  try {
    await ensureContentScript(analyzed.tabId);
    const next = await sendToTab(analyzed.tabId, { type: 'selectList', index: result.list.index + delta });
    if (id !== runId) return;
    setState({ result: next, status: next ? 'ready' : 'empty', endedAt: Date.now(), job: null, pages: next ? 1 : 0 });
    if (next) void loadPaginationDetection(analyzed.tabId);
  } catch (e) {
    if (id === runId) handleError(e);
  }
}

/**
 * Demande l'accès au domaine. Doit être appelé directement dans le gestionnaire
 * de clic : Chrome exige un geste de l'utilisateur.
 */
export function requestPermission(): void {
  const { permission, target } = getState();
  if (!permission || !target) return;
  chrome.permissions.request({ origins: [permission.origin] }).then(
    (granted) => {
      if (granted) void analyze(target.tabId);
      else setState({ error: messages.errors.permissionDenied });
    },
    (e: unknown) => setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }),
  );
}

export function reanalyzeCurrent(): void {
  const { target } = getState();
  if (target) void analyze(target.tabId);
}

// ---------------------------------------------------------------------------
// Pagination

/** Repère les contrôles de pagination et présélectionne le mode le plus probable. */
export async function loadPaginationDetection(tabId: number): Promise<void> {
  try {
    const detection = await sendToTab(tabId, { type: 'detectPagination' });
    const { pagination } = getState();
    const mode: PaginationMode = pagination.modeTouched
      ? pagination.mode
      : detection.next
        ? 'next'
        : detection.loadMore
          ? 'loadMore'
          : detection.scroll.inner
            ? 'scroll'
            : 'none';
    setPagination({ detection, mode, selector: undefined, selectorLabel: undefined });
  } catch {
    setPagination({ detection: null });
  }
}

async function sendBackground(msg: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(msg) as Promise<BackgroundResponse>;
}

export async function startPagination(): Promise<void> {
  const { result, analyzed, pagination } = getState();
  if (!result || !analyzed || pagination.mode === 'none') return;
  const res = await sendBackground({
    type: 'paginate:start',
    tabId: analyzed.tabId,
    list: { selector: result.list.selector, isTable: result.list.isTable },
    columns: result.columns,
    config: {
      mode: pagination.mode,
      maxPages: pagination.maxPages,
      delayMin: Math.round(pagination.delayMin * 1000),
      delayMax: Math.round(pagination.delayMax * 1000),
      selector: pagination.selector,
    },
  });
  if (!res.ok) return showToast(messages.pagination.alreadyRunning, 'error');
  setState({ job: res.job, startedAt: res.job?.startedAt ?? Date.now(), endedAt: null });
}

export function pausePagination(): void {
  void sendBackground({ type: 'paginate:pause' });
}

export function resumePagination(): void {
  void sendBackground({ type: 'paginate:resume' });
}

export function stopPagination(): void {
  void sendBackground({ type: 'paginate:stop' });
}

/** Autorise le domaine demandé par la tâche (geste utilisateur requis) puis reprend. */
export function allowAndResume(): void {
  const permission = getState().job?.permission;
  if (!permission) return;
  chrome.permissions.request({ origins: [permission.origin] }).then((granted) => {
    if (granted) resumePagination();
  });
}

export function onPaginationProgress(job: JobState, rows: Row[], reset: boolean): void {
  const s = getState();
  if (!s.result) return;
  const wasActive = jobActive(s.job);
  setState({
    job,
    result: { ...s.result, rows: reset ? rows : rows.length ? s.result.rows.concat(rows) : s.result.rows },
    pages: job.page,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    analyzed: job.url ? { tabId: job.tabId, url: job.url } : s.analyzed,
  });
  if (wasActive && !jobActive(job)) {
    const P = messages.pagination;
    const reason = job.reason ? format(P.reasons[job.reason], { message: job.error ?? '' }) : '';
    showToast(`${format(P.done, { rows: job.rowCount.toLocaleString('fr-FR'), pages: job.page })} ${reason}`, job.status === 'error' ? 'error' : 'success');
  }
}

/** Récupère une extraction multi-pages en cours (fenêtre rouverte pendant la tâche). */
export async function restoreRunningJob(): Promise<boolean> {
  const res = await sendBackground({ type: 'paginate:get' }).catch(() => null);
  if (!res?.ok || !res.job || !jobActive(res.job) || !res.columns) return false;
  const url = res.job.url ?? '';
  setState({
    status: 'ready',
    job: res.job,
    analyzed: { tabId: res.job.tabId, url },
    pages: res.job.page,
    startedAt: res.job.startedAt,
    endedAt: res.job.endedAt,
    result: {
      page: { url, title: getState().target?.title ?? url, domain: domainOf(url) },
      list: { index: 0, itemCount: res.rows?.length ?? 0, score: 0, selector: '', isTable: false },
      listCount: 1,
      columns: res.columns,
      rows: res.rows ?? [],
      durationMs: 0,
    },
  });
  return true;
}

/** Choix du bouton de pagination par clic sur la page. */
export async function pickPaginationControl(): Promise<void> {
  const { analyzed, pagination } = getState();
  if (!analyzed || (pagination.mode !== 'next' && pagination.mode !== 'loadMore')) return;
  setPagination({ picking: true });
  const own = await chrome.windows.getCurrent();
  try {
    const tab = await chrome.tabs.update(analyzed.tabId, { active: true });
    if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    await ensureContentScript(analyzed.tabId);
    const picked = await sendToTab(analyzed.tabId, { type: 'pickElement', purpose: pagination.mode });
    if (picked) setPagination({ selector: picked.selector, selectorLabel: picked.label });
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e), 'error');
  } finally {
    setPagination({ picking: false });
    if (own.id !== undefined) void chrome.windows.update(own.id, { focused: true });
  }
}

export function cancelPicking(): void {
  const { analyzed } = getState();
  if (analyzed) sendToTab(analyzed.tabId, { type: 'cancelPick' }).catch(() => undefined);
  setPagination({ picking: false });
}
