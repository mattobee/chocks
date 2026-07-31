import { defineConfig, devices } from '@playwright/test'

/**
 * Each test boots its own chocks server against a throwaway git repo, so there is no
 * shared `webServer` here. That costs a little startup time and buys full isolation:
 * a test that writes files cannot affect another.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
    // Locators are role-based throughout, so a broken accessible name fails the test.
    testIdAttribute: 'data-nonexistent',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
