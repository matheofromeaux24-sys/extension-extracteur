// Teste la détection automatique de listes sur les pages de test-pages/.
// Usage : npm run test:detection [-- --verbose]
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const verbose = process.argv.includes('--verbose');

const bundle = await build({
  entryPoints: [path.join(root, 'scripts/detect-entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'chrome110',
});
const code = bundle.outputFiles[0].text;

// Attendus : nombre d'items de la meilleure liste et colonnes indispensables.
const cases = [
  { file: 'amazon.html', items: 24, columns: ['Titre', 'Prix', 'Lien', 'Image', 'Note', 'Ancien prix'] },
  { file: 'google-maps.html', items: 16, columns: ['Titre', 'Lien', 'Image', 'Note'] },
  { file: 'prestashop.html', items: 9, columns: ['Titre', 'Prix', 'Lien', 'Image', 'Ancien prix'] },
  { file: 'tableau.html', items: 13, columns: ['Rang', 'Pays', 'Population', 'Pays (lien)'] },
  { file: 'blog.html', items: 5, columns: ['Titre', 'Lien', 'Image', 'Date', 'Auteur', 'Description'] },
  { file: 'shadow-iframe.html', items: 6, columns: ['Titre', 'Prix', 'Lien', 'Image'] },
  { file: 'grand-volume.html', items: 10000, columns: ['Titre', 'Lien', 'Image', 'Téléphone', 'Email'] },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
let failures = 0;

for (const c of cases) {
  await page.goto('file://' + path.join(root, 'test-pages', c.file));
  await page.addScriptTag({ content: code });
  const res = await page.evaluate(() => window.__scrapyTest());
  const best = res.lists[0];
  const problems = [];
  if (!best) problems.push('aucune liste détectée');
  else {
    if (best.count !== c.items) problems.push(`${best.count} items au lieu de ${c.items}`);
    const missing = c.columns.filter((name) => !best.columns.some((col) => col.startsWith(name + ' [')));
    if (missing.length) problems.push(`colonnes manquantes : ${missing.join(', ')}`);
  }
  const ok = problems.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${c.file} — ${res.lists.length} listes, détection en ${res.ms} ms`);
  if (best) {
    console.log(`   meilleure liste : ${best.count} items · ${best.selector}`);
    console.log(`   colonnes : ${best.columns.join(' | ')}`);
  }
  for (const p of problems) console.log(`   ⚠ ${p}`);
  if (verbose && best) {
    console.log('   ligne 1 :', JSON.stringify(best.rows[0], null, 0));
    res.lists.slice(1, 4).forEach((l, i) => console.log(`   liste ${i + 2} : ${l.count} items, score ${l.score} · ${l.selector}`));
  }
}
await browser.close();
console.log(failures ? `\n${failures} page(s) en échec` : '\nToutes les détections sont correctes.');
process.exit(failures ? 1 : 0);
