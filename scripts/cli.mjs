#!/usr/bin/env node
// temporal-fmt CLI. Subcommands: format, parse, inspect,
// validate, translate. Two modes:
//   - one-shot: `temporal-fmt <subcommand> [args...]` runs once and exits,
//     same as always — this is what scripts and CI should use.
//   - interactive: running `temporal-fmt` with no arguments drops into a
//     REPL that prompts for a subcommand, then prompts for whichever of
//     that subcommand's arguments weren't given inline, and loops until
//     you type `exit`/`quit` or hit Ctrl+D.
//
// Run with: temporal-fmt <subcommand> [options] <args>
//   temporal-fmt format "2026-08-04" "yyyy-MM-dd"
//   temporal-fmt parse "yyyy-MM-dd" "2026-08-04"
//   temporal-fmt inspect "yyyy-MM-dd HH:mm"
//   temporal-fmt validate "yyyy-MM-dd"
//   temporal-fmt translate dayjs "YYYY-MM-DD"

import { createInterface } from 'node:readline/promises';
import {
  format, parse, explainFormat, isValidFormat, setTemporal,
  translateDayjsFormatString, translateDateFnsFormatString,
} from '../dist/index.js';

// Native Temporal (Node 26+) needs no extra install; older Node falls
// back to the polyfill, imported lazily so a Node 26+ user running this
// CLI never pays for loading it.
const Temporal = globalThis.Temporal ?? (await import('temporal-polyfill/full')).Temporal;
setTemporal(Temporal);

const USAGE = `temporal-fmt CLI

Usage:
  temporal-fmt                                     Start the interactive REPL.
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

Running temporal-fmt with no arguments starts an interactive session where
each subcommand prompts you for whatever arguments you don't supply.
`;

// Turns an ISO-ish string into the right Temporal type. format() only
// accepts types with calendar fields (PlainDate/PlainTime/PlainDateTime/
// ZonedDateTime) — a bare Instant has none, so a "Z"-suffixed input
// becomes a UTC ZonedDateTime rather than an Instant. A numeric offset
// alone (e.g. "+02:00") isn't a timezone either; Temporal.PlainDateTime
// .from() is what actually accepts that shape, silently keeping the
// wall-clock fields and dropping the offset annotation — which matches
// what someone typing an offset into this CLI almost always wants:
// format the date/time as written, not convert it to a UTC instant.
function parseIsoInput(isoInput) {
  if (/T.*[zZ]$/.test(isoInput)) {
    return Temporal.Instant.from(isoInput).toZonedDateTimeISO('UTC');
  }
  if (/T/.test(isoInput)) {
    return Temporal.PlainDateTime.from(isoInput);
  }
  return Temporal.PlainDate.from(isoInput);
}

// Matches the "+HH:MM"/"-HH:MM" offset suffix that parseIsoInput's
// PlainDateTime.from() branch silently discards. Used only to make the
// resulting "no offset field" format() error more specific — see below.
const HAS_NUMERIC_OFFSET = /T.*[+-]\d{2}:\d{2}$/;

// Each command takes { positional, options } and either returns the
// output string or throws. Kept free of process.exit/stdout writes so
// both one-shot mode and the REPL can call the same logic and just
// handle success/failure differently.
const COMMANDS = {
  format: {
    usage: 'format <iso-input> <format-string> [--locale=LOCALE]',
    argNames: ['iso-input', 'format-string'],
    run({ positional, options }) {
      const [isoInput, formatStr] = positional;
      const locale = typeof options.locale === 'string' ? options.locale : 'en-US';
      let temporal;
      try {
        temporal = parseIsoInput(isoInput);
      } catch (err) {
        throw new Error(`could not parse "${isoInput}" as a Temporal value: ${err.message}`);
      }
      try {
        return format(temporal, formatStr, { locale });
      } catch (err) {
        // parseIsoInput deliberately drops a numeric offset (e.g. "+02:00")
        // when it's not "Z" — see the comment there — so any offset token
        // (X/XX/XXX/x/xx/xxx) fails with a generic "doesn't have this
        // field" error that gives no hint the offset was ever present.
        // Recognize that specific case and say so, without changing what
        // parseIsoInput actually does.
        if (/requires "offset"/.test(err.message) && HAS_NUMERIC_OFFSET.test(isoInput)) {
          throw new Error(
            `${err.message} "${isoInput}" has a numeric offset, but temporal-fmt drops it during parsing ` +
            `and keeps only the wall-clock date/time (see --help). Offset-formatting tokens only work on ` +
            `a "Z"-suffixed input.`
          );
        }
        throw err;
      }
    },
  },
  parse: {
    usage: 'parse <format-string> <input> [--locale=LOCALE] [--lenient]',
    argNames: ['format-string', 'input'],
    run({ positional, options }) {
      const [formatStr, input] = positional;
      const locale = typeof options.locale === 'string' ? options.locale : 'en-US';
      const result = parse(formatStr, input, { locale, lenient: options.lenient === true });
      return result.toString();
    },
  },
  inspect: {
    usage: 'inspect <format-string>',
    argNames: ['format-string'],
    run({ positional }) {
      const [formatStr] = positional;
      return explainFormat(formatStr);
    },
  },
  validate: {
    usage: 'validate <format-string>',
    argNames: ['format-string'],
    run({ positional }) {
      const [formatStr] = positional;
      return isValidFormat(formatStr) ? 'valid' : 'invalid';
    },
  },
  translate: {
    usage: 'translate <source-lib> <format-string>',
    argNames: ['source-lib', 'format-string'],
    run({ positional }) {
      const [sourceLib, formatStr] = positional;
      if (sourceLib === 'dayjs') return translateDayjsFormatString(formatStr);
      if (sourceLib === 'date-fns' || sourceLib === 'datefns') return translateDateFnsFormatString(formatStr);
      throw new Error(`unknown source library "${sourceLib}". Supported: dayjs, date-fns.`);
    },
  },
};

function parseArgs(args) {
  const positional = [];
  const options = {};
  for (const a of args) {
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
  return { positional, options };
}

function runOneShot(argv) {
  const args = argv.slice(2);
  const subcommand = args[0];

  if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    process.stdout.write(USAGE);
    return;
  }

  const command = COMMANDS[subcommand];
  if (!command) {
    process.stderr.write(`Unknown subcommand "${subcommand}". Run --help for usage.\n`);
    process.exit(1);
  }

  const parsed = parseArgs(args.slice(1));
  if (parsed.positional.length < command.argNames.length) {
    process.stderr.write(`Usage: temporal-fmt ${command.usage}\n`);
    process.exit(1);
  }

  try {
    process.stdout.write(command.run(parsed) + '\n');
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

async function runRepl() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write('temporal-fmt interactive mode. Type a subcommand, "help", or "exit".\n');

  // rl.question() called repeatedly loses track of buffered input across
  // awaits on some Node versions (readline/node#*, long-standing issue
  // with the promises API under non-interactive or fast-piped stdin).
  // Driving the whole session off one async iterator over lines sidesteps
  // that entirely — each ask() just pulls the next line and only ever
  // touches the iterator, never rl.question().
  const lines = rl[Symbol.asyncIterator]();
  async function ask(prompt) {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) return null;
    return value.trim();
  }

  try {
    while (true) {
      const line = await ask('temporal-fmt> ');
      if (line === null) break;
      if (line === '') continue;
      if (line === 'exit' || line === 'quit') break;
      if (line === 'help' || line === '--help' || line === '-h') {
        process.stdout.write(USAGE);
        continue;
      }

      // Support both "format" (prompts for every arg) and
      // "format 2026-08-04 yyyy-MM-dd" (prompts only for what's missing),
      // so muscle memory from one-shot usage still works inside the REPL.
      const [subcommand, ...rest] = line.split(/\s+/);
      const command = COMMANDS[subcommand];
      if (!command) {
        process.stdout.write(`Unknown subcommand "${subcommand}". Type "help" for the list.\n`);
        continue;
      }

      const typed = parseArgs(rest);
      if (command.argNames.length > typed.positional.length) {
        let aborted = false;
        for (const name of command.argNames.slice(typed.positional.length)) {
          const value = await ask(`  ${name}: `);
          if (value === null) { aborted = true; break; }
          typed.positional.push(value);
        }
        if (aborted) break;
      }

      try {
        process.stdout.write(command.run(typed) + '\n');
      } catch (err) {
        process.stdout.write(`Error: ${err.message}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

// A downstream pipe closing early (e.g. `temporal-fmt | head -1`) makes
// the next stdout write throw EPIPE. That's expected shell behavior,
// not a real error — exit quietly instead of dumping a stack trace.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

async function main() {
  if (process.argv.length > 2) {
    runOneShot(process.argv);
  } else {
    await runRepl();
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
