import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Scrapy Easy',
  short_name: 'Scrapy Easy',
  version: pkg.version,
  description: 'Extrayez les données de n’importe quelle page en 1 clic, sans code.',
  icons: {
    16: 'public/icons/icon16.png',
    32: 'public/icons/icon32.png',
    48: 'public/icons/icon48.png',
    128: 'public/icons/icon128.png',
  },
  action: {
    default_title: 'Scrapy Easy (Alt+Maj+S)',
    default_icon: {
      16: 'public/icons/icon16.png',
      32: 'public/icons/icon32.png',
    },
  },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['activeTab', 'scripting', 'storage', 'tabs', 'sidePanel'],
  // Demandées domaine par domaine, au premier usage (bouton « Autoriser »).
  optional_host_permissions: ['<all_urls>'],
  commands: {
    _execute_action: {
      suggested_key: { default: 'Alt+Shift+S' },
      description: 'Ouvrir Scrapy Easy',
    },
  },
});
