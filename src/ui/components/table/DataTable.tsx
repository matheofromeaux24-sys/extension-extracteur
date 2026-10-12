// Tableau de résultats virtualisé : seules les lignes visibles sont rendues,
// ce qui reste fluide au-delà de 10 000 lignes.

import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useRef, useState } from 'react';
import { messages } from '../../../shared/i18n';
import type { Column, ColumnKind, Row } from '../../../shared/types';
import { IconExternal, IconX } from '../ui/Icons';

const ROW_HEIGHT = 36;
const INDEX_WIDTH = 52;

const WIDTH: Record<ColumnKind, number> = {
  title: 280,
  description: 320,
  text: 180,
  link: 220,
  image: 92,
  price: 110,
  date: 140,
  rating: 140,
  number: 100,
  email: 200,
  phone: 150,
};

const KIND_BADGE: Partial<Record<ColumnKind, string>> = {
  link: '↗',
  image: '▣',
  price: '€',
  date: '◷',
  rating: '★',
  number: '#',
  email: '@',
  phone: '☎',
};

interface Preview {
  src: string;
  x: number;
  y: number;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname + u.search);
    return path.length > 1 ? path : u.hostname;
  } catch {
    return url;
  }
}

function ImageCell({ src, onPreview }: { src: string; onPreview: (p: Preview | null) => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span title={src} className="flex h-7 w-11 items-center justify-center rounded-md bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
        <IconX width={12} height={12} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      title={src}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-7 w-11 rounded-md bg-neutral-100 object-cover ring-1 ring-black/5 dark:bg-neutral-800"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPreview({ src, x: r.right + 8, y: r.top });
      }}
      onMouseLeave={() => onPreview(null)}
      onError={() => setFailed(true)}
    />
  );
}

const Cell = memo(function Cell({
  value,
  column,
  onPreview,
}: {
  value: string;
  column: Column;
  onPreview: (p: Preview | null) => void;
}) {
  if (!value) return <span className="text-neutral-300 dark:text-neutral-700">—</span>;
  if (column.kind === 'image') return <ImageCell src={value} onPreview={onPreview} />;
  if (column.kind === 'link') {
    return (
      <span className="group flex min-w-0 items-center gap-1">
        <span className="truncate text-neutral-600 dark:text-neutral-300" title={value}>
          {shortUrl(value)}
        </span>
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          title={messages.table.openLink}
          className="shrink-0 text-neutral-400 opacity-0 hover:text-brand-600 group-hover:opacity-100"
        >
          <IconExternal width={13} height={13} />
        </a>
      </span>
    );
  }
  return (
    <span className={`block truncate ${column.kind === 'title' ? 'font-medium' : ''}`} title={value}>
      {value}
    </span>
  );
});

export function DataTable({ columns, rows }: { columns: Column[]; rows: Row[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const widths = columns.map((c) => WIDTH[c.kind] ?? 180);
  const totalWidth = INDEX_WIDTH + widths.reduce((a, b) => a + b, 0);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" onScroll={() => preview && setPreview(null)}>
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* En-tête collant */}
          <div className="sticky top-0 z-10 flex border-b border-neutral-200 bg-neutral-50/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center justify-end bg-neutral-50 px-3 text-xs font-medium text-neutral-400 dark:bg-neutral-900"
              style={{ width: INDEX_WIDTH, height: ROW_HEIGHT }}
            >
              {messages.table.rowNumber}
            </div>
            {columns.map((c, i) => (
              <div
                key={c.id}
                className="flex shrink-0 items-center gap-1.5 border-l border-neutral-200/70 px-3 text-xs font-semibold text-neutral-700 dark:border-neutral-800 dark:text-neutral-200"
                style={{ width: widths[i], height: ROW_HEIGHT }}
                title={c.name}
              >
                {KIND_BADGE[c.kind] && <span className="text-[11px] font-normal text-neutral-400">{KIND_BADGE[c.kind]}</span>}
                <span className="truncate">{c.name}</span>
              </div>
            ))}
          </div>

          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index];
              return (
                <div
                  key={v.key}
                  className="absolute left-0 flex w-full border-b border-neutral-100 text-[13px] hover:bg-neutral-50 dark:border-neutral-800/70 dark:hover:bg-neutral-900"
                  style={{ height: ROW_HEIGHT, transform: `translateY(${v.start}px)` }}
                >
                  <div
                    className="sticky left-0 flex shrink-0 items-center justify-end bg-white px-3 text-xs tabular-nums text-neutral-400 dark:bg-neutral-950"
                    style={{ width: INDEX_WIDTH }}
                  >
                    {v.index + 1}
                  </div>
                  {columns.map((c, i) => (
                    <div key={c.id} className="flex min-w-0 shrink-0 items-center px-3" style={{ width: widths[i] }}>
                      <Cell value={row[c.id]} column={c} onPreview={setPreview} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {preview && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-black/5 dark:bg-neutral-900"
          style={{ left: Math.min(preview.x, window.innerWidth - 232), top: Math.min(preview.y, window.innerHeight - 232) }}
        >
          <img src={preview.src} alt="" referrerPolicy="no-referrer" className="max-h-[220px] max-w-[220px] rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
