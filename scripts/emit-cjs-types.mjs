// tsup's dts bundler crashes under TypeScript 7 (see tsup.config.ts), so
// declarations come from a plain `tsc --declaration` pass instead. tsc
// always emits `.d.ts` for `.ts` sources — the output extension follows
// the source file, not the `module` compiler setting — so dist/index.cjs
// has no matching CJS type declaration and `require()` callers resolve
// an ESM-shaped .d.ts that arethetypeswrong flags as "masquerading as ESM".
//
// Fix: copy each .d.ts to .d.cts and rewrite relative `./x.js` specifiers
// to `./x.cjs` so they resolve to real siblings. Bare specifiers (package
// imports) are untouched.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url));

const RELATIVE_JS_IMPORT = /(from\s+['"])(\.\.?\/[^'"]+)\.js(['"])/g;

async function main() {
  const entries = await readdir(DIST_DIR);
  const declarationFiles = entries.filter((name) => name.endsWith('.d.ts'));

  if (declarationFiles.length === 0) {
    throw new Error(`emit-cjs-types: no .d.ts files found in ${DIST_DIR} — did the tsc build step run first?`);
  }

  for (const name of declarationFiles) {
    const source = await readFile(join(DIST_DIR, name), 'utf8');
    const rewritten = source.replace(RELATIVE_JS_IMPORT, '$1$2.cjs$3');
    const cjsName = name.replace(/\.d\.ts$/, '.d.cts');
    await writeFile(join(DIST_DIR, cjsName), rewritten);
  }

  console.log(`emit-cjs-types: wrote ${declarationFiles.length} .d.cts file(s) alongside their .d.ts counterparts`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
