// Builds the site into public/. No dependencies: `npm run build` (or `node build.js`).
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import home from './src/pages/home.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'public');
// Show the library version in the footer. If this folder is deployed on its own
// (no ../package.json next to it), the footer just leaves the version out.
let version = '';
try {
  version = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')).version;
} catch {}

// Order matters: tokens first, then components, sections, layout.
const css = ['styles/tokens.css', 'components/ui.css', 'sections/sections.css', 'layout/layout.css']
  .map((f) => readFileSync(join(here, 'src', f), 'utf8'))
  .join('\n');

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), home({ version }));
writeFileSync(join(out, 'styles.css'), css);
copyFileSync(join(here, 'src/script.js'), join(out, 'script.js'));
console.log(`built public/${version ? ` (v${version})` : ''}`);
