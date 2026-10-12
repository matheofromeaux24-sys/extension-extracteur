import { format, messages } from '../../shared/i18n';
import { moveList } from '../lib/controller';
import { jobActive, useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { IconChevronLeft, IconChevronRight, IconPencil } from './ui/Icons';

export function ListNavigator() {
  const result = useStore((s) => s.result);
  const busy = useStore((s) => (s.endedAt === null && s.startedAt !== null) || jobActive(s.job));
  if (!result) return null;
  const { list, listCount } = result;
  const L = messages.list;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex h-6 items-center rounded-md bg-brand-50 px-2 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-500">
          {format(L.position, { current: list.index + 1, total: listCount })}
        </span>
        <span className="text-neutral-500 dark:text-neutral-400">{format(L.items, { count: list.itemCount.toLocaleString('fr-FR') })}</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" variant="ghost" icon={<IconChevronLeft />} disabled={listCount < 2 || busy} title={L.switchHint} onClick={() => void moveList(-1)}>
          {L.prev}
        </Button>
        <Button size="sm" variant="ghost" disabled={listCount < 2 || busy} title={L.switchHint} onClick={() => void moveList(1)}>
          {L.next}
          <IconChevronRight />
        </Button>
        <Button size="sm" variant="secondary" icon={<IconPencil />} disabled title={L.editSoon}>
          {L.edit}
        </Button>
      </div>
    </div>
  );
}
