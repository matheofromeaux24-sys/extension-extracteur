// Barre d'outils IA (analyse, colonnes en langage naturel, score, synthèse)
// et fenêtres associées (réglages, confirmation, saisie, rapport).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AI_MODELS, getAiSettings, requestImageAccess, saveAiSettings, testAiKey, type AiModel, type AiSettings } from '../../shared/ai';
import { format, messages } from '../../shared/i18n';
import { adAnalysisEstimate, adImageUrls } from '../lib/aiFeatures';
import { openAiTool, runAdAnalysis, runNlColumns, runSynthesis, runWinningScore, stopAiTask } from '../lib/aiController';
import { downloadBlob, fileBaseName } from '../lib/export';
import { jobActive, setState, showToast, useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { IconCopy, IconDownload, IconReport, IconSparkles, IconTrophy, IconX } from './ui/Icons';

const T = messages.tools;
const A = messages.ai;

// ---------------------------------------------------------------------------
// Barre d'outils

export function ToolsBar() {
  const result = useStore((s) => s.result);
  const task = useStore((s) => s.aiTask);
  const busy = useStore((s) => jobActive(s.job) || s.picking !== null);
  if (!result) return null;

  if (task) {
    const pct = task.total ? Math.round((task.done / task.total) * 100) : 0;
    return (
      <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-500/30 dark:bg-violet-500/10">
        <IconSparkles className="shrink-0 animate-pulse text-violet-600 dark:text-violet-400" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="truncate font-medium text-violet-900 dark:text-violet-200">{task.label}</span>
            <span className="shrink-0 tabular-nums text-violet-700 dark:text-violet-300">{format(A.progress, { done: task.done, total: task.total })}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-900/40">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={stopAiTask}>
          {A.stop}
        </Button>
      </div>
    );
  }

  const disabled = busy || result.rows.length === 0;
  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="secondary" icon={<IconSparkles className="text-violet-600 dark:text-violet-400" />} title={T.analyzeHint} disabled={disabled} onClick={() => void openAiTool('aiConfirm')}>
        {T.analyze}
      </Button>
      <Button size="sm" variant="secondary" icon={<IconSparkles className="text-violet-600 dark:text-violet-400" />} title={T.aiColumnsHint} disabled={disabled} onClick={() => void openAiTool('nl')}>
        {T.aiColumns}
      </Button>
      <Button size="sm" variant="secondary" icon={<IconTrophy className="text-amber-500" />} title={T.scoreHint} disabled={disabled} onClick={runWinningScore}>
        {T.score}
      </Button>
      <Button size="sm" variant="secondary" icon={<IconReport className="text-violet-600 dark:text-violet-400" />} title={T.synthesisHint} disabled={disabled} onClick={() => void openAiTool('synthesis')}>
        {T.synthesis}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fenêtre modale générique

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full flex-col rounded-2xl bg-white shadow-pop dark:bg-neutral-900 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label={A.cancel} className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <IconX />
          </button>
        </div>
        <div className="min-h-0 overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

const close = () => setState({ modal: null });
const inputClass =
  'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-neutral-700 dark:bg-neutral-950';

// ---------------------------------------------------------------------------
// Réglages IA

function AiSettingsModal() {
  const [s, setS] = useState<AiSettings | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void getAiSettings().then(setS);
  }, []);
  if (!s) return null;
  const hadKey = s.apiKey.length > 0;
  return (
    <Modal title={A.settingsTitle} onClose={close}>
      <p className="mb-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{A.settingsText}</p>
      <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{A.privacy}</p>
      <label className="mb-1 block text-sm font-medium" htmlFor="ai-key">
        {A.keyLabel}
      </label>
      <input
        id="ai-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={A.keyPlaceholder}
        value={s.apiKey}
        onChange={(e) => setS({ ...s, apiKey: e.target.value.trim() })}
        className={inputClass}
      />
      <p className="mt-1 text-xs text-neutral-500">{A.keyHelp}</p>
      <label className="mb-1 mt-4 block text-sm font-medium" htmlFor="ai-model">
        {A.modelLabel}
      </label>
      <select id="ai-model" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value as AiModel })} className={inputClass}>
        {AI_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {A.models[m.id]}
          </option>
        ))}
      </select>
      {testMsg && <p className={`mt-3 text-sm ${testMsg.ok ? 'text-brand-600' : 'text-red-600 dark:text-red-400'}`}>{testMsg.text}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          disabled={!s.apiKey || testing}
          onClick={async () => {
            setTesting(true);
            setTestMsg(null);
            try {
              await testAiKey(s);
              setTestMsg({ ok: true, text: A.testOk });
            } catch (e) {
              setTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? A.testing : A.test}
        </Button>
        {hadKey && (
          <Button variant="ghost" onClick={() => setS({ ...s, apiKey: '' })}>
            {A.remove}
          </Button>
        )}
        <Button
          variant="primary"
          className="ml-auto"
          onClick={async () => {
            await saveAiSettings(s);
            showToast(A.saved);
            close();
          }}
        >
          {A.save}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Confirmation de l'analyse (avec estimation du coût)

function AiConfirmModal() {
  const result = useStore((s) => s.result);
  const [model, setModel] = useState<AiModel | null>(null);
  useEffect(() => {
    void getAiSettings().then((s) => setModel(s.model));
  }, []);
  if (!result || !model) return null;
  const est = adAnalysisEstimate(result, model);
  return (
    <Modal title={A.confirmTitle} onClose={close}>
      <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {format(A.confirmText, { count: result.rows.length, requests: est.requests, minutes: est.minutes })}
      </p>
      {est.images > 0 && <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{format(A.confirmImages, { domains: est.domains.join(', ') })}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          {A.cancel}
        </Button>
        <Button
          variant="primary"
          icon={<IconSparkles />}
          onClick={() => {
            // La demande d'accès aux images doit partir directement du clic.
            void requestImageAccess(adImageUrls(result)).finally(() => void runAdAnalysis());
          }}
        >
          {A.run}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Colonnes IA en langage naturel

function NlModal() {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Modal title={A.nlTitle} onClose={close}>
      <p className="mb-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{A.nlText}</p>
      <textarea
        ref={ref}
        rows={4}
        value={text}
        placeholder={A.nlPlaceholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) void runNlColumns(text);
        }}
        className={`${inputClass} resize-none`}
        aria-label={A.nlTitle}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {A.nlExamples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setText(ex)}
            className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-violet-300 hover:bg-violet-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-violet-500/10"
          >
            {ex}
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          {A.cancel}
        </Button>
        <Button variant="primary" icon={<IconSparkles />} disabled={!text.trim()} onClick={() => void runNlColumns(text)}>
          {A.run}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Synthèse stratégique (Markdown rendu simplement, sans HTML brut)

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="mb-3 list-disc space-y-1 pl-5">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  source.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) return void list.push(t.replace(/^([-*•]|\d+[.)])\s+/, ''));
    flush();
    if (!t) return;
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(
        <h3 key={i} className={`${h[1].length <= 2 ? 'mt-5 text-base' : 'mt-4 text-sm'} mb-2 font-semibold text-neutral-900 first:mt-0 dark:text-neutral-100`}>
          {inline(h[2])}
        </h3>,
      );
    } else {
      blocks.push(
        <p key={i} className="mb-3">
          {inline(t)}
        </p>,
      );
    }
  });
  flush();
  return <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{blocks}</div>;
}

function SynthesisModal() {
  const result = useStore((s) => s.result);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void runSynthesis((full) => !cancelled && setText(full)).then((final) => {
      if (cancelled) return;
      if (final) setText(final);
      setRunning(false);
    });
    return () => {
      cancelled = true;
      stopAiTask();
    };
  }, []);
  const name = `${fileBaseName(result?.page.domain ?? '')}_synthese.md`;
  return (
    <Modal title={A.synthesisTitle} onClose={close} wide>
      {running && !text && (
        <div className="flex items-center gap-2 py-6 text-sm text-violet-700 dark:text-violet-300">
          <IconSparkles className="animate-pulse" />
          {A.synthesisRunning}
        </div>
      )}
      {text && <Markdown source={text} />}
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        {running && text && <span className="mr-auto text-xs text-violet-600">{A.synthesisRunning}</span>}
        <Button
          size="sm"
          icon={<IconCopy />}
          disabled={!text}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            showToast(A.copied);
          }}
        >
          {A.copy}
        </Button>
        <Button size="sm" variant="export" icon={<IconDownload />} disabled={!text || running} onClick={() => downloadBlob(name, new Blob([text], { type: 'text/markdown;charset=utf-8' }))}>
          {A.downloadMd}
        </Button>
      </div>
    </Modal>
  );
}

export function AiModals() {
  const modal = useStore((s) => s.modal);
  if (modal === 'aiSettings') return <AiSettingsModal />;
  if (modal === 'aiConfirm') return <AiConfirmModal />;
  if (modal === 'nl') return <NlModal />;
  if (modal === 'synthesis') return <SynthesisModal />;
  return null;
}
