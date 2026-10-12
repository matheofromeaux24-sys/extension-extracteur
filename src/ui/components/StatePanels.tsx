// États vides, chargement (skeleton), erreurs et autorisations.

import type { ReactNode } from 'react';
import { format, messages } from '../../shared/i18n';
import { forbiddenReason } from '../../shared/messaging';
import { analyze, editList, reanalyzeCurrent, requestPermission } from '../lib/controller';
import { jobActive, useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { IconAlert, IconLock, IconPencil, IconRefresh, IconSearch } from './ui/Icons';

function Panel({ icon, tone = 'neutral', title, children }: { icon: ReactNode; tone?: 'neutral' | 'warn'; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
            tone === 'warn'
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400'
          }`}
        >
          {icon}
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const Text = ({ children }: { children: ReactNode }) => (
  <p className="mt-1.5 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{children}</p>
);

export function LoadingSkeleton() {
  const step = useStore((s) => s.loadingStep);
  return (
    <div className="flex flex-1 flex-col gap-3 p-4" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        {messages.status[step]}
      </div>
      <div className="skeleton h-9 w-full" />
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="skeleton h-7 w-11" />
          <div className="skeleton h-7 flex-[3]" style={{ opacity: 1 - i * 0.08 }} />
          <div className="skeleton h-7 flex-1" style={{ opacity: 1 - i * 0.08 }} />
          <div className="skeleton h-7 flex-[2]" style={{ opacity: 1 - i * 0.08 }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState() {
  return (
    <Panel icon={<IconSearch width={22} height={22} />} title={messages.errors.noListTitle}>
      <Text>{messages.errors.noListText}</Text>
      <div className="mt-5 flex gap-2">
        <Button variant="primary" icon={<IconPencil />} onClick={() => void editList()}>
          {messages.list.selectOnPage}
        </Button>
        <Button icon={<IconRefresh />} onClick={reanalyzeCurrent}>
          {messages.page.reanalyze}
        </Button>
      </div>
    </Panel>
  );
}

export function ForbiddenState() {
  const reason = useStore((s) => s.forbiddenReason);
  const E = messages.errors;
  const text = reason === 'file' ? E.forbiddenFile : reason === 'pdf' ? E.forbiddenPdf : E.forbiddenChrome;
  return (
    <Panel icon={<IconLock width={22} height={22} />} title={E.forbiddenTitle}>
      <Text>{text}</Text>
    </Panel>
  );
}

export function PermissionState() {
  const permission = useStore((s) => s.permission);
  const error = useStore((s) => s.error);
  const E = messages.errors;
  if (!permission) return null;
  return (
    <Panel icon={<IconLock width={22} height={22} />} title={E.permissionTitle}>
      <Text>{format(E.permissionText, { domain: permission.domain })}</Text>
      <Button className="mt-5" variant="primary" onClick={requestPermission}>
        {format(E.permissionButton, { domain: permission.domain })}
      </Button>
      {error && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{error}</p>}
    </Panel>
  );
}

export function ErrorState() {
  const error = useStore((s) => s.error);
  const target = useStore((s) => s.target);
  return (
    <Panel icon={<IconAlert width={22} height={22} />} tone="warn" title={messages.errors.genericTitle}>
      <Text>{error}</Text>
      {target && (
        <Button className="mt-5" icon={<IconRefresh />} onClick={() => void analyze(target.tabId)}>
          {messages.errors.retry}
        </Button>
      )}
    </Panel>
  );
}

export function DetailsSoon() {
  return (
    <Panel icon={<IconSearch width={22} height={22} />} title={messages.details.soonTitle}>
      <Text>{messages.details.soonText}</Text>
    </Panel>
  );
}

/** Bandeau affiché quand l'utilisateur a changé de page depuis l'analyse. */
export function StaleBanner() {
  const target = useStore((s) => s.target);
  const analyzed = useStore((s) => s.analyzed);
  const status = useStore((s) => s.status);
  const running = useStore((s) => jobActive(s.job));
  if (!target || !analyzed || status !== 'ready' || running) return null;
  const sameTab = target.tabId === analyzed.tabId;
  const samePage = sameTab && stripHash(target.url) === stripHash(analyzed.url);
  if (samePage) return null;
  const forbidden = forbiddenReason(target.url) === 'chrome';
  return (
    <div className="mx-4 mt-3 flex min-h-[44px] items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <span className="flex-1">{forbidden ? messages.page.changedForbidden : messages.page.changed}</span>
      {!forbidden && (
        <Button size="sm" variant="secondary" onClick={() => void analyze(target.tabId)}>
          {messages.page.analyzeThis}
        </Button>
      )}
    </div>
  );
}

function stripHash(u: string): string {
  return u.replace(/#.*$/, '');
}
