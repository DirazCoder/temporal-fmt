import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // TypeScript 7 broke rollup-plugin-dts (#7.0.2 crashes). Declarations 
  // are built via tsc in the build script instead — re-enable once patched.
  dts: false,
  clean: true,
  sourcemap: true,
  minify: true,
  target: 'esnext',
});