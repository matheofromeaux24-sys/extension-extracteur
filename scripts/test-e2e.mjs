// Test de bout en bout : charge l'extension compilée (dist/) dans Chromium,
// ouvre la fenêtre Scrapy Easy sur les pages de test et vérifie détection,
// surbrillance, navigation entre listes et exports.
// Prérequis : npm run build. Usage : npm run test:e2e [-- --screenshots]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, cpSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shots = process.argv.includes('--screenshots');
const shotDir = path.join(root, 'test-results');
if (shots) mkdirSync(shotDir, { recursive: true });

// Serveur HTTP local pour les pages de test.
const server = createServer((req, res) => {
  try {
    const file = path.join(root, 'test-pages', path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404).end('introuvable');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

/** Copie de dist/ avec, au besoin, l'accès à tous les sites déjà accordé (simule le clic « Autoriser »). */
function prepareExtension(grantAllHosts) {
  const dir = mkdtempSync(path.join(tmpdir(), 'scrapy-ext-'));
  cpSync(path.join(root, 'dist'), dir, { recursive: true });
  if (grantAllHosts) {
    const mf = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    mf.host_permissions = ['<all_urls>'];
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(mf, null, 2));
  }
  return dir;
}

async function launch(extDir) {
  const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'scrapy-profile-')), {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  return { context, sw, extId };
}

/** Ouvre une page cible puis la fenêtre Scrapy Easy (popup détachée) qui la vise. */
async function openUiFor(env, url) {
  const target = await env.context.newPage();
  await target.goto(url, { waitUntil: 'domcontentloaded' });
  const tabId = await env.sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
  const uiPromise = env.context.waitForEvent('page');
  await env.sw.evaluate(
    ({ id, tabId }) => chrome.windows.create({ url: `chrome-extension://${id}/src/ui/index.html?tabId=${tabId}`, type: 'popup', width: 720, height: 800 }),
    { id: env.extId, tabId },
  );
  const ui = await uiPromise;
  await ui.setViewportSize({ width: 720, height: 800 });
  return { target, ui };
}

// ---------------------------------------------------------------------------
// 1. Extension avec accès accordé : parcours complet
{
  const env = await launch(prepareExtension(true));
  const pages = [
    ['amazon.html', 24],
    ['google-maps.html', 16],
    ['prestashop.html', 9],
    ['tableau.html', 13],
    ['blog.html', 5],
    ['shadow-iframe.html', 6],
    ['grand-volume.html', 10000],
  ];
  for (const [file, expected] of pages) {
    const { target, ui } = await openUiFor(env, `${base}/${file}`);
    try {
      await ui.getByText(/Liste 1 sur \d+/).waitFor({ timeout: 15000 });
      const count = await ui.locator('text=/^[\\d\\s\u202f]+ éléments$/').first().textContent();
      const overlay = await target.evaluate(() => !!document.querySelector('scrapy-easy-overlay'));
      check(count.replace(/\s/g, '') === `${expected}éléments` && overlay, `${file} : liste détectée et surlignée`, `${count}, overlay ${overlay ? 'présent' : 'absent'}`);
      if (shots) {
        await ui.waitForTimeout(700); // recalage de la surbrillance après chargement des images
        await ui.screenshot({ path: path.join(shotDir, `ui-${file.replace('.html', '')}.png`) });
      }
      if (shots && file === 'amazon.html') await target.screenshot({ path: path.join(shotDir, 'page-amazon-surbrillance.png') });
    } catch (e) {
      check(false, `${file} : liste détectée`, e.message.split('\n')[0]);
    }
    await ui.close();
    await target.close();
  }

  // Navigation entre listes + exports sur PrestaShop.
  const { target, ui } = await openUiFor(env, `${base}/prestashop.html`);
  await ui.getByText(/Liste 1 sur \d+/).waitFor();
  await ui.getByRole('button', { name: 'Liste suivante' }).click();
  await ui.getByText(/Liste 2 sur \d+/).waitFor({ timeout: 5000 }).then(
    () => check(true, 'Liste suivante'),
    () => check(false, 'Liste suivante'),
  );
  await ui.getByRole('button', { name: 'Liste précédente' }).click();
  await ui.getByText(/Liste 1 sur \d+/).waitFor();

  await ui.getByRole('button', { name: /Télécharger/ }).click();
  const [xlsxDl] = await Promise.all([ui.waitForEvent('download'), ui.getByRole('menuitem', { name: /xlsx/i }).click()]);
  const xlsxPath = await xlsxDl.path();
  const wb = XLSX.read(readFileSync(xlsxPath));
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  check(
    /^127\.0\.0\.1_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.xlsx$/.test(xlsxDl.suggestedFilename()) && sheet.length === 10 && sheet[0].includes('Prix'),
    'Export XLSX',
    `${xlsxDl.suggestedFilename()}, ${sheet.length - 1} lignes, colonnes : ${sheet[0].join(' | ')}`,
  );

  await ui.getByRole('button', { name: /Télécharger/ }).click();
  const [csvDl] = await Promise.all([ui.waitForEvent('download'), ui.getByRole('menuitem', { name: /séparateur ;/ }).click()]);
  const csv = readFileSync(await csvDl.path(), 'utf8');
  check(csv.charCodeAt(0) === 0xfeff && csv.split('\r\n').length === 10 && csv.includes('T-shirt imprimé colibri;'), 'Export CSV (BOM UTF-8, séparateur ;)');

  // Les permissions presse-papiers ne peuvent pas être accordées à une origine d'extension
  // par Playwright : on vérifie le message de succès (writeText résolu) et le contenu TSV en interne.
  await ui.getByRole('button', { name: 'Copier' }).click();
  await ui.getByText(/9 lignes copiées/).waitFor({ timeout: 3000 }).then(
    () => check(true, 'Copier (TSV)'),
    async () => check(false, 'Copier (TSV)', (await ui.locator('[role=status]').textContent().catch(() => '')) || 'aucun message'),
  );

  // Changement de page dans l'onglet : bandeau « Vous êtes sur une autre page ».
  await target.goto(`${base}/blog.html`);
  await ui.getByText('Vous êtes sur une autre page.').waitFor({ timeout: 5000 }).then(
    () => check(true, 'Bandeau de changement de page'),
    () => check(false, 'Bandeau de changement de page'),
  );
  await ui.getByRole('button', { name: 'Analyser cette page' }).click();
  await ui.getByText('5 éléments').waitFor({ timeout: 10000 }).then(
    () => check(true, 'Réanalyse de la nouvelle page'),
    () => check(false, 'Réanalyse de la nouvelle page'),
  );

  if (shots) {
    await ui.emulateMedia({ colorScheme: 'dark' });
    await ui.waitForTimeout(400); // fin des transitions de couleur
    await ui.screenshot({ path: path.join(shotDir, 'ui-blog-sombre.png') });
    await ui.emulateMedia({ colorScheme: 'light' });
  }

  // Page interdite, avec des résultats déjà affichés : bandeau explicatif.
  await target.goto('chrome://version');
  await ui.getByText(/Chrome interdit d’analyser cette page/).waitFor({ timeout: 5000 }).then(
    () => check(true, 'Page chrome:// (résultats affichés) : bandeau explicatif'),
    () => check(false, 'Page chrome:// (résultats affichés) : bandeau explicatif'),
  );
  // Page interdite à l'ouverture : écran dédié.
  const fresh = await openUiFor(env, 'chrome://version/');
  await fresh.ui.getByText('Cette page ne peut pas être analysée').waitFor({ timeout: 5000 }).then(
    () => check(true, 'Page chrome:// à l’ouverture : message explicatif'),
    () => check(false, 'Page chrome:// à l’ouverture : message explicatif'),
  );
  if (shots) await fresh.ui.screenshot({ path: path.join(shotDir, 'ui-page-interdite.png') });
  await env.context.close();
}

// ---------------------------------------------------------------------------
// 2. Extension telle que livrée (aucun accès) : demande d'autorisation par domaine
{
  const env = await launch(prepareExtension(false));
  const { ui } = await openUiFor(env, `${base}/amazon.html`);
  await ui.getByText('Autorisation nécessaire').waitFor({ timeout: 10000 }).then(
    () => check(true, 'Sans accès : demande d’autorisation pour 127.0.0.1'),
    () => check(false, 'Sans accès : demande d’autorisation'),
  );
  if (shots) await ui.screenshot({ path: path.join(shotDir, 'ui-autorisation.png') });
  await env.context.close();
}

server.close();
console.log(failures ? `\n${failures} vérification(s) en échec` : '\nTous les tests de bout en bout sont passés.');
process.exit(failures ? 1 : 0);
