import esbuild from 'rollup-plugin-esbuild';
import terser from '@rollup/plugin-terser';

// keep in sync with the entry list in tsup.config.ts and the package.json exports
const input = {
  index: 'src/index.ts',
  format: 'src/format.ts',
  parse: 'src/parse.ts',
  legacy: 'src/legacy.ts',
  duration: 'src/duration.ts',
  relativeTime: 'src/relativeTime.ts',
  interval: 'src/interval.ts',
  calendarUtils: 'src/calendarUtils.ts',
  timezone: 'src/timezone.ts',
  recurrence: 'src/recurrence.ts',
  localeRegistry: 'src/localeRegistry.ts',
};

// No unsafe/pure_getters here: the full unsafe set saved 5KB but broke
// formatRFC3339 and formatISO. Top-level mangling alone gets ~23KB.
const terserOptions = (esm) => ({
  ecma: 2022,
  module: esm,
  toplevel: true,
  compress: { passes: 3 },
  mangle: { toplevel: true },
  format: { comments: false },
});

const build = (format, ext, esm) => ({
  input,
  // relies on "sideEffects": false in package.json
  treeshake: { moduleSideEffects: false },
  plugins: [esbuild({ target: 'esnext', tsconfig: 'tsconfig.json' }), terser(terserOptions(esm))],
  output: {
    dir: 'dist',
    format,
    entryFileNames: `[name].${ext}`,
    chunkFileNames: `chunk-[hash].${ext}`,
    exports: 'named',
    // maps were 3.2MB of the 4.8MB dist
    sourcemap: false,
    ...(esm ? {} : { interop: 'auto' }),
  },
});

export default [build('es', 'js', true), build('cjs', 'cjs', false)];
