import { defineConfig } from 'vitest/config';

// Базовый путь по умолчанию — «/». Для размещения в подкаталоге:
//   npm run build -- --base=/CrocodileMario/   (или npm run build:pages)
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
