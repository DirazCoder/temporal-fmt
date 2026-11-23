export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TOKEN = /(\/\/.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(import|from|const|let)\b/g;
export function highlight(src) {
  let out = '', last = 0, m;
  while ((m = TOKEN.exec(src))) {
    out += esc(src.slice(last, m.index));
    const kind = m[1] ? 'c' : m[2] ? 's' : 'k';
    out += `<span class="tk-${kind}">${esc(m[0])}</span>`;
    last = TOKEN.lastIndex;
  }
  return out + esc(src.slice(last));
}

export const logo = () =>
  `<a class="logo" href="#top" aria-label="temporal-fmt home">
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="var(--cold)"/><circle cx="15" cy="7" r="6" fill="var(--warm)" fill-opacity=".85"/></svg>
    <span>temporal-fmt</span>
  </a>`;

export const button = ({ href, label, variant = 'solid' }) =>
  `<a class="btn btn--${variant}" href="${href}" rel="noopener">${label}</a>`;

export const badge = (text) => `<span class="badge">${text}</span>`;

export const eyebrow = (text) => `<p class="eyebrow">${text}</p>`;

export const codeBlock = (src) => `<pre class="code"><code>${highlight(src.trim())}</code></pre>`;

export const copyButton = (text) =>
  `<button class="copy" type="button" data-copy="${esc(text)}">copy</button>`;
