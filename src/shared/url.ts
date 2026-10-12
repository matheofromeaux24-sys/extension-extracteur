// URL absolues et sources d'images (y compris chargement différé).

export function absoluteUrl(raw: string | null | undefined, base: string): string {
  if (!raw) return '';
  const s = raw.trim();
  if (!s || s.startsWith('javascript:') || s === '#') return '';
  try {
    return new URL(s, base).href;
  } catch {
    return '';
  }
}

/** Choisit la plus grande image d'un attribut srcset. */
export function largestFromSrcset(srcset: string | null | undefined): string {
  if (!srcset) return '';
  let best = '';
  let bestScore = -1;
  // Les URL peuvent contenir des virgules : on découpe sur « , » suivi d'un espace ou en fin de descripteur.
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, desc = '1x'] = part.trim().split(/\s+/);
    if (!url) continue;
    const n = parseFloat(desc);
    const score = desc.endsWith('w') ? n : desc.endsWith('x') ? n * 1000 : 0;
    if (score > bestScore) {
      best = url;
      bestScore = score;
    }
  }
  return best;
}

const PLACEHOLDER_RE = /(placeholder|blank|spacer|transparent|pixel|loading|lazy)\.(gif|png|svg)|^data:image\/(gif|svg)/i;

function isPlaceholder(src: string): boolean {
  return PLACEHOLDER_RE.test(src) || (src.startsWith('data:') && src.length < 200);
}

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url', 'data-hi-res-src', 'data-zoom-image'];
const LAZY_SRCSET_ATTRS = ['data-srcset', 'data-lazy-srcset'];

/** Source réelle d'une image, en privilégiant la meilleure qualité disponible. */
export function imageSource(img: Element, base: string): string {
  const candidates: string[] = [];
  for (const a of LAZY_SRCSET_ATTRS) candidates.push(largestFromSrcset(img.getAttribute(a)));
  candidates.push(largestFromSrcset(img.getAttribute('srcset')));
  // <picture><source srcset>
  const picture = img.parentElement?.tagName === 'PICTURE' ? img.parentElement : null;
  if (picture) {
    for (const s of Array.from(picture.querySelectorAll('source'))) {
      candidates.push(largestFromSrcset(s.getAttribute('srcset') || s.getAttribute('data-srcset')));
    }
  }
  for (const a of LAZY_ATTRS) candidates.push(img.getAttribute(a) || '');
  candidates.push((img as HTMLImageElement).currentSrc || '', img.getAttribute('src') || '');

  let fallback = '';
  for (const c of candidates) {
    if (!c) continue;
    if (isPlaceholder(c)) {
      fallback ||= c;
      continue;
    }
    return absoluteUrl(c, base);
  }
  return fallback.startsWith('data:') ? '' : absoluteUrl(fallback, base);
}

/** URL d'un background-image défini en style inline. */
export function backgroundImage(el: Element, base: string): string {
  const style = el.getAttribute('style');
  if (!style || !style.includes('url(')) return '';
  const m = style.match(/background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
  return m && !isPlaceholder(m[1]) ? absoluteUrl(m[1], base) : '';
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
