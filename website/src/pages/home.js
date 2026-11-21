// The home page: the layout filled with the docs sections.
import { baseLayout } from '../layout/layout.js';
import { docs, noResults } from '../sections/sections.js';

export default ({ version, readme }) =>
  baseLayout({
    title: 'temporal-fmt: format and parse Temporal with date-fns-style tokens',
    description: 'Format and parse Temporal values with the tokens you already know. Strict, locale-aware, zero dependencies.',
    main: [docs(), noResults()].join('\n'),
    version,
    readme,
  });
