// Accès à Claude depuis l'extension, avec la clé d'API de l'utilisateur.
// Aucun serveur intermédiaire : les requêtes partent directement du navigateur
// vers l'API Anthropic. La clé reste dans chrome.storage.local (cet ordinateur).

import type Anthropic from '@anthropic-ai/sdk';
import { messages } from './i18n';

export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';

export interface AiSettings {
  apiKey: string;
  model: AiModel;
}

export const AI_MODELS: Array<{ id: AiModel; inputPerM: number; outputPerM: number }> = [
  { id: 'claude-opus-5-5', inputPerM: 4, outputPerM: 20 },
  { id: 'claude-sonnet-5-5', inputPerM: 2, outputPerM: 10 },
  { id: 'claude-haiku-5-5', inputPerM: 0.1, outputPerM: 0.5 },
];

const KEY = 'aiSettings';
const DEFAULTS: AiSettings = { apiKey: '', model: 'claude-opus-5-5' };

export async function getAiSettings(): Promise<AiSettings> {
  const data = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(data[KEY] as Partial<AiSettings> | undefined) };
}

export async function saveAiSettings(s: AiSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

/** Coût estimé en dollars pour un volume de jetons. */
export function estimateCost(model: AiModel, inputTokens: number, outputTokens: number): number {
  const m = AI_MODELS.find((x) => x.id === model) ?? AI_MODELS[0];
  return (inputTokens * m.inputPerM + outputTokens * m.outputPerM) / 1_000_000;
}

export class AiError extends Error {}

export type Part = { type: 'text'; text: string } | { type: 'image'; url: string };

async function client(apiKey: string): Promise<Anthropic> {
  // Chargé à la demande : le SDK n'alourdit pas l'ouverture de la fenêtre.
  const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
  return new AnthropicClient({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 3 });
}

async function settingsOrThrow(): Promise<AiSettings> {
  const s = await getAiSettings();
  if (!s.apiKey) throw new AiError(messages.ai.errors.noKey);
  return s;
}

function toBlocks(parts: Part[]): Anthropic.Beta.BetaContentBlockParam[] {
  return parts.map((p) =>
    p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'url', url: p.url } },
  );
}

/** Repli serveur en cas de refus : disponible sur Opus et Sonnet, pas sur Haiku. */
function fallbackParams(model: AiModel): Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, 'betas' | 'fallbacks'> {
  return model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
}

/** Traduit les erreurs du SDK en messages compréhensibles. */
async function friendly(e: unknown): Promise<Error> {
  const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
  const E = messages.ai.errors;
  if (e instanceof AiError) return e;
  if (e instanceof AnthropicClient.AuthenticationError) return new AiError(E.badKey);
  if (e instanceof AnthropicClient.PermissionDeniedError) return new AiError(E.permission);
  if (e instanceof AnthropicClient.RateLimitError) return new AiError(E.rateLimit);
  if (e instanceof AnthropicClient.APIConnectionError) return new AiError(E.network);
  if (e instanceof AnthropicClient.APIUserAbortError) return new AiError(E.aborted);
  if (e instanceof AnthropicClient.BadRequestError) return new AiError(`${E.badRequest} ${e.message}`);
  if (e instanceof AnthropicClient.APIError) return new AiError(`${E.api} (${e.status ?? '?'}) ${e.message}`);
  return e instanceof Error ? e : new Error(String(e));
}

function textOf(res: Anthropic.Beta.BetaMessage): string {
  if (res.stop_reason === 'refusal') throw new AiError(messages.ai.errors.refusal);
  if (res.stop_reason === 'max_tokens') throw new AiError(messages.ai.errors.truncated);
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

function hasImages(parts: Part[]): boolean {
  return parts.some((p) => p.type === 'image');
}

export interface JsonRequest {
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Requête dont la réponse est garantie conforme au schéma JSON (sorties structurées).
 * Si une image est refusée (lien expiré, accès bloqué), la requête est relancée sans images.
 */
export async function askJson<T>(req: JsonRequest): Promise<T> {
  const s = await settingsOrThrow();
  const api = await client(s.apiKey);
  const run = async (parts: Part[]) => {
    const res = await api.beta.messages.create(
      {
        model: s.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: [{ role: 'user', content: toBlocks(parts) }],
        output_config: { effort: req.effort ?? 'medium', format: { type: 'json_schema', schema: req.schema } },
        ...fallbackParams(s.model),
      },
      { signal: req.signal },
    );
    return JSON.parse(textOf(res)) as T;
  };
  try {
    return await run(req.parts);
  } catch (e) {
    const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
    if (e instanceof AnthropicClient.BadRequestError && hasImages(req.parts)) {
      try {
        return await run(req.parts.filter((p) => p.type === 'text'));
      } catch (e2) {
        throw await friendly(e2);
      }
    }
    throw await friendly(e);
  }
}

/** Texte libre en streaming (rapports longs) ; `onText` reçoit le texte au fil de l'eau. */
export async function askText(req: {
  system: string;
  parts: Part[];
  effort?: 'low' | 'medium' | 'high';
  onText?: (full: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const s = await settingsOrThrow();
  const api = await client(s.apiKey);
  try {
    const stream = api.beta.messages.stream(
      {
        model: s.model,
        max_tokens: 32000,
        system: req.system,
        messages: [{ role: 'user', content: toBlocks(req.parts) }],
        output_config: { effort: req.effort ?? 'high' },
        ...fallbackParams(s.model),
      },
      { signal: req.signal },
    );
    let full = '';
    stream.on('text', (delta) => {
      full += delta;
      req.onText?.(full);
    });
    return textOf(await stream.finalMessage());
  } catch (e) {
    throw await friendly(e);
  }
}

/** Petite requête de vérification de la clé. */
export async function testAiKey(settings: AiSettings): Promise<void> {
  const api = await client(settings.apiKey);
  try {
    const res = await api.beta.messages.create({
      model: settings.model,
      max_tokens: 64,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Réponds simplement : OK' }],
    });
    textOf(res);
  } catch (e) {
    throw await friendly(e);
  }
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
