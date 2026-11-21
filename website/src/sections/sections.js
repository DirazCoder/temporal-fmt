// The page sections, top to bottom: header, hero, examples, features, and so on.
import { logo, button, badge, eyebrow } from '../components/ui.js';
import { installCommand, featureCard, exampleCard, subpathRow, navLink } from '../components/cards.js';

export const GITHUB = 'https://github.com/DirazCoder/temporal-fmt';
export const NPM = 'https://www.npmjs.com/package/temporal-fmt';

export const siteHeader = () =>
  `<header class="header">
    ${logo()}
    <nav class="nav" aria-label="Main">
      ${navLink({ href: '#examples', label: 'Examples' })}
      ${navLink({ href: '#features', label: 'Features' })}
      ${navLink({ href: '#subpaths', label: 'Imports' })}
      ${navLink({ href: GITHUB, label: 'GitHub' })}
    </nav>
  </header>`;

export const hero = () =>
  `<section class="hero" id="top">
    <h1>Format and parse <em>Temporal</em> with the tokens you already know.</h1>
    <p class="hero__lede">yyyy-MM-dd in, string out. Bad input throws instead of quietly handing you garbage. Locale-aware, zero dependencies.</p>
    ${installCommand('npm install temporal-fmt')}
    <div class="hero__actions">
      ${button({ href: '#examples', label: 'See it in action' })}
      ${button({ href: GITHUB, label: 'View on GitHub', variant: 'ghost' })}
    </div>
    <p class="hero__badges">${badge('100% test coverage')} ${badge('0 dependencies')} ${badge('Node 20+')}</p>
  </section>`;

export const why = () =>
  `<section class="section section--narrow">
    <h2 class="section__title">Why this exists</h2>
    <p class="prose">Node 26 shipped <code>Temporal</code> without a string formatter. TC39's answer is to use <code>Intl.DateTimeFormat</code> and let userland handle token-style formatting. Fair enough. But if <code>yyyy-MM-dd</code> is muscle memory, you still want that, so this is that userland.</p>
  </section>`;

const examples = [
  {
    label: 'Format',
    code: `import { format } from 'temporal-fmt/format';

const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
format(dt, "MMM d, yyyy 'at' h:mm a");`,
    result: '"Aug 4, 2026 at 3:45 PM"',
  },
  {
    label: 'Parse',
    code: `import { parse } from 'temporal-fmt/parse';

parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45');`,
    result: 'Temporal.PlainDateTime',
  },
  {
    label: 'It throws',
    code: `const date = Temporal.PlainDate.from('2026-08-04');

// a date has no hours, so this can't work
format(date, 'HH:mm');`,
    result: 'an error that tells you what went wrong, not "undefined"',
  },
  {
    label: 'Relative time',
    code: `import { formatDistance } from 'temporal-fmt';

const today = Temporal.PlainDate.from('2026-08-04');
formatDistance(today, today.add({ days: 2 }), { locale: 'fr-FR' });`,
    result: '"dans 2 jours"',
  },
  {
    label: 'Natural language',
    code: `import { parseRelative } from 'temporal-fmt';

parseRelative('next Tuesday', today);`,
    result: 'Temporal.PlainDate',
  },
  {
    label: 'Recurrence',
    code: `import { recurrence, take } from 'temporal-fmt';

const start = Temporal.PlainDate.from('2026-08-04');
const rule = { freq: 'weekly', interval: 1, count: 10 };
take(recurrence(start, rule), 5);`,
    result: 'the next five occurrences',
  },
];

export const examplesSection = () =>
  `<section class="section" id="examples">
    ${eyebrow('Examples')}
    <h2 class="section__title">What it looks like</h2>
    <div class="grid grid--examples">${examples.map(exampleCard).join('')}</div>
  </section>`;

const features = [
  { title: 'Strict, not forgiving', body: 'A token the input type can\'t support, input that doesn\'t match, an ambiguous date: all of it throws a typed error. A lenient mode exists for when you want it.' },
  { title: 'Locale-aware', body: 'Month names, relative time and natural-language parsing work across languages. Register your own vocabulary if yours isn\'t covered.' },
  { title: 'No dependencies', body: 'Nothing to audit, nothing that breaks on you in a transitive update.' },
  { title: 'Only ship what you import', body: 'Subpath imports and <code>sideEffects: false</code>. Importing just <code>format</code> is roughly 27 KB, against roughly 68 KB for the bare import.' },
  { title: 'More than format and parse', body: 'Durations, intervals, recurrence with RRULE, business calendars and holidays, time zone disambiguation, and a format-string analyzer.' },
  { title: 'Tested hard', body: '100% coverage, plus fuzz, adversarial and conformance suites. A small thing that tells you the truth about dates should be boring to depend on.' },
];

export const featuresSection = () =>
  `<section class="section" id="features">
    ${eyebrow('Features')}
    <h2 class="section__title">Small API, deep bench</h2>
    <div class="grid grid--features">${features.map(featureCard).join('')}</div>
  </section>`;

const subpaths = [
  { path: 'format', note: 'format, formatToParts, compileFormat' },
  { path: 'parse', note: 'parse, strict by default' },
  { path: 'duration', note: 'formatDuration and friends' },
  { path: 'relative', note: 'formatRelative, "in 3 days"' },
  { path: 'interval', note: 'intervals and formatRange' },
  { path: 'calendar', note: 'daysInMonth, startOf, calendar helpers' },
  { path: 'timezone', note: 'DST-aware resolution, resolveZoned, isDST' },
  { path: 'recurrence', note: 'recurrence rules, RRULE in and out' },
  { path: 'locale', note: 'registerLocale for your own languages' },
];

export const subpathsSection = () =>
  `<section class="section section--narrow" id="subpaths">
    ${eyebrow('Imports')}
    <h2 class="section__title">Pull in only what you need</h2>
    <ul class="subpaths">${subpaths.map(subpathRow).join('')}</ul>
    <p class="note">Arithmetic, comparison, rounding, business calendars, holidays, serialization and the analyzer live in the main <code>temporal-fmt</code> import.</p>
  </section>`;

export const migrate = () =>
  `<section class="section section--narrow migrate">
    <h2 class="section__title">Coming from date-fns or Day.js?</h2>
    <p class="prose">The tokens are the ones you already type. The README has a token and API mapping, and an honest list of what will bite you on the way over.</p>
    ${button({ href: `${GITHUB}#migrating-from-dayjs-or-date-fns`, label: 'Read the migration guide', variant: 'ghost' })}
  </section>`;

export const siteFooter = ({ version }) =>
  `<footer class="footer">
    <span>temporal-fmt${version ? ` v${version}` : ''} &middot; Apache-2.0</span>
    <span class="footer__links">
      ${navLink({ href: GITHUB, label: 'GitHub' })}
      ${navLink({ href: NPM, label: 'npm' })}
      ${navLink({ href: `${GITHUB}/issues`, label: 'Issues' })}
    </span>
  </footer>`;
