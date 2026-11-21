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
    // Coverage for THIS suite is its own pipeline, fully independent of
    // the c8-based `npm run test:coverage` (which measures node --test
    // against dist/). The vitest suite must cover src/ on its own.
    // Provider 'v8' resolves to @vitest/coverage-v8 (devDependency);
    // `npx vitest run --coverage` enforces the 100% thresholds below.
    // While iterating on one module, scope the run, e.g.:
    //   npx vitest run vitest/parse/parse.unit.test.ts \
    //     --coverage --coverage.include='src/parse/parse.ts'
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'text-summary'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
