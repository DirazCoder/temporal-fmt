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
    // Coverage is measured separately via `npm run test:coverage`, using
    // c8 directly against `node --test` (see package.json). vitest's own
    // coverage provider only instruments what vitest itself runs — this
    // suite's format.ts/parse.ts paths are almost entirely exercised by
    // node --test against dist/ instead, so vitest coverage numbers here
    // would report those files as ~0% covered when they're closer to
    // fully covered; the config block below is left out to avoid that
    // misleading number showing up if someone runs `vitest --coverage`
    // directly.
  },
});