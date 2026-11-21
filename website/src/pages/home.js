// The home page: the layout filled with the sections.
import { baseLayout } from '../layout/layout.js';
import { siteHeader, hero, why, examplesSection, featuresSection, subpathsSection, migrate, siteFooter } from '../sections/sections.js';

export default ({ version }) =>
  baseLayout({
    title: 'temporal-fmt: format and parse Temporal with date-fns-style tokens',
    description: 'Format and parse Temporal values with the tokens you already know. Strict, locale-aware, zero dependencies.',
    header: siteHeader(),
    main: [hero(), why(), examplesSection(), featuresSection(), subpathsSection(), migrate()].join('\n'),
    footer: siteFooter({ version }),
  });
