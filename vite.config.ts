import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const BUILD_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// Ficheros de /public que también queremos tener sin conexión.
const PUBLIC_PRECACHE = [
  './',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

/**
 * Genera dist/sw.js a partir de src/sw/sw-template.js con la lista de
 * ficheros del build, para que la app funcione sin conexión.
 */
function serviceWorker(): Plugin {
  return {
    name: 'diaadia-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      // pdf.js (casi 2 MB) se guarda la primera vez que se abre un PDF, no al instalar.
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !/^assets\/pdf[.-]/.test(f));
      const template = readFileSync('src/sw/sw-template.js', 'utf8');
      const source = template
        .replace('__VERSION__', BUILD_ID)
        .replace('__PRECACHE__', JSON.stringify([...PUBLIC_PRECACHE, ...built], null, 0));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Rutas relativas: funciona igual en GitHub Pages (/personal/) que en Netlify (/).
  base: './',
  plugins: [react(), serviceWorker()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    target: ['es2020', 'safari15'],
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
