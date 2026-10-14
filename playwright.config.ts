import { defineConfig } from '@playwright/test';

// Браузерный smoke-тест идёт по production-сборке с базовым путём /CrocodileMario/,
// чтобы заодно проверить размещение в подкаталоге.
// Локально можно указать уже установленный Chromium: CHROMIUM_PATH=/путь/к/chrome
const executablePath = process.env.CHROMIUM_PATH;
const base = '/CrocodileMario/';
const port = 4173;

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: `npm run build:pages && npx vite preview --base=${base} --port ${port} --strictPort`,
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: `http://localhost:${port}${base}`,
    // Переходы страницы (вид «только экран») в тестах мгновенные; анимацию проверяет отдельный тест, включая движение.
    reducedMotion: 'reduce',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
