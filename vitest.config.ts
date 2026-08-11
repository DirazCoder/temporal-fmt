import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node --test/*.test.js exercises the built dist/ output — these run
    // straight against src/ instead, so a broken build can't hide a
    // regression or a passing build mask one.
    include: ['vitest/**/*.test.ts'],
    typecheck: {
      include: ['vitest/**/*.test-d.ts'],
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});