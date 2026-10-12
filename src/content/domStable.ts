// Attend que le DOM cesse de changer (sites SPA : React, Vue…) avant d'extraire.

export interface StableOptions {
  /** Durée sans mutation significative pour considérer le DOM stable. */
  quietMs?: number;
  /** Délai maximal d'attente, au-delà on extrait quand même. */
  timeoutMs?: number;
}

function waitForReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) =>
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
  );
}

export async function waitForDomStable({ quietMs = 500, timeoutMs = 4000 }: StableOptions = {}): Promise<void> {
  await waitForReady();
  await new Promise<void>((resolve) => {
    let timer = window.setTimeout(done, quietMs);
    const hardStop = window.setTimeout(done, timeoutMs);
    const observer = new MutationObserver((mutations) => {
      // Les seules mutations d'attributs (animations, classes de survol) ne comptent pas.
      if (!mutations.some((m) => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(done, quietMs);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    function done() {
      observer.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(hardStop);
      resolve();
    }
  });
}
