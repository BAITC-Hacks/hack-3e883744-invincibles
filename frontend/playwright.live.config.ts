import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/live.spec.ts',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:8080', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium-live', use: { ...devices['Desktop Chrome'] } }],
})
