import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results/ui',
  testIgnore: '**/live.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: process.env.LIVE_BASE_URL || 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: process.env.LIVE_BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
