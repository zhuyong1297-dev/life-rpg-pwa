import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
})
