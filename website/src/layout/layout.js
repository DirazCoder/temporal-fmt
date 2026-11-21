// The HTML shell: head, sidebar (logo, search, nav) and the main column.
// The nav links are filled in by script.js from the sections themselves.
import { esc, logo } from '../components/ui.js';

const favicon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 14"><circle cx="7" cy="7" r="6" fill="#22d3ee"/><circle cx="15" cy="7" r="6" fill="#fb923c" fill-opacity=".85"/></svg>',
)}`;

export const baseLayout = ({ title, description, main, version, readme }) =>
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="icon" href="${favicon}">
  <link rel="stylesheet" href="styles.css">
  <script>try{document.documentElement.dataset.theme=localStorage.getItem('tfmt-theme')||'dark'}catch(e){document.documentElement.dataset.theme='dark'}</script>
</head>
<body>
<a class="github-repo" href="https://github.com/DirazCoder/temporal-fmt" target="_blank" rel="noopener noreferrer" aria-label="View temporal-fmt on GitHub">
  <img src="GitHub_Invertocat_Black.svg" alt="">
</a>
<button class="theme" id="theme" type="button"></button>
<div class="shell">
<aside>
  ${logo()}${version ? ` <small>v${esc(version)}</small>` : ''}
  <div class="search"><input id="q" type="search" placeholder="Search the docs" aria-label="Search the docs" autocomplete="off"><kbd>/</kbd></div>
  <p class="readme-prompt">Want to read the full Repo doc?</p>
  <button class="readme-open" id="readme-open" type="button">Read Repo README</button>
  <button class="menu" id="menu" type="button">Menu</button>
  <nav class="nav" id="nav" aria-label="Docs"></nav>
</aside>
<main>
${main}
</main>
</div>
<dialog class="readme-dialog" id="readme-dialog" aria-labelledby="readme-title">
  <header class="readme-dialog__header">
    <h2 id="readme-title">Repository README</h2>
    <button class="readme-close" id="readme-close" type="button">Close</button>
  </header>
  <div class="readme-content">${readme}</div>
  <footer class="readme-dialog__footer">
    Powered by my own Markdown Parser <a href="https://www.npmjs.com/package/nitpicky-md" target="_blank" rel="noopener noreferrer">Nitpicky-md</a>
  </footer>
</dialog>
<script src="script.js" defer></script>
</body>
</html>
`;
