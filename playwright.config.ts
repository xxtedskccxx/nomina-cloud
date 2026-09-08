import { resolve } from 'node:path'
import { config as loadDotEnv } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

loadDotEnv({ path: resolve(process.cwd(), '.env'), quiet: true })
process.env.NODE_ENV = 'test'
process.env.PAYSLIP_STORAGE_ROOT = resolve(process.cwd(), 'storage/test-payslips')

const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:4000/api'
const webUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const reuseExistingServer = !process.env.CI

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @payroll/api start',
      url: `${apiUrl}/health`,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @payroll/web start:standalone',
      url: `${webUrl}/login`,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
})
