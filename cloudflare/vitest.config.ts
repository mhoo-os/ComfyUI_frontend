import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    restoreMocks: true,
    unstubGlobals: true,
    environment: 'node',
    include: ['cloudflare/*.test.ts']
  }
})
