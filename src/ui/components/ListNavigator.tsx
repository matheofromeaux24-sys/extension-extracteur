import { format, messages } from '../../shared/i18n';
import { addColumn, cancelPageSelection, editList, moveList } from '../lib/controller';
import { jobActive, useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { IconChevronLeft, IconChevronRight, IconPencil, IconPlus, IconX } from './ui/Icons';

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: JSX.Element }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} — ${messages.list.switchHint}`}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {children}
    </button>
  );
}

/** Liste sélectionnée, navigation entre listes détectées et sélecteur visuel. */
export function ListNavigator() {
  const result = useStore((s) => s.result);
  const picking = useStore((s) => s.picking);
  const running = useStore((s) => jobActive(s.job));
  const loading = useStore((s) => s.endedAt === null && s.startedAt !== null);
  if (!result) return null;
  const { list, listCount } = result;
  const L = messages.list;
  const busy = loading || running || picking !== null;

  if (picking) {
    return (
      <div className="mx-4 my-2.5 flex items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        <span className="flex-1">{picking === 'list' ? L.editHint : L.addColumnHint}</span>
        <Button size="sm" variant="ghost" icon={<IconX />} onClick={cancelPageSelection}>
          {messages.picker.cancel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <div className="flex items-center gap-1 text-sm">
        <ArrowButton label={L.prev} disabled={listCount < 2 || busy} onClick={() => void moveList(-1)}>
          <IconChevronLeft />
        </ArrowButton>
        <span className="inline-flex h-6 items-center rounded-md bg-brand-50 px-2 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-500">
          {format(L.position, { current: list.index + 1, total: listCount })}
        </span>
        <ArrowButton label={L.next} disabled={listCount < 2 || busy} onClick={() => void moveList(1)}>
          <IconChevronRight />
        </ArrowButton>
        <span className="ml-1 text-neutral-500 dark:text-neutral-400">{format(L.items, { count: list.itemCount.toLocaleString('fr-FR') })}</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" variant="secondary" icon={<IconPencil />} disabled={busy} title={L.editHint} onClick={() => void editList()}>
          {L.edit}
        </Button>
        <Button size="sm" variant="secondary" icon={<IconPlus />} disabled={busy} title={L.addColumnHint} onClick={() => void addColumn()}>
          {L.addColumn}
        </Button>
      </div>
    </div>
  );
}
