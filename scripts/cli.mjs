#!/usr/bin/env node
// temporal-fmt CLI (plan section AD). Subcommands: format, parse, inspect,
// validate, translate. Reads from stdin or args, writes to stdout.
//
// Run with: temporal-fmt <subcommand> [options] <args>
//   temporal-fmt format "2026-08-04" "yyyy-MM-dd"
//   temporal-fmt parse "yyyy-MM-dd" "2026-08-04"
//   temporal-fmt inspect "yyyy-MM-dd HH:mm"
//   temporal-fmt validate "yyyy-MM-dd"
//   temporal-fmt translate dayjs "YYYY-MM-DD"

import { format, parse, explainFormat, isValidFormat, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const USAGE = `temporal-fmt CLI

Usage:
  temporal-fmt format <iso-input> <format-string> [--locale=LOCALE]
  temporal-fmt parse <format-string> <input> [--locale=LOCALE] [--lenient]
  temporal-fmt inspect <format-string>
  temporal-fmt validate <format-string>
  temporal-fmt translate <source-lib> <format-string>

Subcommands:
  format     Format an ISO date/time input using the given format string.
  parse      Parse an input against a format string, output the resulting ISO.
  inspect    Print analyzeFormat's report on a format string.
  validate   Return "valid" or "invalid" for a format string.
  translate  Translate a Day.js or date-fns format string to temporal-fmt.

Options:
  --locale=LOCALE   BCP-47 locale tag (default: en-US).
  --lenient         Enable lenient parse mode.

Examples:
  temporal-fmt format "2026-08-04T15:45:30" "yyyy-MM-dd HH:mm:ss"
  temporal-fmt parse "yyyy-MM-dd" "2026-08-04"
  temporal-fmt inspect "MMMM d, yyyy 'at' h:mm a"
  temporal-fmt validate "yyyy-MM-dd HH:mm:ss"
  temporal-fmt translate dayjs "YYYY-MM-DD HH:mm:ss"
`;

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    process.stderr.write(USAGE);
    process.exit(1);
  }
  const subcommand = args[0];
  const positional = [];
  const options = {};
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) {
        options[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        options[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { subcommand, positional, options };
}

async function main() {
  const { subcommand, positional, options } = parseArgs(process.argv);
  const locale = typeof options.locale === 'string' ? options.locale : 'en-US';

  switch (subcommand) {
    case 'format': {
      if (positional.length < 2) {
        process.stderr.write('Usage: temporal-fmt format <iso-input> <format-string> [--locale=LOCALE]\n');
        process.exit(1);
      }
      const [isoInput, formatStr] = positional;
      let temporal;
      try {
        if (/T.*[zZ]|[+-]\d{2}:?\d{2}$/.test(isoInput)) {
          temporal = Temporal.Instant.from(isoInput.endsWith('Z') ? isoInput : isoInput + 'Z');
        } else if (/T/.test(isoInput)) {
          temporal = Temporal.PlainDateTime.from(isoInput);
        } else {
          temporal = Temporal.PlainDate.from(isoInput);
        }
      } catch (err) {
        process.stderr.write(`Error: could not parse "${isoInput}" as a Temporal value: ${err.message}\n`);
        process.exit(1);
      }
      try {
        const out = format(temporal, formatStr, { locale });
        process.stdout.write(out + '\n');
      } catch (err) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
      break;
    }
    case 'parse': {
      if (positional.length < 2) {
        process.stderr.write('Usage: temporal-fmt parse <format-string> <input> [--locale=LOCALE] [--lenient]\n');
        process.exit(1);
      }
      const [formatStr, input] = positional;
      try {
        const result = parse(formatStr, input, { locale, lenient: options.lenient === true });
        process.stdout.write(result.toString() + '\n');
      } catch (err) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
      break;
    }
    case 'inspect': {
      if (positional.length < 1) {
        process.stderr.write('Usage: temporal-fmt inspect <format-string>\n');
        process.exit(1);
      }
      const [formatStr] = positional;
      try {
        process.stdout.write(explainFormat(formatStr) + '\n');
      } catch (err) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
      break;
    }
    case 'validate': {
      if (positional.length < 1) {
        process.stderr.write('Usage: temporal-fmt validate <format-string>\n');
        process.exit(1);
      }
      const [formatStr] = positional;
      const valid = isValidFormat(formatStr);
      process.stdout.write(valid ? 'valid\n' : 'invalid\n');
      break;
    }
    case 'translate': {
      if (positional.length < 2) {
        process.stderr.write('Usage: temporal-fmt translate <source-lib> <format-string>\n');
        process.exit(1);
      }
      const [sourceLib, formatStr] = positional;
      let translated;
      try {
        if (sourceLib === 'dayjs') {
          const { translateDayjsFormatString } = await import('temporal-fmt-codemod');
          translated = translateDayjsFormatString(formatStr);
        } else if (sourceLib === 'date-fns' || sourceLib === 'datefns') {
          const { translateDateFnsFormatString } = await import('temporal-fmt-codemod');
          translated = translateDateFnsFormatString(formatStr);
        } else {
          process.stderr.write(`Error: unknown source library "${sourceLib}". Supported: dayjs, date-fns.\n`);
          process.exit(1);
        }
        process.stdout.write(translated + '\n');
      } catch (err) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
      break;
    }
    case '--help':
    case '-h':
    case 'help':
      process.stdout.write(USAGE);
      break;
    default:
      process.stderr.write(`Unknown subcommand "${subcommand}". Run --help for usage.\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
