import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const port = 3000;
const baseURL = `http://127.0.0.1:${port}`;
const downloadPath = path.resolve('.tmp/e2e-downloads');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `mkdir -p "${downloadPath}" && node server/index.js`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DOWNLOAD_PATH: downloadPath,
      SEARCH_PROVIDER: 'deezer',
      ALLOWED_ORIGIN: baseURL,
    },
  },
});
