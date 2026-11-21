#!/usr/bin/env node
// Usage: node benchmarks/run.mjs [--suite format|parse|arithmetic|distance|serialization|all]
// Runs tinybench suites and prints a human-readable table.
// All suites default to 500ms warmup + 1000ms measurement per task.

import { Bench } from 'tinybench';
import { setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const arg = process.argv.find((a) => a.startsWith('--suite='))?.split('=')[1] ?? 'all';

const suites = {
  format:        () => import('./suites/format.mjs'),
  parse:         () => import('./suites/parse.mjs'),
  arithmetic:    () => import('./suites/arithmetic.mjs'),
  distance:      () => import('./suites/distance.mjs'),
  serialization: () => import('./suites/serialization.mjs'),
  comparison:    () => import('./suites/comparison.mjs'),
  rounding:      () => import('./suites/rounding.mjs'),
};

const toRun = arg === 'all' ? Object.keys(suites) : arg.split(',').filter((s) => s in suites);

if (toRun.length === 0) {
  console.error(`Unknown suite(s): ${arg}. Available: ${Object.keys(suites).join(', ')}, all`);
  process.exit(1);
}

function col(str, width) {
  return String(str).padEnd(width);
}

function fmtOps(hz) {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M ops/s`;
  if (hz >= 1_000)     return `${(hz / 1_000).toFixed(1)}K ops/s`;
  return `${hz.toFixed(0)} ops/s`;
}

function fmtNs(ms) {
  const ns = ms * 1e6;
  if (ns >= 1_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
  if (ns >= 1_000)     return `${(ns / 1_000).toFixed(2)} µs`;
  return `${ns.toFixed(1)} ns`;
}

function printTable(suiteName, bench) {
  console.log(`\n${suiteName}`);
  const header = [col('task', 42), col('ops/s', 14), col('mean', 10), col('p99', 10), col('±rme', 8)];
  console.log(header.join('  '));
  console.log('-'.repeat(90));

  for (const task of bench.tasks) {
    const r = task.result;
    if (!r || r.state !== 'completed') continue;
    const row = [
      col(task.name, 42),
      col(fmtOps(r.throughput.mean), 14),
      col(fmtNs(r.latency.mean), 10),
      col(fmtNs(r.latency.p99), 10),
      col(`±${r.latency.rme.toFixed(1)}%`, 8),
    ];
    console.log(row.join('  '));
  }
}

for (const name of toRun) {
  const { default: buildSuite } = await suites[name]();
  const bench = await buildSuite(Temporal, Bench);
  await bench.run();
  printTable(name, bench);
}
