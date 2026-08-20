// TypeScript's node10 module resolution (the default before `moduleResolution:
// "node16"/"bundler"`) predates the `exports` field entirely. It resolves
// subpath imports like `temporal-fmt/format` by looking for a physical
// `format.d.ts` at the package root — it never reads `package.json#exports`.
// Since our types only exist under dist/, node10 consumers get a resolution
// failure even though every modern resolver (node16, bundler) is fine. See
// https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/NoResolution.md
//
// Fix: drop a one-line re-export shim at the package root for every subpath,
// pointing at the real dist file. This script derives the shim list from
// `exports` directly, so a subpath added there without a matching shim here
// fails the build instead of silently shipping a broken node10 path.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PKG_JSON_PATH = fileURLToPath(new URL('../package.json', import.meta.url));

function shimBody(distPathWithoutExt) {
  return `export * from './${distPathWithoutExt}';\n`;
}

async function main() {
  const pkg = JSON.parse(await readFile(PKG_JSON_PATH, 'utf8'));
  const exportsMap = pkg.exports;

  if (!exportsMap || typeof exportsMap !== 'object') {
    throw new Error('emit-node10-shims: package.json has no "exports" map to read');
  }

  const written = [];

  for (const [subpath, condition] of Object.entries(exportsMap)) {
    if (subpath === '.') continue; // root entry doesn't need a shim

    const importTypes = condition?.import?.types;
    const requireTypes = condition?.require?.types;
    if (!importTypes || !requireTypes) {
      throw new Error(`emit-node10-shims: "${subpath}" is missing import/require types in exports`);
    }

    // subpath is like "./format" -> shim file "format.d.ts" at package root
    const name = subpath.replace(/^\.\//, '');

    // importTypes is like "./dist/format.d.ts" -> dist/format (no ext) for the re-export target
    const esmTarget = importTypes.replace(/^\.\//, '').replace(/\.d\.ts$/, '');
    const cjsTarget = requireTypes.replace(/^\.\//, '').replace(/\.d\.cts$/, '');

    await writeFile(new URL(`${name}.d.ts`, `file://${PKG_ROOT}`), shimBody(esmTarget));
    await writeFile(new URL(`${name}.d.cts`, `file://${PKG_ROOT}`), shimBody(cjsTarget));
    written.push(`${name}.d.ts`, `${name}.d.cts`);
  }

  console.log(`emit-node10-shims: wrote ${written.length} shim file(s) at package root: ${written.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
