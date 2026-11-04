# Mistigrip — contexte complet du projet (passation entre sessions)

Ce fichier résume tout le travail fait jusqu'ici avec l'utilisateur, ses demandes,
les règles du projet et la prochaine étape. Le nom commence par « _ » : GitHub Pages
(Jekyll) ne le publie pas sur le site.

---

## 1. En bref

- **Projet** : page d'accueil du site e-commerce **Mistigrip** (un seul produit :
  chaussettes anti-dérapantes pour chat, picots en silicone sous la patte, douces,
  lavables, tailles S/M/L, **14,90 € le lot de 4**, prix à confirmer).
- **Cible** : propriétaires de chats vivant sur parquet, carrelage ou stratifié,
  en particulier de chats âgés.
- **Objectifs** : vendre, et viser la 1re place Google sur
  « chaussettes anti-dérapantes pour chat ». Finition de niveau Awwwards,
  compréhension en 5 secondes (quoi, pour qui, prix, comment acheter).
- **Dépôt** : `matheofromeaux24-sys/extension-extracteur`, **branche
  `claude/sleepy-wright-jbfjw4`** (la branche `main` ne contient qu'un README).
- **Site en ligne (GitHub Pages, publié depuis cette branche)** :
  https://matheofromeaux24-sys.github.io/extension-extracteur/
  (mise à jour 1 à 2 min après chaque push ; l'utilisateur vérifie là).
- **Fichiers** : `index.html`, `style.css`, `main.js` à la racine. HTML/CSS/JS natifs,
  aucune bibliothèque, aucune étape de build.
- **Cache** : `index.html` charge `style.css?v=8` et `main.js?v=8`.
  **Augmenter ce numéro à chaque mise en ligne** (sinon GitHub Pages sert les anciens
  fichiers pendant ~10 min et l'utilisateur voit un mélange de versions).

---

## 2. Le brief initial (règles toujours en vigueur)

### Identité imposée
- Couleurs (variables CSS) : `--creme #FFFBF7` (fond principal), `--rose #FFC3D4`,
  `--jaune #FFE9A0`, `--peche #FFCBA5` (panneaux), `--aubergine #3D2A3A` (texte,
  boutons, blocs sombres).
- Fond crème avec panneaux pastel alternés. Texte aubergine sur fond clair, crème sur
  aubergine, **jamais de blanc sur pastel**. Aucune autre couleur, **aucun dégradé**.
  Texte secondaire : aubergine à 80 % d'opacité minimum (crème 80 % sur aubergine).
- Polices Google : **Fredoka** 500/600/700 (logo, titres, prix, chiffres) et
  **Nunito** 400/600/700 (texte, boutons, formulaires).
- Échelle : hero `clamp(2.75rem, 8vw + 1rem, 8rem)`, interligne .95, -0,02em ;
  H2 `clamp(2rem, 3vw + 1rem, 3.5rem)` ; texte 17 px mobile / 18 px desktop,
  interligne 1,6, 65 caractères max par ligne. **Tout est aligné à gauche.**

### Direction artistique
- Concept : **« ça glisse… puis ça accroche »** (les mouvements glissent, dépassent un
  peu, puis s'arrêtent net).
- Motif signature : **trame de picots** (points) ; le logo a des picots à la place des
  points des « i ».
- Panneaux pastel très arrondis (40 px desktop / 24 px mobile) avec marges latérales.
- Mise en page adulte : grands espaces, grille asymétrique, typo XXL.
  **Pas d'illustration cartoon, pas d'emoji.**
- Boutons en pilule aubergine, texte crème ; seul le bouton principal se soulève au
  survol avec une ombre décalée nette `4px 4px 0` aubergine.
- Hiérarchie variée (pas de grille de cartes identiques).

### Interdits
Écran de chargement, curseur personnalisé, carrousel automatique, popup à l'arrivée,
texte posé sur une photo, petits libellés en capitales espacées au-dessus des titres,
mot isolé en couleur dans un titre, « → » dans les boutons, fondu à l'apparition de
chaque section. (Le « scroll-jacking » était interdit au départ : le défilement
horizontal ajouté plus tard reste **natif** — piste collante + translation, sans
intercepter la molette.)

### Technique, SEO, accessibilité
- Mobile first, de 360 à 1600 px ; tokens CSS en tête ; sélecteurs de classe simples ;
  pas de `!important` ; **tout le texte est dans le HTML** (le JS n'injecte aucun texte,
  il affiche/masque et met à jour des chiffres).
- Pas d'image externe : emplacements stylés (fond pastel, trame, légende décrivant la
  photo attendue et son format) + balise `<img>` prête en commentaire (width, height,
  alt, `loading="lazy"` sauf hero).
- Google Fonts : preconnect + `display=swap`, chargement non bloquant.
- **Lighthouse mobile ≥ 90 dans les 4 catégories** (actuellement 99–100 ; une mesure
  isolée tombe parfois à 92 à cause de la machine de test, vérifié en A/B).
- SEO : `lang="fr"`, title « Chaussettes anti-dérapantes pour chat | Mistigrip »,
  meta description ≤ 150 caractères, un seul H1, H2 formulés comme des recherches,
  H1 > H2 > H3 sans saut, canonical et Open Graph (URL/image à compléter),
  theme-color, favicon SVG (empreinte de chat en picots), JSON-LD Organization,
  WebSite et FAQPage identique à la FAQ visible (pas de Product ni d'avis agrégés).
- Accessibilité : contrastes AA, focus très visible, lien « Aller au contenu »,
  cibles de 44 px, ARIA (menu, interrupteur, accordéon, panier),
  **`prefers-reduced-motion` coupe toutes les animations** (tout s'affiche à sa place).

### Textes
Français, **vouvoiement**, ton chaleureux et complice avec de l'humour félin. Chaque
bouton dit exactement ce qu'il fait. Toute info « à confirmer » ou commerciale ajoutée
est signalée dans le code par `<!-- À VALIDER : … -->`, **jamais dans le texte visible**.

---

## 3. Ce que l'utilisateur a demandé, dans l'ordre (et ce qui a été fait)

1. **Page d'accueil complète** selon le brief (commit `3651e12`).
2. « Comment j'ouvre le site ? » puis « donne le dossier à télécharger » : envoi d'un
   .zip et d'un aperçu en un seul fichier HTML.
3. **« Rajoute des transitions, du mouvement au défilement, de la 3D, il faut que ça
   fasse site Awwwards »** (commit `a07ddbc`) : accroche du hero qui glisse,
   inclinaison des titres selon la vitesse de défilement, titres qui glissent à
   l'entrée, panneaux qui se redressent en 3D, cartes photo inclinables au pointeur,
   parallaxe des étapes et des avis, dernier appel ligne à ligne, grand logo lettre à
   lettre, galerie qui pivote en 3D, panier qui s'ouvre comme une porte, picot qui vole
   jusqu'au panier, FAQ qui se déplie en douceur. Défilement toujours natif.
4. **« Produit décomposé, chaque composant = un argument de vente, au scroll il
   s'ajoute au produit jusqu'à le constituer en entier »** (commit `e50bd3a`) :
   section « Comment marche une chaussette anti-dérapante ? » (`.kit`, panneau
   aubergine, entre « Problème » et « Achat »). Vue éclatée en 3D CSS (calques SVG
   empilés) : la maille se tricote, les picots descendent, le revers glisse, puis les
   3 autres chaussettes s'ouvrent en éventail (lot de 4) avec prix et bouton.
   C'est une **maquette provisoire, à remplacer par le rendu Blender** (voir § 6).
5. L'utilisateur a demandé si les fichiers se mettaient à jour sur son ordinateur
   (non : tout est poussé sur GitHub ; il a ensuite activé GitHub Pages).
6. **Bandeau des sols en défilement horizontal** (plusieurs allers-retours, commits
   `783b51e`, `0262ded`, `faaf184`, `ea3bc4a`, `0ddb6f4`). Demandes successives :
   - « quand on arrive là, le scroll devient horizontal jusqu'à ce qu'on ait vu tous
     les mots » ;
   - « la page entière défile vers la droite, le texte est statique, et au bout de la
     ligne le défilement redevient vertical ; il faut qu'on voie que le défilement a
     changé » ;
   - « le bandeau aux couleurs du site, et les couleurs changent en douceur au fur et
     à mesure qu'on découvre les mots » ;
   - référence : **landonorris.com** (section qui défile à l'horizontale) ;
   - « rapproche le texte, c'est trop éloigné » ; « à la place des points, mets une
     empreinte de chat » ; « réduis la taille du bandeau, il est trop large ».
   **Résultat actuel** : panneau arrondi (mêmes marges que les autres panneaux),
   hauteur compacte, figé au milieu de l'écran pendant le passage ; toute la bande
   glisse vers la gauche ; 9 sols en quinconce (pleins en haut, en contour en bas)
   resserrés autour du milieu, chacun avec une légende humoristique précédée d'une
   empreinte de chat ; le fond passe en fondu d'une couleur à l'autre à chaque mot
   (jaune, pêche, rose… et crème à la fin pour se fondre dans la page) ; barre de
   progression horizontale ; la barre d'achat mobile s'efface pendant le passage.
7. Correctif : `main { overflow-x: clip; }` (un panneau qui se redresse en 3D
   élargissait la page mobile de 2 px).
8. **Références à garder en tête** : templates-preview.oxvo.app (« studio max commerce
   3D ») — une enceinte 3D suit le défilement, tourne, apparaît et disparaît.
   L'utilisateur veut « quelque chose dans ce style » plus tard.
9. **Produit en 3D (en cours)** : l'utilisateur a modélisé la chaussette complète dans
   Blender et a fait générer par un Claude relié à Blender une animation en suite
   d'images (voir § 6). Le dossier est trop lourd pour être envoyé, et la session cloud
   n'a pas accès à son Mac : d'où le passage à une session locale.

---

## 4. État du code

### Ordre des sections (`index.html`)
Barre d'annonce → header collant (logo, « Comment ça marche », « Les tailles »,
« Conseils », « FAQ », panier, burger) → **Hero** (rose) → **Bandeau des sols**
(`.floors`, défilement horizontal) → **Problème et solution** (`#comment-ca-marche`,
crème, interrupteur « Sans / Avec Mistigrip ») → **Chaussette en kit** (`.kit`,
`#la-chaussette`, aubergine) → **Achat** (`#acheter`, pêche : poids → taille, galerie,
taille, quantité, « Ajouter au panier ») → **Avis** (`#avis`, contenu d'exemple à
remplacer) → **Habituation** (`#conseils`, jaune, 3 étapes) → **FAQ** (`#faq`,
6 questions) → **Dernier appel** (aubergine) → **Footer** (newsletter sans envoi réel,
liens, moyens de paiement, réseaux, grand logo) → barre d'achat mobile → panier latéral.

### `style.css` (22 sections)
1 Tokens · 2 Polices de secours · 3 Base · 4 Utilitaires · 5 Boutons · 6 Annonce ·
7 Header/nav/panier/burger · 8 Hero · 9 Emplacements photo · 10 Problème et solution ·
11 Achat · 12 Avis · 13 Habituation · 14 FAQ · 15 Dernier appel · 16 Footer ·
17 Panier · 18 Barre d'achat mobile · 19 Mouvement au chargement et aux actions ·
20 Bandeau des sols (styles de base) · 21 Mouvement au défilement et 3D
(tout sous `@media (prefers-reduced-motion: no-preference)` et `.has-motion`) ·
22 Chaussette en kit.

### `main.js` (IIFE, ES5)
1 Header qui s'affine · 2 Menu mobile (focus piégé, Échap) · 3 Interrupteur Sans/Avec ·
4 Poids → taille · 5 Galerie · 6 Quantité · 7 Panier (localStorage dans un try/catch) ·
8 Ajout au panier (« Ajouté », compteur qui rebondit, picot volant) ·
9 Barre d'achat mobile (variable `floorsPinned` : masquée pendant le bandeau
horizontal) · 10 Newsletter · **11 Moteur de mouvement**.

Moteur de mouvement : une boucle `requestAnimationFrame` lit la position du défilement
natif et écrit des variables CSS (`setVar` n'écrit que si la valeur change ; positions
mesurées sans les transform via `docTop`). `html.has-motion` est ajouté seulement si
l'utilisateur n'a pas demandé moins d'animations ; `stopMotion` remet tout en place.
- Courbes : `grip(t)` (dépasse ~2 % puis revient) et `slideGrip(t)` (glisse
  régulièrement, dépasse de 4 % à 80 % de la course, puis accroche).
- `measureMotion` appelle d'abord `measureFloors` (la longueur de la piste horizontale
  décale tout ce qui suit), puis mesure les éléments, puis `measureKit`.
- **Bandeau des sols** : les mots `.floors__item` sont placés en quinconce d'après
  leur largeur mesurée (`--x`) ; la bande mesure `--floors-w` ; la piste
  `.floors::after` a la hauteur `--floors-run` (= trajet horizontal, 1 px vers le bas
  = 1 px vers la droite) ; `--fx` décale la bande ; `--fp`/`--fdot` pilotent la barre
  de progression ; `--floors-bg` est la couleur calculée (fondu entre les couleurs
  `data-color` de chaque mot, lues dans les variables CSS, un fondu par mot réparti
  sur toute la course).
- **Chaussette en kit** : chaque étape `[data-kit-step]` a une progression selon la
  position de son texte ; la scène reçoit `--k1…--k4` (avec dépassement),
  `--k1s…--k4s` (sans), `--kp` (progression globale), et les classes `is-l1…is-l4`
  quand une pièce « accroche ». Desktop : texte à gauche, scène collante à droite ;
  mobile : scène collante en haut, texte qui défile dessous.

### Vérifications déjà faites à chaque étape
Pas d'erreur console, pas de débordement horizontal de 360 à 1920 px, panier,
menu, interrupteur et FAQ fonctionnels, version `prefers-reduced-motion` et sans
JavaScript lisibles, `html-validate` sans erreur, JSON-LD FAQ = FAQ visible,
Lighthouse mobile 99–100 (tests faits avec Playwright/Chromium, html-validate et
Lighthouse 12). Non testé : vrais Safari/Firefox, vrais téléphones, lecteurs d'écran.

---

## 5. Façon de travailler avec l'utilisateur

- Il écrit en français, de façon familière ; répondre en français, en vouvoyant,
  avec des explications simples (il n'est pas développeur).
- Il veut un rendu **visiblement** spectaculaire (Awwwards) ; il juge sur le site
  GitHub Pages, souvent avec des captures d'écran.
- Pour une grosse nouveauté, il a demandé qu'on lui dise d'abord si l'idée nous va
  (« avant de commencer dis-moi si ça te va »).
- Après chaque changement : vérifier, faire un commit en français, **pousser sur la
  branche `claude/sleepy-wright-jbfjw4`** (jamais sur une autre branche, pas de pull
  request sans demande), augmenter `?v=` dans `index.html`, puis lui dire de recharger
  la page GitHub Pages (Cmd + Maj + R si besoin).
- Quand on lui envoie des fichiers à télécharger, mettre un numéro de version dans le
  nom (il a déjà ouvert un ancien téléchargement par erreur).
- Ne jamais présenter les contenus d'exemple (avis, légendes humoristiques) comme
  vrais : ils sont marqués dans le code.

---

## 6. Prochaine étape : intégrer l'animation Blender

### Ce que l'utilisateur veut
« Le produit décomposé, qui se recompose au scroll, avec un **zoom sur chaque détail du
produit** qui peut être tourné en argument : les picots antidérapants, la matière, le
petit **bracelet pour serrer la chaussette**. » Cette animation remplace la chaussette
dessinée en SVG de la section `.kit`.

> Attention : le site parle actuellement d'un « revers élastique » (marqué À VALIDER).
> Le vrai produit a un **bracelet de serrage** : remplacer ce texte.

### Les fichiers sur le Mac de l'utilisateur
Dossier **`rendu`** (à côté du fichier .blend) : `chaussette_0001.png` à
`chaussette_0250.png` (fond transparent, 1600 × 1600 px, gestion des couleurs
« Standard », sans flou de mouvement) et **`reperes.txt`** (plages des étapes et images
où chaque zoom est au maximum). Scénario demandé au Claude de Blender :
1–30 vue d'ensemble éclatée, la caméra tourne lentement ;
31–90 la maille se met en place, zoom sur le tricot, recul ;
91–150 les picots se posent sous la semelle, la chaussette pivote, zoom, recul ;
151–210 le bracelet descend sur la cheville et se resserre, zoom, recul ;
211–250 chaussette complète, dernier quart de tour.
(Vérifier les plages réelles dans `reperes.txt`, et le nombre réel d'images.)

### Ce qu'il faut faire
1. Récupérer le dépôt sur la branche `claude/sleepy-wright-jbfjw4`.
2. Convertir les images sans toucher aux originaux : WebP qualité ~80, 1200 px pour
   ordinateur (`images/sequence/`) et 720 px pour mobile (`images/sequence-mobile/`).
   Viser ~20 Mo au total pour ordinateur.
3. Dans `.kit`, remplacer la scène SVG par un **canvas collant** qui affiche l'image
   correspondant à la position du défilement (en avant et en arrière), avec un
   chargement progressif à l'approche de la section (par exemple une image sur
   quatre d'abord, puis le reste), sans bibliothèque. Garder la mise en page actuelle
   (texte à gauche sur ordinateur, scène en haut sur mobile) et la logique des étapes
   `[data-kit-step]`.
4. Caler les étapes de texte sur `reperes.txt` : la matière, les picots, le bracelet
   de serrage, puis le lot de 4 avec le prix et « Choisir ma taille ».
5. Version sans animation (`prefers-reduced-motion`, sans JS) : quelques images clés
   fixes avec leur texte, sans saut de mise en page.
6. Vérifier : pas d'erreur ni de débordement de 360 à 1600 px, Lighthouse mobile ≥ 90
   (les images ne doivent pas ralentir l'arrivée sur la page), puis passer
   `?v=8` à `?v=9`, commit, push.

### À demander à l'utilisateur
La vraie composition de la maille, le type de picots, la fermeture du bracelet
(scratch, élastique, boucle…), pour écrire des arguments exacts.

---

## 7. Points encore marqués « À VALIDER » dans le code

Prix 14,90 € le lot de 4 · seuil de livraison offerte 29 € · frais de port sous le
seuil 3,90 € · expédition sous 48 h · retours gratuits 30 jours · correspondance
poids / taille (S < 3 kg, M 3–5 kg, L > 5 kg) et conseil « entre deux tailles » ·
composition, entretien et consignes de lavage · arguments des pièces de la chaussette ·
offre newsletter -10 % et outil d'e-mailing à brancher · URL définitive du site
(canonical, og:url, JSON-LD) et image de partage 1200 × 630 · comptes sociaux · URL des
pages légales et d'aide · moyens de paiement · mention « Taxes incluses » · URL du
tunnel de commande (lien vide) · délai de réponse du service client · **avis d'exemple
à remplacer par de vrais avis avant la mise en ligne** · photos à produire
(emplacements décrits sur la page, balises `<img>` prêtes en commentaire).
