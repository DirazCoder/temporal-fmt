# website

The temporal-fmt landing page. Plain HTML and CSS, no framework, no dependencies.

    cd website
    npm run build     # writes public/
    npm start         # preview it locally

## Layout

    src/
      styles/       colours, fonts, spacing (tokens.css)
      components/   small reusable bits: buttons, code blocks, cards
      sections/     the page sections: header, hero, examples, features...
      layout/       the HTML shell every page shares
      pages/        home.js, which puts the sections together
      script.js     the copy button, the only client-side JS
    build.js        turns src/ into public/

Each folder only imports from the ones listed above it. To add a page, make a new file in `src/pages/` and call it from `build.js`.

## Deploying

`public/` is committed, so you can deploy it as is. Any static host works:

- **Netlify / Vercel / Cloudflare Pages:** root directory `website`, build command `npm run build`, output directory `public`.
- **GitHub Pages:** publish the `website/public` folder.
- **Anything else:** upload the contents of `public/`.
