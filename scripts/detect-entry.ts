// Point d'entrée de test : expose la détection dans la page (sans API chrome).
import { detectLists } from '../src/content/detect/listDetector';
import { waitForDomStable } from '../src/content/domStable';
import { extractCandidate } from '../src/content/extract';
import { detectPagination } from '../src/content/paginate';

(window as unknown as Record<string, unknown>).__scrapyTest = async () => {
  await waitForDomStable();
  const t0 = performance.now();
  const candidates = detectLists();
  const ms = Math.round(performance.now() - t0);
  const pagination = detectPagination(candidates[0]?.items ?? []);
  return {
    ms,
    pagination: {
      next: pagination.next?.label ?? null,
      loadMore: pagination.loadMore?.label ?? null,
      inner: pagination.scroll.inner,
    },
    lists: candidates.map((c, i) => {
      const { columns, rows } = i < 3 ? extractCandidate(c) : { columns: [], rows: [] };
      return {
        score: Math.round(c.score * 10) / 10,
        count: c.items.length,
        selector: c.selector,
        columns: columns.map((col) => `${col.name} [${col.kind}]`),
        rows: rows.slice(0, 2).map((r) => Object.fromEntries(columns.map((col) => [col.name, r[col.id]]))),
        allRows: rows.slice(0, 50).map((r) => Object.fromEntries(columns.map((col) => [col.name, r[col.id]]))),
      };
    }),
  };
};
