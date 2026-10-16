import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Ядро (core) и формат данных (content) не должны зависеть от браузера:
// ни DOM/Canvas/Gamepad, ни часов, ни Math.random(), ни слоёв input/render/app/audio.
const browserOnlyGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'performance',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'setTimeout',
  'setInterval',
  'fetch',
  'Date',
].map((name) => ({ name, message: 'Ядро и формат данных не обращаются к браузеру и часам.' }));

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tests/**/*.ts', '*.config.{js,ts}', 'tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/core/**/*.ts', 'src/content/**/*.ts', 'src/brick/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...browserOnlyGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Случайность — только через seeded RNG из core/rng.' },
        { object: 'Date', property: 'now', message: 'В симуляции нет обращений к часам.' },
        { object: 'performance', property: 'now', message: 'В симуляции нет обращений к часам.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/input/**', '**/render/**', '**/app/**', '**/audio/**'],
              message: 'core и content не зависят от браузерных слоёв.',
            },
          ],
        },
      ],
    },
  },
);
