import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { build } from 'esbuild';
import manifest from './manifest.config';

/**
 * Le content script est injecté à la demande (chrome.scripting.executeScript) :
 * on le compile en un seul fichier autonome `content.js`. Contrairement au
 * chargeur ES module de @crxjs, il n'a pas besoin d'être déclaré en
 * web_accessible_resources (les sites ne peuvent donc pas détecter l'extension)
 * et fonctionne aussi sur les pages file://.
 */
function contentScript(minify: boolean): Plugin {
  return {
    name: 'scrapy-easy-content-script',
    apply: 'build',
    async generateBundle() {
      const res = await build({
        entryPoints: ['src/content/index.ts'],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'chrome110',
        minify,
        legalComments: 'none',
      });
      this.emitFile({ type: 'asset', fileName: 'content.js', source: res.outputFiles[0].text });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), crx({ manifest }), contentScript(mode !== 'development')],
  // Les icônes sont copiées par @crxjs depuis le manifest : pas de copie brute de public/.
  publicDir: false,
  build: {
    target: 'chrome110',
    rollupOptions: {
      input: { app: 'src/ui/index.html' },
    },
  },
}));
