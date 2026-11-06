import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/a11y',
  testMatch: '**/*.test.js',
  timeout: 30000,
  reporter: './tests/a11y/a11y.reporter.js',
  use: {
    browserName: 'chromium',
    headless: true,
    ignoreHTTPSErrors: true,
  },
  workers: 1, // Run sequentially — avoids race conditions on localhost
});
