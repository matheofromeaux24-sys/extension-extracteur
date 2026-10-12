# Scrapy Easy

Extension Chrome (Manifest V3) de web scraping **sans code** : ouvrez une page, Scrapy Easy détecte automatiquement la liste principale (produits, résultats, articles, lignes de tableau…), la surligne et vous la donne sous forme de tableau prêt à copier dans Google Sheets ou à télécharger en Excel / CSV.

Tout fonctionne en local dans le navigateur : aucune donnée n'est envoyée à un serveur.

> **État d'avancement** : étapes (a) et (c) livrées : fenêtre, détection automatique, tableau, export CSV / XLSX / copie, **pagination multi-pages**. Les étapes suivantes (sélecteur visuel de liste, détails de page, extraction de chaque URL, historique et recettes, finitions) arrivent progressivement.

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
4. Pour récupérer **toutes les pages**, choisissez l'**Action pour charger plus d'éléments** (souvent déjà présélectionnée) puis cliquez sur **Extraire toutes les pages** (voir ci-dessous).
5. Cliquez sur **Copier** (format tabulé, à coller dans Google Sheets ou Excel) ou sur **Télécharger** (Excel `.xlsx`, CSV pour Excel avec `;`, ou CSV standard avec `,`). Le nom de fichier est automatique : `domaine_AAAA-MM-JJ_HH-MM`.

> « Liste suivante / précédente » ne change **pas** de page : ces boutons passent d'une liste détectée à une autre sur la même page (produits, filtres, catégories…).

### Pagination : « Action pour charger plus d'éléments »

| Mode | Quand l'utiliser | Ce que fait Scrapy Easy |
|---|---|---|
| **Aucune** | Tout est sur la page | Extrait la page affichée |
| **Défilement infini** | Les éléments arrivent en descendant (réseaux sociaux, Google Maps) | Fait défiler la zone qui contient la liste, **page entière ou panneau interne** (détecté automatiquement), jusqu'à ce que plus rien n'arrive |
| **Clic sur « Charger plus »** | Bouton « Voir plus », « Afficher plus de résultats »… | Clique sur le bouton tant qu'il existe |
| **Lien « Page suivante »** | Pagination classique (Suivant, ›, », 1 2 3…) | Passe de page en page ; après chaque chargement, le script est réinjecté et le DOM attendu stable avant l'extraction. Marche aussi sur les sites SPA où la page ne se recharge pas |

- Le bouton ou lien est **détecté automatiquement** (rel="next", textes « Suivant », « Next », « › », numéro de page suivant, boutons « Charger plus »…) et le mode correspondant est présélectionné. En cas d'erreur, **Changer** permet de cliquer vous-même sur le bon bouton dans la page.
- Réglages : nombre maximal de pages, délai aléatoire entre deux pages (min–max, en secondes).
- Pendant l'extraction : barre de progression, **Pause / Reprendre / Stop**, lignes ajoutées en direct au tableau. Les doublons entre pages sont supprimés automatiquement.
- L'extraction s'arrête toute seule quand il n'y a plus de page suivante, plus de bouton, plus rien à charger, ou quand une page ne contient que des doublons.
- L'extraction est pilotée par le service worker : elle continue même si vous fermez la fenêtre, et la rouvrir reprend l'affichage en cours.

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
| `fil-infini.html` | Défilement infini de la page entière | 60 annonces en 3 chargements |
| `spa-pagination.html` | Pagination d'application monopage (bouton sans lien) | 30 offres sur 3 pages |

Pagination dans les pages de test : `amazon.html` (3 pages, lien « Suivant »), `prestashop.html` (2 pages, « Suivant » désactivé en fin), `google-maps.html` (défilement du panneau interne, 48 lieux), `blog.html` (bouton « Charger plus », 15 articles).

## Architecture

```
src/
├── background/      service worker : fenêtre détachée, raccourci clavier, pagination multi-pages
├── content/         injecté à la demande dans la page analysée
│   ├── detect/      détection des listes, extraction des champs, nommage des colonnes
│   ├── highlight.ts surbrillance (Shadow DOM fermé, aucun conflit de style)
│   ├── paginate.ts  repérage et actions de pagination (suivant, charger plus, défilement)
│   ├── picker.ts    choix d'un élément par clic sur la page
│   ├── listResolver.ts  retrouve la liste après un chargement ou sur la page suivante
│   ├── domStable.ts attente de stabilité du DOM (SPA)
│   └── traverse.ts  parcours Shadow DOM ouvert + iframes accessibles
├── shared/          types des messages, i18n, injection, utilitaires d'URL
└── ui/              application React + Tailwind (fenêtre principale)
```

- Le content script est compilé en un fichier autonome `content.js` et injecté avec `chrome.scripting.executeScript` uniquement quand on en a besoin. Il n'est pas exposé aux sites (aucune `web_accessible_resources`).
- Tous les textes sont dans `src/shared/i18n/fr.ts` ; pour ajouter l'anglais, créer `en.ts` avec le même type `Messages`.
- Stack : React 18, TypeScript, Vite + @crxjs/vite-plugin, Tailwind CSS, Zustand, @tanstack/react-virtual, SheetJS (chargé à la demande pour l'export Excel).
