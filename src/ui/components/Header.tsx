import { messages } from '../../shared/i18n';
import { setState, useStore, type Mode } from '../store/useStore';
import { IconHelp, IconSettings, Logo } from './ui/Icons';

const MODES: Mode[] = ['list', 'details'];

export function Header() {
  const mode = useStore((s) => s.mode);
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200/80 px-4 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <Logo size={26} />
        <span className="text-[15px] font-semibold tracking-tight">{messages.appName}</span>
      </div>

      <div role="tablist" aria-label="Mode" className="mx-auto flex rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900">
        {MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setState({ mode: m })}
            className={`h-7 rounded-lg px-3 text-[13px] font-medium transition-colors ${
              mode === m
                ? 'bg-neutral-900 text-white shadow-soft dark:bg-white dark:text-neutral-900'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
            }`}
          >
            {messages.modes[m]}
          </button>
        ))}
      </div>

      <button
        onClick={() => setState({ modal: 'aiSettings' })}
        title={messages.tools.settings}
        aria-label={messages.tools.settings}
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        <IconSettings />
      </button>
      <button
        onClick={() => setState({ helpOpen: true })}
        className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        <IconHelp />
        {messages.header.help}
      </button>
    </header>
  );
}
