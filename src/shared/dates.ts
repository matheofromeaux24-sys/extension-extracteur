// Lecture des dates écrites dans les pages (français et anglais).

const MONTHS: Record<string, number> = {
  janv: 0, jan: 0, janvier: 0, january: 0,
  févr: 1, fevr: 1, fév: 1, fev: 1, février: 1, fevrier: 1, feb: 1, february: 1,
  mars: 2, mar: 2, march: 2,
  avr: 3, avril: 3, apr: 3, april: 3,
  mai: 4, may: 4,
  juin: 5, jun: 5, june: 5,
  juil: 6, juillet: 6, jul: 6, july: 6,
  août: 7, aout: 7, aug: 7, august: 7,
  sept: 8, septembre: 8, sep: 8, september: 8,
  oct: 9, octobre: 9, october: 9,
  nov: 10, novembre: 10, november: 10,
  déc: 11, dec: 11, décembre: 11, decembre: 11, december: 11,
};

function month(word: string): number | undefined {
  const w = word.toLowerCase().replace(/\.$/, '');
  return MONTHS[w] ?? MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)];
}

const MONTH_WORD = '([A-Za-zéûÉÛ]{3,9}\\.?)';
const PATTERNS: Array<{ re: RegExp; build: (m: RegExpExecArray) => Date | null }> = [
  // 2024-10-03
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, build: (m) => new Date(+m[1], +m[2] - 1, +m[3]) },
  // 3 oct. 2024 / 3 octobre 2024 / 1er mars 2024 / 3 Oct 2024
  {
    re: new RegExp(`\\b(\\d{1,2})(?:er)?\\s+${MONTH_WORD}\\s+(\\d{4})\\b`, 'g'),
    build: (m) => (month(m[2]) === undefined ? null : new Date(+m[3], month(m[2])!, +m[1])),
  },
  // Oct 3, 2024 / October 3 2024
  {
    re: new RegExp(`\\b${MONTH_WORD}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'g'),
    build: (m) => (month(m[1]) === undefined ? null : new Date(+m[3], month(m[1])!, +m[2])),
  },
  // 03/10/2024 (jour/mois/année, usage français)
  { re: /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g, build: (m) => new Date(+m[3], +m[2] - 1, +m[1]) },
];

/** Toutes les dates trouvées dans un texte, dans l'ordre d'apparition. */
export function findDates(text: string): Date[] {
  const found: Array<{ at: number; date: Date }> = [];
  for (const { re, build } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const d = build(m);
      if (d && !isNaN(d.getTime()) && d.getFullYear() > 1990 && !found.some((f) => Math.abs(f.at - m!.index) < 3)) {
        found.push({ at: m.index, date: d });
      }
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.date);
}

export const DAY = 86_400_000;

export function daysBetween(a: Date | number, b: Date | number): number {
  return Math.max(0, Math.round((+b - +a) / DAY));
}

export function formatDay(t: number): string {
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
