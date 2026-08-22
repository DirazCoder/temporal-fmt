import { defineConfig } from 'tsup';

export default defineConfig({
  // Subpath entry points (plan section AI). Each subpath exposes one
  // capability area so callers who only need format() don't pull in
  // interval/recurrence/business-calendar code. The main entry
  // (src/index.ts) still exports everything for callers who want it.
  entry: [
    'src/index.ts',
    'src/format.ts',
    'src/parse.ts',
    'src/duration.ts',
    'src/relativeTime.ts',
    'src/interval.ts',
    'src/calendarUtils.ts',
    'src/timezone.ts',
    'src/recurrence.ts',
    'src/localeRegistry.ts',
  ],
  format: ['esm', 'cjs'],
  // TypeScript 7 broke rollup-plugin-dts (#7.0.2 crashes). Declarations 
  // are built via tsc in the build script instead — re-enable once patched.
  dts: false,
  clean: true,
  sourcemap: true,
  // Minify only for the actual npm publish (TSUP_MINIFY=true, see
  // build:publish in package.json). Off by default because esbuild's
  // minification inlines small functions, which breaks c8's
  // function-coverage attribution — inlined functions aren't counted as
  // separate entries, so function coverage reads artificially low
  // (30.94% instead of the real ~90%). test:all and CI both build
  // against this default, unminified output, so the coverage gate stays
  // meaningful; only the published tarball takes the ~20KB size hit of
  // going without minification during everyday builds.
  minify: process.env.TSUP_MINIFY === 'true',
  target: 'esnext',
  // Preserve /* c8 ignore */ comments through the build so c8's coverage
  // report actually respects them. esbuild strips all comments except
  // ones tagged @license/@preserve or starting with //!//*! by default;
  // 'inline' keeps those in place instead of stripping them. Marking
  // each c8 ignore comment with @preserve is what makes this apply.
  esbuildOptions(options) {
    options.legalComments = 'inline';
  },
});