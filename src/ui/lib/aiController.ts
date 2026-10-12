// Pilotage des fonctions IA depuis l'interface.

import { getAiSettings } from '../../shared/ai';
import { format, messages } from '../../shared/i18n';
import { getState, setState, showToast } from '../store/useStore';
import { analyzeAds, fillNlColumns, planNlColumns, synthesize } from './aiFeatures';
import { computeWinningScore } from './score';

const A = messages.ai;
let controller: AbortController | null = null;

/** Ouvre la modale demandée, ou les réglages si aucune clé n'est enregistrée. */
export async function openAiTool(modal: 'aiConfirm' | 'nl' | 'synthesis'): Promise<void> {
  const s = await getAiSettings();
  setState({ modal: s.apiKey ? modal : 'aiSettings' });
}

export function stopAiTask(): void {
  controller?.abort();
}

function begin(label: string, total: number): AbortSignal {
  controller?.abort();
  controller = new AbortController();
  setState({ aiTask: { label, done: 0, total }, modal: null });
  return controller.signal;
}

function end(): void {
  controller = null;
  setState({ aiTask: null });
}

function reportErrors(errors: string[]): void {
  if (errors.length) showToast(format(A.partial, { failed: errors.length, message: errors[0] }), 'error');
}

export async function runAdAnalysis(): Promise<void> {
  const { result } = getState();
  if (!result) return;
  const signal = begin(messages.tools.analyze, result.rows.length);
  try {
    const out = await analyzeAds(result, (p) => setState({ aiTask: { label: messages.tools.analyze, ...p } }), signal);
    // Les lignes ont pu changer pendant l'analyse (pagination) : on ne remplace que si c'est le même jeu.
    if (getState().result?.rows.length === result.rows.length) setState({ result: out.result });
    showToast(format(A.done, { count: result.rows.length, columns: 7 }));
    reportErrors(out.errors);
  } catch (e) {
    showToast(format(A.failed, { message: e instanceof Error ? e.message : String(e) }), 'error');
  } finally {
    end();
  }
}

export async function runNlColumns(instruction: string): Promise<void> {
  const { result } = getState();
  if (!result || !instruction.trim()) return;
  const signal = begin(A.nlPlanning, result.rows.length);
  try {
    const plan = await planNlColumns(instruction, result, signal);
    const label = format(A.nlColumns, { names: plan.map((c) => c.name).join(', ') });
    setState({ aiTask: { label, done: 0, total: result.rows.length } });
    const out = await fillNlColumns(plan, result, (p) => setState({ aiTask: { label, ...p } }), signal);
    if (getState().result?.rows.length === result.rows.length) setState({ result: out.result });
    showToast(format(A.done, { count: result.rows.length, columns: plan.length }));
    reportErrors(out.errors);
  } catch (e) {
    showToast(format(A.failed, { message: e instanceof Error ? e.message : String(e) }), 'error');
  } finally {
    end();
  }
}

/** Synthèse : le texte arrive au fil de l'eau dans `onText`. */
export async function runSynthesis(onText: (full: string) => void): Promise<string | null> {
  const { result } = getState();
  if (!result) return null;
  controller?.abort();
  controller = new AbortController();
  try {
    return await synthesize(result, onText, controller.signal);
  } catch (e) {
    showToast(format(A.failed, { message: e instanceof Error ? e.message : String(e) }), 'error');
    return null;
  } finally {
    controller = null;
  }
}

export function runWinningScore(): void {
  const { result } = getState();
  if (!result) return;
  const { result: scored, hadDates } = computeWinningScore(result);
  setState({ result: scored });
  showToast(hadDates ? messages.score.done : messages.score.noDates, hadDates ? 'success' : 'error');
}
