# website

The temporal-fmt docs site: sidebar, search, and live npm stats. Plain HTML, CSS and JS, no framework, no dependencies.

    cd website
    npm run build     # writes public/
    npm start         # preview it locally

## Layout

    src/
      styles/       colours, fonts, spacing (tokens.css)
      components/   small reusable bits: logo, buttons, code blocks, tables
      content/      the docs themselves, one HTML file per section (edit these)
      sections/     sections.js, which reads content/ in filename order
      layout/       the HTML shell: head, sidebar, main column
      pages/        home.js, which puts the shell and sections together
      script.js     sidebar nav, search, copy buttons, live npm stats
    build.js        turns src/ into public/

Each folder only imports from the ones listed above it. To add a docs section, drop a new file in `src/content/` (`NN-name.html`, a `<section>` with `id`, `data-group` and `data-title`); the sidebar and search pick it up on their own. The live stats call the npm registry from the browser, so they only work on a real host, not in sandboxed previews.

## Deploying

`public/` is committed, so you can deploy it as is. Any static host works:

- **Netlify / Vercel / Cloudflare Pages:** root directory `website`, build command `npm run build`, output directory `public`.
- **GitHub Pages:** publish the `website/public` folder.
- **Anything else:** upload the contents of `public/`.
