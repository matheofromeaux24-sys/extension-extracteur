// Accès à l'IA gratuite Google Gemini (offre gratuite de Google AI Studio),
// directement depuis le navigateur avec la clé de l'utilisateur. Aucun serveur
// intermédiaire. La clé reste dans chrome.storage.local (cet ordinateur).

import { messages } from './i18n';

/** Identifiant de modèle Gemini (alias « -latest » par défaut, ou modèle précis trouvé automatiquement). */
export type AiModel = string;

export interface AiSettings {
  apiKey: string;
  model: AiModel;
}

/** Modèles de l'offre gratuite. Les alias « -latest » suivent automatiquement la dernière version. */
export const AI_MODELS: Array<{ id: 'gemini-flash-latest' | 'gemini-flash-lite-latest'; rpm: number }> = [
  { id: 'gemini-flash-latest', rpm: 10 },
  { id: 'gemini-flash-lite-latest', rpm: 15 },
];

const KEY = 'aiSettings';
const DEFAULTS: AiSettings = { apiKey: '', model: 'gemini-flash-latest' };
const API = 'https://generativelanguage.googleapis.com/v1beta';

export async function getAiSettings(): Promise<AiSettings> {
  const data = await chrome.storage.local.get(KEY);
  const saved = data[KEY] as Partial<AiSettings> | undefined;
  return { ...DEFAULTS, ...saved, model: saved?.model || DEFAULTS.model };
}

export async function saveAiSettings(s: AiSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

/** Durée estimée (minutes) pour un nombre de requêtes, au rythme de l'offre gratuite. */
export function estimateMinutes(model: AiModel, requests: number): number {
  return Math.max(1, Math.ceil(requests / (rpmOf(model) * 0.9)));
}

function rpmOf(model: AiModel): number {
  return /lite/.test(model) ? 15 : 10;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: 'model' | 'other' = 'other',
  ) {
    super(message);
  }
}

export type Part = { type: 'text'; text: string } | { type: 'image'; url: string };

// ---------------------------------------------------------------------------
// Rythme : l'offre gratuite limite le nombre de requêtes par minute.

let nextSlot = 0;

async function waitForSlot(model: AiModel, signal?: AbortSignal): Promise<void> {
  const interval = Math.ceil(60_000 / (rpmOf(model) * 0.9));
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + interval;
  await sleep(at - now, signal);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AiError(messages.ai.errors.aborted));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new AiError(messages.ai.errors.aborted));
      },
      { once: true },
    );
  });
}

// ---------------------------------------------------------------------------
// Images : téléchargées par l'extension, réduites, puis envoyées en base64
// (l'API Gemini ne va pas chercher les images sur le web).

/** Domaines des images à autoriser (ex. https://*.fbcdn.net/*). */
export function imageOrigins(urls: string[]): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    try {
      const { protocol, hostname } = new URL(u);
      if (protocol !== 'https:' && protocol !== 'http:') continue;
      const labels = hostname.split('.');
      out.add(labels.length > 2 ? `${protocol}//*.${labels.slice(-2).join('.')}/*` : `${protocol}//${hostname}/*`);
    } catch {
      /* adresse invalide */
    }
  }
  return Array.from(out);
}

/**
 * Demande l'accès aux domaines des images. À appeler directement dans un clic :
 * Chrome exige un geste de l'utilisateur. Renvoie false si refusé (analyse sur le texte seul).
 */
export function requestImageAccess(urls: string[]): Promise<boolean> {
  const origins = imageOrigins(urls);
  if (!origins.length) return Promise.resolve(true);
  return chrome.permissions.request({ origins }).catch(() => false);
}

async function imageToBase64(url: string, signal?: AbortSignal): Promise<{ mimeType: string; data: string } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    // Réduction à 768 px max : moins de données envoyées, quota préservé.
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    const buf = new Uint8Array(await jpeg.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { mimeType: 'image/jpeg', data: btoa(bin) };
  } catch {
    return null; // pas d'accès au domaine, image supprimée… : on continue sans
  }
}

async function toGeminiParts(parts: Part[], signal?: AbortSignal): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const p of parts) {
    if (p.type === 'text') out.push({ text: p.text });
    else {
      const img = await imageToBase64(p.url, signal);
      if (img) out.push({ inlineData: img });
      else out.push({ text: '(visuel indisponible)' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schéma JSON → format « responseSchema » de Gemini (sous-ensemble OpenAPI).

function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties') continue;
    if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, Record<string, unknown>>).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
      out.propertyOrdering = Object.keys(v as object);
    } else if (k === 'items' && v && typeof v === 'object') out.items = toGeminiSchema(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Appels

interface GeminiError {
  error?: { code?: number; message?: string; status?: string; details?: Array<Record<string, unknown>> };
}

function retryDelayMs(body: GeminiError): number | null {
  const info = body.error?.details?.find((d) => String(d['@type'] ?? '').includes('RetryInfo'));
  const delay = info?.retryDelay as string | undefined;
  return delay ? Math.ceil(parseFloat(delay) * 1000) : null;
}

function dailyQuota(body: GeminiError): boolean {
  return JSON.stringify(body.error?.details ?? []).includes('PerDay');
}

async function call(path: string, apiKey: string, payload: unknown, signal?: AbortSignal): Promise<Response> {
  const E = messages.ai.errors;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new AiError(E.aborted);
      if (attempt < 2) {
        await sleep(2000 * (attempt + 1), signal);
        continue;
      }
      throw new AiError(E.network);
    }
    if (res.ok) return res;
    const body = (await res.json().catch(() => ({}))) as GeminiError;
    const status = body.error?.status ?? '';
    const msg = body.error?.message ?? '';
    if (res.status === 429) {
      if (dailyQuota(body)) throw new AiError(E.dailyQuota);
      if (attempt < 4) {
        await sleep(Math.min(65_000, retryDelayMs(body) ?? 15_000 * (attempt + 1)), signal);
        continue;
      }
      throw new AiError(E.rateLimit);
    }
    if ((res.status === 500 || res.status === 503) && attempt < 3) {
      await sleep(4000 * (attempt + 1), signal);
      continue;
    }
    if (res.status === 400 && /API key|API_KEY/i.test(msg + status + JSON.stringify(body.error?.details ?? ''))) throw new AiError(E.badKey);
    if (res.status === 403) throw new AiError(E.permission);
    if (res.status === 404) throw new AiError(E.model, 'model');
    throw new AiError(`${E.api} (${res.status}) ${msg}`);
  }
}

function textFromCandidate(body: Record<string, unknown>): string {
  const E = messages.ai.errors;
  const feedback = body.promptFeedback as { blockReason?: string } | undefined;
  if (feedback?.blockReason) throw new AiError(E.refusal);
  const cand = (body.candidates as Array<Record<string, unknown>> | undefined)?.[0];
  if (!cand) throw new AiError(E.refusal);
  const reason = cand.finishReason as string | undefined;
  if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || reason === 'BLOCKLIST') throw new AiError(E.refusal);
  const parts = ((cand.content as { parts?: Array<{ text?: string; thought?: boolean }> } | undefined)?.parts ?? []).filter((p) => !p.thought);
  const text = parts.map((p) => p.text ?? '').join('');
  if (reason === 'MAX_TOKENS' && !text) throw new AiError(E.truncated);
  return text;
}

/**
 * Meilleur modèle Flash accessible avec cette clé (si l'alias n'est pas reconnu).
 * Préfère les versions stables, puis la version la plus récente.
 */
export async function resolveModel(apiKey: string, lite: boolean): Promise<AiModel | null> {
  try {
    const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } });
    if (!res.ok) return null;
    const body = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
    const candidates = (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((id) => /^gemini-[\d.]+-flash/.test(id) && lite === /lite/.test(id) && !/(image|tts|live|audio|thinking|exp)/.test(id));
    const version = (id: string) => parseFloat(id.match(/^gemini-([\d.]+)/)?.[1] ?? '0');
    candidates.sort((a, b) => Number(/preview/.test(a)) - Number(/preview/.test(b)) || version(b) - version(a));
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

/** Exécute `fn` ; si le modèle est inconnu, bascule sur le meilleur modèle disponible et réessaie. */
async function withModel<T>(s: AiSettings, fn: (model: AiModel) => Promise<T>): Promise<T> {
  try {
    return await fn(s.model);
  } catch (e) {
    if (!(e instanceof AiError) || e.code !== 'model') throw e;
    const found = await resolveModel(s.apiKey, /lite/.test(s.model));
    if (!found || found === s.model) throw e;
    await saveAiSettings({ ...s, model: found });
    return fn(found);
  }
}

async function settingsOrThrow(): Promise<AiSettings> {
  const s = await getAiSettings();
  if (!s.apiKey) throw new AiError(messages.ai.errors.noKey);
  return s;
}

export interface JsonRequest {
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Requête dont la réponse respecte le schéma JSON (sortie structurée de Gemini). */
export async function askJson<T>(req: JsonRequest): Promise<T> {
  const s = await settingsOrThrow();
  const contents = [{ role: 'user', parts: await toGeminiParts(req.parts, req.signal) }];
  await waitForSlot(s.model, req.signal);
  const res = await withModel(s, (model) => call(
    `models/${model}:generateContent`,
    s.apiKey,
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(req.schema),
        maxOutputTokens: req.maxTokens ?? 16000,
        temperature: 0.2,
      },
    },
    req.signal,
  ));
  const text = textFromCandidate((await res.json()) as Record<string, unknown>);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError(messages.ai.errors.truncated);
  }
}

/** Texte libre en streaming (rapports longs) ; `onText` reçoit le texte au fil de l'eau. */
export async function askText(req: { system: string; parts: Part[]; onText?: (full: string) => void; signal?: AbortSignal }): Promise<string> {
  const s = await settingsOrThrow();
  const contents = [{ role: 'user', parts: await toGeminiParts(req.parts, req.signal) }];
  await waitForSlot(s.model, req.signal);
  const res = await withModel(s, (model) =>
    call(
      `models/${model}:streamGenerateContent?alt=sse`,
      s.apiKey,
      { systemInstruction: { parts: [{ text: req.system }] }, contents, generationConfig: { maxOutputTokens: 32000, temperature: 0.4 } },
      req.signal,
    ),
  );
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      full += textFromCandidate(JSON.parse(data) as Record<string, unknown>);
      req.onText?.(full);
    }
  }
  if (!full) throw new AiError(messages.ai.errors.refusal);
  return full;
}

/**
 * Vérifie la clé avec une très petite requête. Une réponse acceptée par Google
 * suffit : le contenu importe peu (les modèles « qui réfléchissent » peuvent
 * consommer toute la petite marge de réponse sans écrire de texte).
 * Renvoie le modèle effectivement utilisé (il peut avoir été remplacé).
 */
export async function testAiKey(settings: AiSettings): Promise<AiModel> {
  let used = settings.model;
  await withModel(settings, (model) => {
    used = model;
    return call(`models/${model}:generateContent`, settings.apiKey, {
      contents: [{ role: 'user', parts: [{ text: 'Réponds simplement : OK' }] }],
      generationConfig: { maxOutputTokens: 2048 },
    });
  });
  return used;
}

/** Exécute des tâches avec une concurrence limitée. */
export async function pool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new AiError(messages.ai.errors.aborted);
      const i = next++;
      await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}
