// The docs sections. Each one lives in src/content/ as its own HTML file, so
// changing a paragraph never means digging through JS.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '../content');

export const docs = () =>
  readdirSync(contentDir)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => readFileSync(join(contentDir, f), 'utf8'))
    .join('\n');

export const noResults = () =>
  `<p class="empty" id="empty">Nothing matches that. Try a token (<code>yyyy</code>), a function name, or a word like “locale”.</p>`;
