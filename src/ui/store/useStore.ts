// État global de l'interface (Zustand).

import { create } from 'zustand';
import type { ForbiddenReason } from '../../shared/messaging';
import type { ExtractResult, JobState, PaginationDetection, PaginationMode } from '../../shared/types';

export type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'forbidden' | 'permission' | 'error';
export type Mode = 'list' | 'details';

export interface TargetPage {
  tabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

export interface PaginationSettings {
  mode: PaginationMode;
  /** L'utilisateur a choisi le mode lui-même : on ne le remplace plus par la détection. */
  modeTouched: boolean;
  maxPages: number;
  /** Délais en secondes. */
  delayMin: number;
  delayMax: number;
  /** Élément choisi par clic sur la page. */
  selector?: string;
  selectorLabel?: string;
  detection: PaginationDetection | null;
  picking: boolean;
}

export interface State {
  mode: Mode;
  /** Onglet actuellement au premier plan dans le navigateur. */
  target: TargetPage | null;
  /** Onglet + URL d'où proviennent les résultats affichés. */
  analyzed: { tabId: number; url: string } | null;
  status: Status;
  loadingStep: 'injecting' | 'detecting';
  forbiddenReason: ForbiddenReason | null;
  permission: { origin: string; domain: string } | null;
  error: string | null;
  result: ExtractResult | null;
  pages: number;
  startedAt: number | null;
  endedAt: number | null;
  helpOpen: boolean;
  toast: Toast | null;
  pagination: PaginationSettings;
  job: JobState | null;
  /** Sélection par clic en cours dans la page. */
  picking: 'list' | 'column' | null;
}

export function jobActive(job: JobState | null): boolean {
  return !!job && (job.status === 'running' || job.status === 'paused' || job.status === 'needsPermission');
}

export const useStore = create<State>(() => ({
  mode: 'list',
  target: null,
  analyzed: null,
  status: 'idle',
  loadingStep: 'injecting',
  forbiddenReason: null,
  permission: null,
  error: null,
  result: null,
  pages: 0,
  startedAt: null,
  endedAt: null,
  helpOpen: false,
  toast: null,
  pagination: {
    mode: 'none',
    modeTouched: false,
    maxPages: 10,
    delayMin: 1,
    delayMax: 3,
    detection: null,
    picking: false,
  },
  job: null,
  picking: null,
}));

export function setPagination(patch: Partial<PaginationSettings>): void {
  setState((s) => ({ pagination: { ...s.pagination, ...patch } }));
}

export const setState = useStore.setState;
export const getState = useStore.getState;

let toastTimer = 0;
export function showToast(text: string, tone: Toast['tone'] = 'success'): void {
  window.clearTimeout(toastTimer);
  setState({ toast: { id: Date.now(), text, tone } });
  toastTimer = window.setTimeout(() => setState({ toast: null }), 3200);
}
