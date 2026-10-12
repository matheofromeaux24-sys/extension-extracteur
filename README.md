# Scrapy Easy

Extension Chrome (Manifest V3) de web scraping **sans code** : ouvrez une page, Scrapy Easy détecte automatiquement la liste principale (produits, résultats, articles, lignes de tableau…), la surligne et vous la donne sous forme de tableau prêt à copier dans Google Sheets ou à télécharger en Excel / CSV.

Tout fonctionne en local dans le navigateur : aucune donnée n'est envoyée à un serveur.

> **État d'avancement** : étape (a) livrée (fenêtre, détection automatique, tableau, export CSV / XLSX / copie). Les étapes suivantes (sélecteur visuel, pagination, détails de page, extraction de chaque URL, historique et recettes, finitions) arrivent progressivement.

## Installation (développeurs)

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run build        # produit le dossier dist/
```

Puis dans Chrome :

1. Ouvrir `chrome://extensions`
2. Activer le **Mode développeur** (en haut à droite)
3. Cliquer sur **Charger l'extension non empaquetée** et choisir le dossier **`dist`**
4. (Conseillé) Épingler l'icône Scrapy Easy dans la barre d'outils

Pendant le développement, `npm run dev` recompile automatiquement à chaque modification ; cliquez ensuite sur ⟳ dans `chrome://extensions` et rechargez la page analysée.

## Utilisation

1. Ouvrez la page qui contient les données.
2. Cliquez sur l'icône Scrapy Easy ou utilisez **Alt+Maj+S**. Une fenêtre détachée s'ouvre et reste ouverte pendant que vous naviguez.
3. La meilleure liste est détectée et surlignée en vert sur la page, avec le numéro de chaque élément. Si ce n'est pas la bonne, utilisez **Liste suivante** / **Liste précédente**.
4. Cliquez sur **Copier** (format tabulé, à coller dans Google Sheets ou Excel) ou sur **Télécharger** (Excel `.xlsx`, CSV pour Excel avec `;`, ou CSV standard avec `,`). Le nom de fichier est automatique : `domaine_AAAA-MM-JJ_HH-MM`.

Si vous changez de page ou d'onglet, un bandeau propose d'**analyser cette page**.

### Autorisations

L'extension ne demande aucun accès permanent aux sites. Au clic sur l'icône, Chrome lui donne accès à l'onglet courant (`activeTab`). Si vous naviguez ensuite vers un autre site avec la fenêtre ouverte, Scrapy Easy vous demande **une fois par domaine** l'autorisation de le lire. Vous pouvez retirer ces accès dans `chrome://extensions` → Scrapy Easy → Détails → Accès aux sites.

Les pages internes de Chrome (`chrome://…`, nouvel onglet, Chrome Web Store) ne peuvent pas être analysées : un message l'explique. Pour les fichiers locaux (`file://`), activez « Autoriser l'accès aux URL de fichier » dans les détails de l'extension.

## Ce que détecte l'extension

- **Listes répétitives** : groupes d'éléments frères de structure similaire (même balise, classes proches, sous-arbres comparables), y compris les grilles découpées en rangées, les lignes de tableau, le **Shadow DOM ouvert** et les **iframes de même origine**. Chaque liste est notée selon le nombre d'éléments, la surface visible et la richesse du contenu (texte, liens, images, prix) ; les menus, en-têtes et pieds de page sont pénalisés.
- **Colonnes nommées automatiquement** : Titre, Prix, Ancien prix (prix barré), Lien, Image, Note, Avis, Date, Auteur, Adresse, Email, Téléphone, Description, Catégorie, Remise… avec repli sur le nom de la classe CSS. Les en-têtes des tableaux HTML sont repris tels quels.
- **Valeurs propres** : liens en URL absolues, images en meilleure résolution (`srcset`, chargement différé `data-src`…), colonnes en double fusionnées, libellés de boutons (« Ajouter au panier ») ignorés, notes composites séparées (« 4,6 étoiles 1 234 avis » → Note 4,6 + Avis 1 234).
- **Sites dynamiques (SPA)** : l'extraction attend que le DOM soit stable (MutationObserver) avant de lire la page.

Les exports CSV et la copie neutralisent les valeurs commençant par `=`, `+`, `-` ou `@` qui pourraient être interprétées comme des formules par Excel / Sheets (protection contre l'injection de formules depuis une page malveillante).

## Tests

```bash
npm run test:detection   # détection sur les pages de test-pages/ (Chromium headless)
npm run build && npm run test:e2e   # extension complète chargée dans Chromium
```

Pages de test fournies dans `test-pages/` (copies fidèles du balisage réel, utilisables aussi à la main via `npm run serve:test` puis http://localhost:5173) :

| Page | Contenu | Attendu |
|---|---|---|
| `amazon.html` | Résultats de recherche Amazon (prix découpés, sponsorisés, filtres latéraux) | 24 produits : Titre, Prix, Ancien prix, Note, Avis, Image, Lien |
| `google-maps.html` | Panneau de résultats Google Maps (défilement interne, notes en `aria-label`) | 16 lieux : Titre, Note, Avis, Prix, Adresse, Image, Lien |
| `prestashop.html` | Catégorie PrestaShop (thème Classic, images en lazy-load) | 9 produits : Titre, Prix, Ancien prix, Remise, Image, Lien |
| `tableau.html` | Tableau Wikipédia + infobox | 13 lignes avec les en-têtes du tableau |
| `blog.html` | Blog WordPress + barre latérale | 5 articles : Titre, Date, Auteur, Description, Catégorie… |
| `shadow-iframe.html` | Composants web (Shadow DOM) + iframe | 6 produits dans le Shadow DOM |
| `grand-volume.html` | 10 000 fiches | Analyse complète en ~3 s, tableau fluide |

## Architecture

```
src/
├── background/      service worker : fenêtre détachée, raccourci clavier
├── content/         injecté à la demande dans la page analysée
│   ├── detect/      détection des listes, extraction des champs, nommage des colonnes
│   ├── highlight.ts surbrillance (Shadow DOM fermé, aucun conflit de style)
│   ├── domStable.ts attente de stabilité du DOM (SPA)
│   └── traverse.ts  parcours Shadow DOM ouvert + iframes accessibles
├── shared/          types des messages, i18n, injection, utilitaires d'URL
└── ui/              application React + Tailwind (fenêtre principale)
```

- Le content script est compilé en un fichier autonome `content.js` et injecté avec `chrome.scripting.executeScript` uniquement quand on en a besoin. Il n'est pas exposé aux sites (aucune `web_accessible_resources`).
- Tous les textes sont dans `src/shared/i18n/fr.ts` ; pour ajouter l'anglais, créer `en.ts` avec le même type `Messages`.
- Stack : React 18, TypeScript, Vite + @crxjs/vite-plugin, Tailwind CSS, Zustand, @tanstack/react-virtual, SheetJS (chargé à la demande pour l'export Excel).
