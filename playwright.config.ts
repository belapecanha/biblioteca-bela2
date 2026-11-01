import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'testes/app',
  timeout: 60000,
  workers: 1,
  use: { screenshot: 'only-on-failure' }
})
