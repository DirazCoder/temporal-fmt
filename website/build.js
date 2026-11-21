// Builds the site into public/ with `nitpicky-md` for the repository README.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'nitpicky-md';
import home from './src/pages/home.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'public');
const readme = render(readFileSync(join(here, '../README.md'), 'utf8'), { dialect: 'gfm' });
// Show the library version in the footer. If this folder is deployed on its own
// (no ../package.json next to it), the footer just leaves the version out.
let version = '';
try {
  version = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')).version;
} catch {}

// Order matters: tokens, flashbang (colours), components, sections, layout.
const css = ['styles/tokens.css', 'styles/flashbang.css', 'components/ui.css', 'sections/sections.css', 'layout/layout.css']
  .map((f) => readFileSync(join(here, 'src', f), 'utf8'))
  .join('\n');

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), home({ version, readme }));
writeFileSync(join(out, 'styles.css'), css);
copyFileSync(join(here, 'src/script.js'), join(out, 'script.js'));
copyFileSync(join(here, 'src/GitHub_Invertocat_Black.svg'), join(out, 'GitHub_Invertocat_Black.svg'));
console.log(`built public/${version ? ` (v${version})` : ''}`);
