import { useEffect } from 'react';
import { messages } from '../../shared/i18n';
import { setState, useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { IconX } from './ui/Icons';

export function HelpModal() {
  const open = useStore((s) => s.helpOpen);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setState({ helpOpen: false });
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  if (!open) return null;
  const H = messages.help;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]" onClick={() => setState({ helpOpen: false })}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-pop dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="help-title" className="text-base font-semibold">
            {H.title}
          </h2>
          <button
            onClick={() => setState({ helpOpen: false })}
            aria-label={H.close}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <IconX />
          </button>
        </div>
        <ol className="space-y-3">
          {H.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-500">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <p className="mt-5 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400">{H.shortcut}</p>
        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={() => setState({ helpOpen: false })}>
            {H.close}
          </Button>
        </div>
      </div>
    </div>
  );
}
