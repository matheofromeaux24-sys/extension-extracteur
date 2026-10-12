import { useEffect, useState } from 'react';
import { messages } from '../../shared/i18n';
import { domainOf } from '../../shared/url';
import { reanalyzeCurrent } from '../lib/controller';
import { useStore } from '../store/useStore';
import { IconRefresh } from './ui/Icons';

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m} min ${String(s).padStart(2, '0')} s`;
}

/** Chrono en direct tant que l'extraction n'est pas terminée. */
function useElapsed(startedAt: number | null, endedAt: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt || endedAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [startedAt, endedAt]);
  if (!startedAt) return 0;
  return (endedAt ?? now) - startedAt;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function StatsBar() {
  const target = useStore((s) => s.target);
  const result = useStore((s) => s.result);
  const status = useStore((s) => s.status);
  const pages = useStore((s) => s.pages);
  const elapsed = useElapsed(useStore((s) => s.startedAt), useStore((s) => s.endedAt));

  const title = result?.page.title || target?.title || messages.page.noTab;
  const domain = result?.page.domain || (target ? domainOf(target.url) : '');
  const favicon = target?.favIconUrl && /^https?:|^data:/.test(target.favIconUrl) ? target.favIconUrl : '';

  return (
    <div className="flex items-center gap-4 border-b border-neutral-200/80 px-4 py-3 dark:border-neutral-800">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
          {favicon ? <img src={favicon} alt="" className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-brand-500" />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={title}>
            {title}
          </div>
          <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">{domain}</div>
        </div>
        <button
          onClick={reanalyzeCurrent}
          disabled={!target || status === 'loading'}
          title={messages.page.reanalyze}
          aria-label={messages.page.reanalyze}
          className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <IconRefresh className={status === 'loading' ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <Stat label={messages.stats.pages} value={String(pages)} />
        <Stat label={messages.stats.items} value={(result?.rows.length ?? 0).toLocaleString('fr-FR')} />
        <Stat label={messages.stats.duration} value={formatDuration(elapsed)} />
      </div>
    </div>
  );
}
