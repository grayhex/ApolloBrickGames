import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/** A real directory entry keeps the public page usable on static hosts without SPA rewrites. */
const encyclopediaEntry: Plugin = {
  name: 'encyclopedia-static-entry',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const html = bundle['index.html'];
    if (html?.type === 'asset') this.emitFile({ type: 'asset', fileName: 'encyclopedia/index.html', source: html.source });
  },
};

// Базовый путь по умолчанию — «/». Для размещения в подкаталоге:
//   npm run build -- --base=/CrocodileMario/   (или npm run build:pages)
export default defineConfig({
  base: '/',
  plugins: [encyclopediaEntry],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
