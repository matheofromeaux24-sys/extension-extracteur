import { useEffect, useRef, useState } from 'react';
import { format, messages } from '../../shared/i18n';
import { copyTSV, downloadCSV, downloadXLSX, fileBaseName } from '../lib/export';
import { showToast, useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { IconChevronDown, IconCopy, IconDownload, IconFile, IconTable } from './ui/Icons';

type Format = 'csvExcel' | 'csvComma' | 'xlsx';

export function ExportBar() {
  const result = useStore((s) => s.result);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const L = messages.export;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const disabled = !result || result.rows.length === 0;

  async function onCopy() {
    if (!result) return;
    try {
      await copyTSV(result.columns, result.rows);
      showToast(format(L.copied, { count: result.rows.length.toLocaleString('fr-FR') }));
    } catch (e) {
      showToast(format(L.error, { message: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  async function onDownload(f: Format) {
    setOpen(false);
    if (!result) return;
    const base = fileBaseName(result.page.domain);
    try {
      const name =
        f === 'xlsx'
          ? await downloadXLSX(base, result.columns, result.rows, result.page.domain)
          : downloadCSV(base, result.columns, result.rows, f === 'csvExcel' ? ';' : ',');
      showToast(format(L.downloaded, { name }));
    } catch (e) {
      showToast(format(L.error, { message: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  const items: Array<{ id: Format; label: string; icon: JSX.Element }> = [
    { id: 'xlsx', label: L.xlsx, icon: <IconTable /> },
    { id: 'csvExcel', label: L.csvExcel, icon: <IconFile /> },
    { id: 'csvComma', label: L.csvComma, icon: <IconFile /> },
  ];

  return (
    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200/80 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
      <Button variant="exportOutline" icon={<IconCopy />} disabled={disabled} onClick={() => void onCopy()}>
        {L.copy}
      </Button>
      <div className="relative" ref={menuRef}>
        <Button variant="export" icon={<IconDownload />} disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
          {L.download}
          <IconChevronDown className="-mr-1 opacity-80" />
        </Button>
        {open && (
          <div
            role="menu"
            className="absolute bottom-full right-0 mb-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-pop dark:border-neutral-800 dark:bg-neutral-900"
          >
            {items.map((it) => (
              <button
                key={it.id}
                role="menuitem"
                onClick={() => void onDownload(it.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="text-brand-600">{it.icon}</span>
                {it.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
