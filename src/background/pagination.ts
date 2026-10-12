// Orchestration du scraping multi-pages (service worker).
//
// Chaque « page » : action de pagination (défilement, clic « Charger plus » ou
// passage à la page suivante) → réinjection du content script si la page a été
// rechargée → attente de stabilité du DOM → extraction → dédoublonnage.

import { AccessError, ensureContentScript, sendToTab } from '../shared/messaging';
import type { BackgroundRequest, Column, JobEndReason, JobState, ListDef, PaginationConfig, Row, UiMessage } from '../shared/types';

interface Job {
  state: JobState;
  config: PaginationConfig;
  list: ListDef;
  columns: Column[];
  rows: Row[];
  seen: Set<string>;
  stopRequested: boolean;
  resumeWaiters: Array<() => void>;
}

let job: Job | null = null;
let nextId = 1;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rowKey(row: Row, columns: Column[]): string {
  return columns.map((c) => row[c.id] ?? '').join('\u0001');
}

function broadcast(rows: Row[], reset: boolean): void {
  if (!job) return;
  const msg: UiMessage = { type: 'paginate:progress', job: { ...job.state }, rows, reset };
  chrome.runtime.sendMessage(msg).catch(() => undefined); // fenêtre fermée : on continue quand même
}

function addRows(rows: Row[]): Row[] {
  if (!job) return [];
  const fresh: Row[] = [];
  for (const r of rows) {
    const k = rowKey(r, job.columns);
    if (!k.replace(/\u0001/g, '') || job.seen.has(k)) continue;
    job.seen.add(k);
    job.rows.push(r);
    fresh.push(r);
  }
  job.state.rowCount = job.rows.length;
  return fresh;
}

/** Attend tant que la tâche est en pause ; lève si elle a été arrêtée. */
async function checkpoint(): Promise<void> {
  while (job && (job.state.status === 'paused' || job.state.status === 'needsPermission')) {
    await new Promise<void>((r) => job!.resumeWaiters.push(r));
  }
  if (!job || job.stopRequested) throw new StopSignal();
}

class StopSignal extends Error {}

/** Délai interruptible (pause / stop) entre deux pages. */
async function delay(ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await checkpoint();
    await sleep(Math.min(250, end - Date.now()));
  }
}

function randomDelay(cfg: PaginationConfig): number {
  const min = Math.max(0, Math.min(cfg.delayMin, cfg.delayMax));
  const max = Math.max(cfg.delayMin, cfg.delayMax);
  return min + Math.random() * (max - min);
}

/** Attend la fin du chargement de l'onglet ; `graceMs` laisse le temps à une navigation de démarrer. */
async function waitForTabLoad(tabId: number, graceMs: number, timeoutMs = 45_000): Promise<boolean> {
  const started = Date.now();
  let sawLoading = false;
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'loading') sawLoading = true;
    else if (sawLoading || Date.now() - started > graceMs) return sawLoading;
    await sleep(150);
  }
  return sawLoading;
}

/** Injecte le content script ; en cas de refus (autre domaine), met la tâche en attente d'autorisation. */
async function connect(tabId: number): Promise<void> {
  for (;;) {
    try {
      await ensureContentScript(tabId);
      return;
    } catch (e) {
      if (!(e instanceof AccessError) || e.kind !== 'permission' || !job) throw e;
      job.state.status = 'needsPermission';
      job.state.permission = { origin: e.detail.origin!, domain: e.detail.domain! };
      broadcast([], false);
      await checkpoint();
    }
  }
}

async function extractPage(tabId: number): Promise<number> {
  if (!job) return 0;
  await connect(tabId);
  const res = await sendToTab(tabId, { type: 'extractList', list: job.list, columns: job.columns });
  job.state.url = res.page.url;
  const fresh = addRows(res.rows);
  broadcast(fresh, false);
  return fresh.length;
}

/** Une étape de pagination. Renvoie false s'il n'y a plus rien à charger. */
async function advance(tabId: number, misses: number): Promise<boolean> {
  const { config, list } = job!;
  const waitMs = Math.max(config.delayMax, 4000);
  switch (config.mode) {
    case 'scroll': {
      await connect(tabId);
      // Un second essai plus long avant de conclure qu'il n'y a plus rien.
      const res = await sendToTab(tabId, { type: 'scrollStep', list, waitMs: misses ? waitMs * 2 : waitMs });
      return res.grew;
    }
    case 'loadMore': {
      await connect(tabId);
      const res = await sendToTab(tabId, { type: 'clickLoadMore', selector: config.selector, list, waitMs: Math.max(waitMs, 8000) });
      return res.clicked;
    }
    case 'next': {
      await connect(tabId);
      const ctl = await sendToTab(tabId, { type: 'findNext', selector: config.selector });
      if (!ctl) return false;
      if (ctl.href) {
        await chrome.tabs.update(tabId, { url: ctl.href });
        await waitForTabLoad(tabId, 3000);
      } else {
        // Bouton sans lien (site SPA) : clic dans la page. Si la page se recharge
        // malgré tout, le message échoue : on attend alors le nouveau chargement.
        try {
          await sendToTab(tabId, { type: 'clickNext', selector: config.selector, list, waitMs: Math.max(waitMs, 8000) });
        } catch {
          /* page rechargée pendant le clic */
        }
        await waitForTabLoad(tabId, 1500);
      }
      return true;
    }
    default:
      return false;
  }
}

function finish(reason: JobEndReason, error?: string): void {
  if (!job) return;
  job.state.status = reason === 'stopped' ? 'stopped' : reason === 'error' ? 'error' : 'done';
  job.state.reason = reason;
  job.state.error = error;
  job.state.endedAt = Date.now();
  job.state.permission = undefined;
  broadcast([], false);
}

async function run(tabId: number): Promise<void> {
  const keepAlive = setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000);
  try {
    // Page de départ : extraction complète (elle a pu se compléter depuis l'analyse).
    await extractPage(tabId);
    broadcast(job!.rows, true);
    let misses = 0;
    while (job!.state.page < job!.config.maxPages) {
      await checkpoint();
      if (job!.state.page > 1 || job!.config.mode === 'next') await delay(randomDelay(job!.config));
      const moved = await advance(tabId, misses);
      if (!moved) {
        // Défilement : on retente une fois avant de conclure.
        if (job!.config.mode === 'scroll' && misses === 0) {
          misses++;
          continue;
        }
        return finish('noMore');
      }
      misses = 0;
      job!.state.page++;
      const fresh = await extractPage(tabId);
      if (fresh === 0 && job!.config.mode === 'next') return finish('noNewRows');
    }
    finish('maxPages');
  } catch (e) {
    if (e instanceof StopSignal) finish('stopped');
    else finish('error', e instanceof Error ? e.message : String(e));
  } finally {
    clearInterval(keepAlive);
  }
}

function resume(): void {
  if (!job) return;
  if (job.state.status === 'paused' || job.state.status === 'needsPermission') job.state.status = 'running';
  job.state.permission = undefined;
  const waiters = job.resumeWaiters.splice(0);
  waiters.forEach((w) => w());
  broadcast([], false);
}

export type BackgroundResponse =
  | { ok: true; job: JobState | null; rows?: Row[]; columns?: Column[] }
  | { ok: false; error: string };

export function handlePaginationMessage(msg: BackgroundRequest): BackgroundResponse {
  switch (msg.type) {
    case 'paginate:start': {
      if (job && (job.state.status === 'running' || job.state.status === 'paused' || job.state.status === 'needsPermission')) {
        return { ok: false, error: 'busy' };
      }
      job = {
        state: {
          id: nextId++,
          tabId: msg.tabId,
          status: 'running',
          page: 1,
          maxPages: Math.max(1, Math.min(10_000, Math.round(msg.config.maxPages))),
          rowCount: 0,
          startedAt: Date.now(),
          endedAt: null,
        },
        config: { ...msg.config, maxPages: Math.max(1, Math.round(msg.config.maxPages)) },
        list: msg.list,
        columns: msg.columns,
        rows: [],
        seen: new Set(),
        stopRequested: false,
        resumeWaiters: [],
      };
      void run(msg.tabId);
      return { ok: true, job: { ...job.state } };
    }
    case 'paginate:pause':
      if (job?.state.status === 'running') {
        job.state.status = 'paused';
        broadcast([], false);
      }
      return { ok: true, job: job ? { ...job.state } : null };
    case 'paginate:resume':
      resume();
      return { ok: true, job: job ? { ...job.state } : null };
    case 'paginate:stop':
      if (job) {
        job.stopRequested = true;
        resume(); // débloque une éventuelle pause pour terminer proprement
      }
      return { ok: true, job: job ? { ...job.state } : null };
    case 'paginate:get':
      return { ok: true, job: job ? { ...job.state } : null, rows: job?.rows, columns: job?.columns };
  }
}
