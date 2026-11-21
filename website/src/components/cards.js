// Bigger pieces built from the small ones in ui.js.
import { eyebrow, codeBlock, copyButton, esc } from './ui.js';

export const installCommand = (cmd) =>
  `<div class="install"><span class="install__prompt" aria-hidden="true">$</span><code>${esc(cmd)}</code>${copyButton(cmd)}</div>`;

export const featureCard = ({ title, body }) =>
  `<article class="feature"><h3>${title}</h3><p>${body}</p></article>`;

export const exampleCard = ({ label, code, result }) =>
  `<article class="example">
    ${eyebrow(label)}
    ${codeBlock(code)}
    <p class="example__out"><span aria-hidden="true">→</span> ${result}</p>
  </article>`;

export const subpathRow = ({ path, note }) =>
  `<li class="subpath"><code>temporal-fmt/${path}</code><span>${note}</span></li>`;

export const navLink = ({ href, label }) => `<a class="nav__link" href="${href}">${label}</a>`;
