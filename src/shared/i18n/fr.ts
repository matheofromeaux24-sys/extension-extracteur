// Tous les textes de l'extension. Pour ajouter une langue, copier ce fichier
// (ex. en.ts) en respectant le type `Messages`, puis l'enregistrer dans index.ts.

const fr = {
  appName: 'Scrapy Easy',
  modes: {
    list: 'Extraire la liste',
    details: 'Détails de la page',
  },
  header: {
    help: 'Aide',
  },
  page: {
    reanalyze: 'Analyser à nouveau',
    changed: 'Vous êtes sur une autre page.',
    changedForbidden: 'Chrome interdit d’analyser cette page. Les résultats affichés concernent la page précédente.',
    analyzeThis: 'Analyser cette page',
    noTab: 'Aucun onglet sélectionné',
  },
  status: {
    injecting: 'Connexion à la page…',
    detecting: 'Recherche des listes sur la page…',
  },
  list: {
    position: 'Liste {current} sur {total}',
    items: '{count} éléments',
    prev: 'Liste précédente',
    next: 'Liste suivante',
    edit: 'Modifier la liste',
    editSoon: 'Disponible à l’étape suivante',
  },
  stats: {
    pages: 'Pages',
    items: 'Articles',
    duration: 'Durée',
  },
  table: {
    rowNumber: '#',
    empty: '(vide)',
    openLink: 'Ouvrir le lien dans un nouvel onglet',
  },
  export: {
    copy: 'Copier',
    copied: '{count} lignes copiées : collez-les dans Google Sheets ou Excel',
    download: 'Télécharger',
    csvExcel: 'CSV pour Excel (séparateur ;)',
    csvComma: 'CSV standard (séparateur ,)',
    xlsx: 'Excel (.xlsx)',
    downloaded: 'Fichier {name} téléchargé',
    error: 'Échec de l’export : {message}',
  },
  errors: {
    forbiddenTitle: 'Cette page ne peut pas être analysée',
    forbiddenChrome:
      'Chrome interdit aux extensions de lire ses pages internes (chrome://, paramètres, nouvel onglet) et le Chrome Web Store. Ouvrez un site web classique puis réessayez.',
    forbiddenFile:
      'Pour analyser un fichier local, activez « Autoriser l’accès aux URL de fichier » dans chrome://extensions → Scrapy Easy → Détails.',
    forbiddenPdf: 'Les documents PDF ne peuvent pas être analysés.',
    permissionTitle: 'Autorisation nécessaire',
    permissionText:
      'Pour lire {domain}, Scrapy Easy a besoin de votre accord. Il est demandé une seule fois par site et vous pouvez le retirer à tout moment.',
    permissionButton: 'Autoriser l’accès à {domain}',
    permissionDenied: 'Accès refusé. Cliquez à nouveau sur le bouton pour autoriser ce site.',
    noListTitle: 'Aucune liste détectée',
    noListText:
      'Nous n’avons pas trouvé d’éléments répétés sur cette page. Faites défiler la page pour charger son contenu, puis cliquez sur « Analyser à nouveau ».',
    genericTitle: 'Une erreur est survenue',
    loading: 'La page est encore en cours de chargement. Patientez un instant puis réessayez.',
    retry: 'Réessayer',
  },
  details: {
    soonTitle: 'Bientôt disponible',
    soonText: 'L’extraction des détails d’une page unique arrive dans une prochaine étape.',
  },
  help: {
    title: 'Comment ça marche ?',
    steps: [
      'Ouvrez la page qui contient les données (résultats de recherche, catalogue, tableau…).',
      'Scrapy Easy détecte automatiquement la liste principale et la surligne en vert sur la page.',
      'Si ce n’est pas la bonne, utilisez « Liste suivante » ou « Liste précédente ».',
      'Cliquez sur « Copier » pour coller dans Google Sheets, ou sur « Télécharger » pour un fichier CSV ou Excel.',
    ],
    shortcut: 'Raccourci : Alt+Maj+S pour ouvrir Scrapy Easy.',
    close: 'Fermer',
  },
  columns: {
    title: 'Titre',
    description: 'Description',
    link: 'Lien',
    image: 'Image',
    price: 'Prix',
    oldPrice: 'Ancien prix',
    date: 'Date',
    rating: 'Note',
    reviews: 'Avis',
    number: 'Nombre',
    email: 'Email',
    phone: 'Téléphone',
    text: 'Texte',
    author: 'Auteur',
    brand: 'Marque',
    address: 'Adresse',
    category: 'Catégorie',
    availability: 'Disponibilité',
    discount: 'Remise',
    location: 'Lieu',
    tag: 'Étiquette',
    column: 'Colonne',
  },
};

export type Messages = typeof fr;
export default fr;
