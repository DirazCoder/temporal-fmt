// The HTML shell every page shares: head, header, main, footer.
import { esc } from '../components/ui.js';

const favicon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 14"><circle cx="7" cy="7" r="6" fill="#22d3ee"/><circle cx="15" cy="7" r="6" fill="#fb923c" fill-opacity=".85"/></svg>',
)}`;

export const baseLayout = ({ title, description, header, main, footer }) =>
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="icon" href="${favicon}">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    ${header}
    <main>${main}</main>
    ${footer}
  </div>
  <script src="script.js" defer></script>
</body>
</html>
`;
