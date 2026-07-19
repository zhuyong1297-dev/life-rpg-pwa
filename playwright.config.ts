import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/life-rpg-pwa/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm preview --port 4173',
    url: 'http://127.0.0.1:4173/life-rpg-pwa/',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'narrow', use: { viewport: { width: 320, height: 700 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 960 } } },
  ],
})
