// Actions de l'interface : analyse de la page, navigation entre listes, autorisations.

import { messages } from '../../shared/i18n';
import { AccessError, ensureContentScript, sendToTab } from '../../shared/messaging';
import { getState, setState } from '../store/useStore';

let runId = 0;

export async function analyze(tabId: number): Promise<void> {
  const id = ++runId;
  const previous = getState().analyzed;
  if (previous && previous.tabId !== tabId) {
    // On retire la surbrillance laissée sur l'ancien onglet.
    sendToTab(previous.tabId, { type: 'clearHighlight' }).catch(() => undefined);
  }
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
    });
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
    setState({ result: next, status: next ? 'ready' : 'empty', endedAt: Date.now() });
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
