import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:10086',
    headless: true,
    viewport: { width: 375, height: 812 }, // iPhone X size
  },
  webServer: {
    command: 'pnpm build:h5 && npx serve dist -l 10086',
    port: 10086,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
})
