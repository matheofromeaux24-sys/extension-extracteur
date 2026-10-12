// Menu « Action pour charger plus d'éléments » : choix du mode de pagination,
// réglages, lancement et suivi (Pause / Reprendre / Stop).

import { format, messages } from '../../shared/i18n';
import type { PaginationMode } from '../../shared/types';
import {
  allowAndResume,
  cancelPicking,
  pausePagination,
  pickPaginationControl,
  resumePagination,
  startPagination,
  stopPagination,
} from '../lib/controller';
import { jobActive, setPagination, useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { IconChevronDown, IconDownload, IconSearch, IconX } from './ui/Icons';

const MODES: PaginationMode[] = ['none', 'scroll', 'loadMore', 'next'];

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  width = 'w-16',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  width?: string;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      className={`${width} h-8 rounded-lg border border-neutral-200 bg-white px-2 text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900`}
    />
  );
}

function ControlInfo() {
  const p = useStore((s) => s.pagination);
  const P = messages.pagination;
  if (p.mode === 'none') return null;
  if (p.mode === 'scroll') {
    return <span className="text-neutral-500 dark:text-neutral-400">{p.detection?.scroll.inner ? P.scrollInner : P.scrollPage}</span>;
  }
  if (p.picking) {
    return (
      <span className="flex items-center gap-2 text-brand-700 dark:text-brand-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        {P.picking}
        <button onClick={cancelPicking} className="rounded p-0.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Annuler">
          <IconX width={14} height={14} />
        </button>
      </span>
    );
  }
  const detected = p.mode === 'next' ? p.detection?.next : p.detection?.loadMore;
  const label = p.selectorLabel ?? detected?.label;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {label ? (
        <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-300">
          {p.selectorLabel ? P.chosen : P.detected}{' '}
          <span className="font-medium text-neutral-900 dark:text-neutral-100">« {label} »</span>
        </span>
      ) : (
        <span className="text-amber-600 dark:text-amber-400">{P.notDetected}</span>
      )}
      <button
        onClick={() => void pickPaginationControl()}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-500 dark:hover:bg-brand-500/10"
      >
        <IconSearch width={13} height={13} />
        {label ? P.pickAgain : P.pick}
      </button>
    </span>
  );
}

function JobProgress() {
  const job = useStore((s) => s.job)!;
  const P = messages.pagination;
  const pct = Math.min(100, (job.page / Math.max(1, job.maxPages)) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium">
              {job.status === 'paused' ? P.paused : job.status === 'needsPermission' ? P.waitingPermission : P.running}
            </span>
            <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
              {format(P.progress, { page: job.page, max: job.maxPages, rows: job.rowCount.toLocaleString('fr-FR') })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className={`h-full rounded-full transition-all ${job.status === 'running' ? 'bg-brand-500' : 'bg-amber-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {job.status === 'paused' ? (
          <Button size="sm" variant="secondary" onClick={resumePagination}>
            {P.resume}
          </Button>
        ) : job.status === 'running' ? (
          <Button size="sm" variant="secondary" onClick={pausePagination}>
            {P.pause}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={stopPagination} className="text-red-600 dark:text-red-400">
          {P.stop}
        </Button>
      </div>
      {job.status === 'needsPermission' && job.permission && (
        <Button size="sm" variant="primary" onClick={allowAndResume} className="self-start">
          {format(P.allow, { domain: job.permission.domain })}
        </Button>
      )}
    </div>
  );
}

export function PaginationPanel() {
  const p = useStore((s) => s.pagination);
  const job = useStore((s) => s.job);
  const active = jobActive(job);
  const P = messages.pagination;
  const maxLabel = p.mode === 'scroll' ? P.maxScrolls : p.mode === 'loadMore' ? P.maxClicks : P.maxPages;
  const startLabel = p.mode === 'scroll' ? P.startScroll : p.mode === 'loadMore' ? P.startLoadMore : P.start;
  const lastReason = job && !active && job.reason ? format(P.reasons[job.reason], { message: job.error ?? '' }) : '';

  return (
    <section className="mx-4 mb-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <label htmlFor="pagination-mode" className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {P.title}
        </label>
        <div className="relative">
          <select
            id="pagination-mode"
            value={p.mode}
            disabled={active || p.picking}
            onChange={(e) => setPagination({ mode: e.target.value as PaginationMode, modeTouched: true, selector: undefined, selectorLabel: undefined })}
            className="h-8 appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-8 text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {P.modes[m]}
              </option>
            ))}
          </select>
          <IconChevronDown className="pointer-events-none absolute right-2 top-2 text-neutral-400" />
        </div>
        {!active && <ControlInfo />}
      </div>

      {p.mode !== 'none' && (
        <div className="mt-3">
          {active ? (
            <JobProgress />
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                {maxLabel}
                <NumberField label={maxLabel} value={p.maxPages} min={1} max={10000} onChange={(v) => setPagination({ maxPages: v })} />
              </label>
              <label className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                {P.delay}
                <NumberField label={`${P.delay} min`} value={p.delayMin} min={0} max={120} step={0.5} width="w-14" onChange={(v) => setPagination({ delayMin: v })} />
                <span className="text-neutral-400">–</span>
                <NumberField label={`${P.delay} max`} value={p.delayMax} min={0} max={120} step={0.5} width="w-14" onChange={(v) => setPagination({ delayMax: v })} />
                {P.delayUnit}
              </label>
              <Button variant="export" size="sm" icon={<IconDownload />} className="ml-auto" disabled={p.picking} onClick={() => void startPagination()}>
                {startLabel}
              </Button>
            </div>
          )}
        </div>
      )}
      {lastReason && <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{lastReason}</p>}
    </section>
  );
}
