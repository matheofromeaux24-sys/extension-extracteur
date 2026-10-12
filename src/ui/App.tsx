import { AiModals, ToolsBar } from './components/AiTools';
import { ExportBar } from './components/ExportBar';
import { Header } from './components/Header';
import { HelpModal } from './components/HelpModal';
import { ListNavigator } from './components/ListNavigator';
import { PaginationPanel } from './components/PaginationPanel';
import {
  DetailsSoon,
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingSkeleton,
  PermissionState,
  StaleBanner,
} from './components/StatePanels';
import { StatsBar } from './components/StatsBar';
import { DataTable } from './components/table/DataTable';
import { IconAlert, IconCheck } from './components/ui/Icons';
import { useStore } from './store/useStore';

function ListMode() {
  const status = useStore((s) => s.status);
  const result = useStore((s) => s.result);
  return (
    <>
      <StaleBanner />
      {status === 'loading' && <LoadingSkeleton />}
      {status === 'empty' && <EmptyState />}
      {status === 'forbidden' && <ForbiddenState />}
      {status === 'permission' && <PermissionState />}
      {status === 'error' && <ErrorState />}
      {status === 'ready' && result && (
        <>
          <ListNavigator />
          <PaginationPanel />
          <ToolsBar />
          <div className="mx-4 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 shadow-soft dark:border-neutral-800">
            <DataTable columns={result.columns} rows={result.rows} />
          </div>
        </>
      )}
    </>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-pop dark:bg-white dark:text-neutral-900"
      >
        {toast.tone === 'success' ? <IconCheck className="text-brand-500" /> : <IconAlert className="text-amber-400" />}
        {toast.text}
        {toast.action && (
          <button
            type="button"
            onClick={toast.action.run}
            className="pointer-events-auto ml-2 rounded-lg px-2 py-0.5 font-semibold text-brand-500 hover:bg-white/10 dark:hover:bg-black/5"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export function App() {
  const mode = useStore((s) => s.mode);
  return (
    <div className="flex h-full flex-col">
      <Header />
      <StatsBar />
      <main className="flex min-h-0 flex-1 flex-col">{mode === 'list' ? <ListMode /> : <DetailsSoon />}</main>
      {mode === 'list' && <ExportBar />}
      <HelpModal />
      <AiModals />
      <Toast />
    </div>
  );
}
