import fr from './fr';

export type { Messages } from './fr';

// Une seule langue pour l'instant ; ajouter `en` ici le moment venu.
export const messages = fr;

/** Remplace les {variables} d'un texte. */
export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}
