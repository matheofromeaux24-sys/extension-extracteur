// Fonctions IA appliquées au tableau : analyse des publicités, colonnes en
// langage naturel et synthèse stratégique.

import { askJson, askText, estimateCost, pool, type AiModel, type Part } from '../../shared/ai';
import { messages } from '../../shared/i18n';
import { RAW_KEY, type Column, type ExtractResult, type Row } from '../../shared/types';

const A = messages.ai;

// ---------------------------------------------------------------------------
// Description d'une ligne pour l'IA

function rowText(row: Row, columns: Column[], maxPerValue = 300): string {
  const lines = columns
    .filter((c) => c.kind !== 'image' && c.kind !== 'video' && row[c.id])
    .map((c) => `${c.name} : ${row[c.id].slice(0, maxPerValue)}`);
  const raw = row[RAW_KEY];
  if (raw) lines.push(`Texte complet de l'élément : ${raw.slice(0, 1500)}`);
  return lines.join('\n');
}

function mainImage(row: Row, columns: Column[]): string | null {
  for (const c of columns) {
    const v = row[c.id];
    if (c.kind === 'image' && v && /^https?:\/\//.test(v)) return v;
  }
  return null;
}

/** Ajoute (ou remplace) des colonnes et leurs valeurs dans le résultat, en tête du tableau. */
function upsertColumns(result: ExtractResult, cols: Column[], values: Array<Record<string, string> | undefined>): ExtractResult {
  const ids = new Set(cols.map((c) => c.id));
  // Les nouvelles colonnes arrivent en tête du tableau, là où on les voit.
  const columns = [...cols, ...result.columns.filter((c) => !ids.has(c.id))];
  const rows = result.rows.map((r, i) => (values[i] ? { ...r, ...values[i] } : r));
  return { ...result, columns, rows };
}

export interface Progress {
  done: number;
  total: number;
}

// ---------------------------------------------------------------------------
// 1. Analyse des publicités (texte + visuels)

const ANGLES = [
  'Prix / promotion',
  'Qualité / performance',
  'Preuve sociale',
  'Témoignage',
  'Urgence / rareté',
  'Nouveauté / lancement',
  'Émotion / aspiration',
  'Problème / solution',
  'Éducation / conseil',
  'Notoriété de marque',
  'Autre',
];
const TONES = ['Humoristique', 'Émotionnel', 'Informatif', 'Inspirant', 'Urgent', 'Luxueux', 'Décontracté', 'Technique', 'Autre'];

const AD_FIELDS = ['angle', 'accroche', 'offre', 'cible', 'ton', 'texte_visuel', 'description_visuel'] as const;
type AdField = (typeof AD_FIELDS)[number];

const AD_COLUMNS: Array<{ field: AdField; id: string; name: string }> = [
  { field: 'angle', id: 'ai_angle', name: A.columns.angle },
  { field: 'accroche', id: 'ai_hook', name: A.columns.hook },
  { field: 'offre', id: 'ai_offer', name: A.columns.offer },
  { field: 'cible', id: 'ai_target', name: A.columns.target },
  { field: 'ton', id: 'ai_tone', name: A.columns.tone },
  { field: 'texte_visuel', id: 'ai_visual_text', name: A.columns.visualText },
  { field: 'description_visuel', id: 'ai_visual', name: A.columns.visual },
];

const AD_SYSTEM = `Tu es un analyste en marketing digital et en publicité sur les réseaux sociaux.
On te donne des publicités (ou des éléments d'une page) avec leur texte et, quand il existe, leur visuel.
Pour chacune, renseigne :
- angle : l'angle marketing principal, choisi dans la liste imposée.
- accroche : la phrase ou l'idée qui capte l'attention, reformulée en une phrase courte.
- offre : l'offre commerciale concrète (réduction, livraison offerte, essai gratuit, code promo…) ou "Aucune".
- cible : la cible probable en quelques mots (âge, profil, besoin).
- ton : le ton dominant, choisi dans la liste imposée.
- texte_visuel : le texte écrit sur l'image (lu sur le visuel), ou "" s'il n'y a pas de visuel ou pas de texte.
- description_visuel : ce que montre le visuel en une phrase, ou "" s'il n'y a pas de visuel.
Réponds en français, de façon factuelle et concise. N'invente pas d'offre absente du contenu.
Renvoie exactement un objet par élément, avec son numéro (index).`;

function adSchema() {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            angle: { type: 'string', enum: ANGLES },
            accroche: { type: 'string' },
            offre: { type: 'string' },
            cible: { type: 'string' },
            ton: { type: 'string', enum: TONES },
            texte_visuel: { type: 'string' },
            description_visuel: { type: 'string' },
          },
          required: ['index', ...AD_FIELDS],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };
}

const AD_BATCH = 8;

export function adAnalysisEstimate(result: ExtractResult, model: AiModel): { requests: number; cost: number; images: number } {
  const n = result.rows.length;
  const images = result.rows.filter((r) => mainImage(r, result.columns)).length;
  const textTokens = result.rows.reduce((s, r) => s + rowText(r, result.columns).length / 3.5, 0);
  const input = textTokens + images * 1200 + Math.ceil(n / AD_BATCH) * 600;
  const output = n * 220;
  return { requests: Math.ceil(n / AD_BATCH), cost: estimateCost(model, input, output), images };
}

export async function analyzeAds(
  result: ExtractResult,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<{ result: ExtractResult; errors: string[] }> {
  const rows = result.rows;
  if (!rows.length) throw new Error(A.errors.empty);
  const batches: number[][] = [];
  for (let i = 0; i < rows.length; i += AD_BATCH) batches.push(Array.from({ length: Math.min(AD_BATCH, rows.length - i) }, (_, k) => i + k));
  const values: Array<Record<string, string> | undefined> = new Array(rows.length);
  const errors: string[] = [];
  let done = 0;
  onProgress({ done, total: rows.length });

  await pool(
    batches,
    3,
    async (batch) => {
      const parts: Part[] = [{ type: 'text', text: `Voici ${batch.length} éléments à analyser.` }];
      batch.forEach((rowIndex, k) => {
        const row = rows[rowIndex];
        parts.push({ type: 'text', text: `\n--- Élément ${k} ---\n${rowText(row, result.columns)}` });
        const img = mainImage(row, result.columns);
        if (img) {
          parts.push({ type: 'text', text: `Visuel de l'élément ${k} :` });
          parts.push({ type: 'image', url: img });
        }
      });
      try {
        const out = await askJson<{ items: Array<Record<AdField, string> & { index: number }> }>({
          system: AD_SYSTEM,
          parts,
          schema: adSchema(),
          effort: 'medium',
          signal,
        });
        for (const item of out.items) {
          const rowIndex = batch[item.index];
          if (rowIndex === undefined) continue;
          values[rowIndex] = Object.fromEntries(AD_COLUMNS.map((c) => [c.id, String(item[c.field] ?? '')]));
        }
      } catch (e) {
        if (signal.aborted) throw e;
        errors.push(e instanceof Error ? e.message : String(e));
      }
      done += batch.length;
      onProgress({ done, total: rows.length });
    },
    signal,
  );

  if (errors.length === batches.length) throw new Error(errors[0]);
  const cols: Column[] = AD_COLUMNS.map((c) => ({ id: c.id, name: c.name, kind: c.field === 'description_visuel' ? 'description' : 'text', key: `ai:${c.field}` }));
  return { result: upsertColumns(result, cols, values), errors };
}

// ---------------------------------------------------------------------------
// 2. Colonnes en langage naturel

const NL_PLAN_SYSTEM = `Tu aides un utilisateur non technique à enrichir un tableau de données extraites d'une page web.
À partir de sa demande et d'exemples de lignes, définis les colonnes à créer (au plus 8).
Pour chaque colonne : un nom court et clair en français (tel qu'il apparaîtra dans l'en-tête) et une consigne précise
qui dit comment remplir la valeur (format attendu, unité, valeur si l'information est absente : chaîne vide).`;

const NL_FILL_SYSTEM = `Tu remplis des colonnes d'un tableau à partir des données de chaque ligne.
Respecte exactement les consignes de chaque colonne. Si l'information n'existe pas dans la ligne, laisse une chaîne vide.
N'invente rien. Renvoie un objet par ligne, avec son numéro (index).`;

export interface NlColumnPlan {
  name: string;
  instruction: string;
}

export async function planNlColumns(instruction: string, result: ExtractResult, signal: AbortSignal): Promise<NlColumnPlan[]> {
  const samples = result.rows.slice(0, 3).map((r, i) => `--- Ligne exemple ${i + 1} ---\n${rowText(r, result.columns)}`);
  const out = await askJson<{ columns: NlColumnPlan[] }>({
    system: NL_PLAN_SYSTEM,
    parts: [{ type: 'text', text: `Demande de l'utilisateur : « ${instruction} »\n\nColonnes actuelles : ${result.columns.map((c) => c.name).join(', ')}\n\n${samples.join('\n\n')}` }],
    schema: {
      type: 'object',
      properties: {
        columns: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, instruction: { type: 'string' } },
            required: ['name', 'instruction'],
            additionalProperties: false,
          },
        },
      },
      required: ['columns'],
      additionalProperties: false,
    },
    effort: 'medium',
    maxTokens: 4000,
    signal,
  });
  return out.columns.slice(0, 8).filter((c) => c.name.trim());
}

const NL_BATCH = 15;

export async function fillNlColumns(
  plan: NlColumnPlan[],
  result: ExtractResult,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<{ result: ExtractResult; errors: string[] }> {
  const rows = result.rows;
  if (!rows.length) throw new Error(A.errors.empty);
  const stamp = Date.now().toString(36);
  const keys = plan.map((_, k) => `c${k}`);
  const schema = {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: { index: { type: 'integer' }, ...Object.fromEntries(keys.map((k) => [k, { type: 'string' }])) },
          required: ['index', ...keys],
          additionalProperties: false,
        },
      },
    },
    required: ['rows'],
    additionalProperties: false,
  };
  const spec = plan.map((c, k) => `- ${keys[k]} = « ${c.name} » : ${c.instruction}`).join('\n');
  const ids = plan.map((_, k) => `nl_${stamp}_${k}`);
  const batches: number[][] = [];
  for (let i = 0; i < rows.length; i += NL_BATCH) batches.push(Array.from({ length: Math.min(NL_BATCH, rows.length - i) }, (_, k) => i + k));
  const values: Array<Record<string, string> | undefined> = new Array(rows.length);
  const errors: string[] = [];
  let done = 0;
  onProgress({ done, total: rows.length });

  await pool(
    batches,
    3,
    async (batch) => {
      const text = batch.map((rowIndex, k) => `--- Ligne ${k} ---\n${rowText(rows[rowIndex], result.columns, 200)}`).join('\n\n');
      try {
        const out = await askJson<{ rows: Array<Record<string, string | number>> }>({
          system: NL_FILL_SYSTEM,
          parts: [{ type: 'text', text: `Colonnes à remplir :\n${spec}\n\n${text}` }],
          schema,
          effort: 'low',
          signal,
        });
        for (const r of out.rows) {
          const rowIndex = batch[Number(r.index)];
          if (rowIndex === undefined) continue;
          values[rowIndex] = Object.fromEntries(keys.map((k, j) => [ids[j], String(r[k] ?? '')]));
        }
      } catch (e) {
        if (signal.aborted) throw e;
        errors.push(e instanceof Error ? e.message : String(e));
      }
      done += batch.length;
      onProgress({ done, total: rows.length });
    },
    signal,
  );
  if (errors.length === batches.length) throw new Error(errors[0]);
  const names = new Set(result.columns.map((c) => c.name));
  const cols: Column[] = plan.map((c, k) => {
    let name = c.name.trim();
    for (let n = 2; names.has(name); n++) name = `${c.name.trim()} ${n}`;
    names.add(name);
    return { id: ids[k], name, kind: 'text', key: `ai:nl:${k}` };
  });
  return { result: upsertColumns(result, cols, values), errors };
}

// ---------------------------------------------------------------------------
// 3. Synthèse stratégique

const SYNTHESIS_SYSTEM = `Tu es un consultant senior en stratégie publicitaire et veille concurrentielle.
À partir des données fournies (publicités ou éléments extraits d'une page), rédige un rapport de veille en français, en Markdown :
## Résumé (3 à 5 phrases clés, chiffrées)
## Formats (part de vidéo, image, carrousel… et ce que cela révèle)
## Messages et angles (thèmes récurrents, promesses, preuves, ton)
## Offres et promotions (offres en cours, fréquence, mécaniques)
## Rythme de lancement (cadence des nouvelles pubs, périodes fortes)
## Pubs les plus performantes (selon la durée de diffusion, le nombre de versions et le score s'il est fourni)
## Recommandations (5 actions concrètes pour se différencier ou s'inspirer)
Appuie chaque affirmation sur les données (pourcentages, nombres, exemples courts entre guillemets).
Si une information manque (par exemple pas de dates), dis-le en une phrase au lieu d'inventer.`;

function distribution(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  const total = values.filter(Boolean).length || 1;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, n]) => `${k} : ${n} (${Math.round((n / total) * 100)} %)`)
    .join(' ; ');
}

export async function synthesize(result: ExtractResult, onText: (full: string) => void, signal: AbortSignal): Promise<string> {
  const { columns, rows } = result;
  if (!rows.length) throw new Error(A.errors.empty);
  // Statistiques par colonne « catégorielle » (peu de valeurs distinctes).
  const stats = columns
    .filter((c) => c.kind !== 'image' && c.kind !== 'video' && c.kind !== 'link')
    .map((c) => ({ c, vals: rows.map((r) => r[c.id] || '') }))
    .filter(({ vals }) => {
      const distinct = new Set(vals.filter(Boolean));
      return distinct.size > 0 && distinct.size <= Math.max(12, rows.length * 0.3);
    })
    .map(({ c, vals }) => `- ${c.name} : ${distribution(vals)}`)
    .join('\n');
  const sample = rows.slice(0, 120).map((r, i) => `#${i + 1}\n${rowText(r, columns, 250).replace(/Texte complet de l'élément : .*/s, '')}`);
  const context = `Source : ${result.page.title} (${result.page.domain})\nNombre d'éléments : ${rows.length}\n\nRépartitions :\n${stats || '(aucune)'}\n\nÉléments (${Math.min(120, rows.length)} premiers) :\n${sample.join('\n\n')}`;
  return askText({ system: SYNTHESIS_SYSTEM, parts: [{ type: 'text', text: context }], effort: 'high', onText, signal });
}
