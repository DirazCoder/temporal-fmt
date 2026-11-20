import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

type BrowserName = 'chromium' | 'firefox' | 'webkit';

function isBrowserName(value: string): value is BrowserName {
  return value === 'chromium' || value === 'firefox' || value === 'webkit';
}

const requestedBrowser = process.env.VITEST_BROWSER;
if (requestedBrowser !== undefined && !isBrowserName(requestedBrowser)) {
  throw new Error(`Unsupported VITEST_BROWSER "${requestedBrowser}". Use chromium, firefox, or webkit.`);
}

export default defineConfig({
  test: {
    include: ['vitest/**/*.test.ts'],
    maxWorkers: 2,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: requestedBrowser ?? 'chromium' }],
    },
  },
});
