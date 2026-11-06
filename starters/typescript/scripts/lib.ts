/** Shared helpers for the data-exploration scripts. Not part of the tool. */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Transaction } from "../src/models.js";
import { isoSeconds } from "../src/normalize.js";
import { loadDay } from "../src/readers.js";

export const DATA_DIR = resolve(fileURLToPath(import.meta.url), "../../../../data");

export interface Day {
  date: string;
  provider: Transaction[];
  ledger: Transaction[];
}

/** Every date that has an export in data/, oldest first, with both files loaded. */
export function loadAllDays(): Day[] {
  const dates = new Set<string>();
  for (const file of readdirSync(DATA_DIR)) {
    const date = file.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (date) dates.add(date);
  }
  return [...dates].sort().map((date) => ({ date, ...loadDay(DATA_DIR, date) }));
}

export const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export const heading = (title: string) => console.log(`\n=== ${title} ===`);

/** One row per line, padded so columns line up. */
export function formatRow(t: Transaction, withSource = false): string {
  const parts = [
    t.ref.padEnd(30),
    `id=${(t.id ?? "-").padEnd(16)}`,
    eur(t.amountCents).padStart(9),
    isoSeconds(t.timestamp),
    t.merchant,
  ];
  if (withSource) parts.unshift(t.source.padEnd(8));
  return parts.join(" ");
}

export function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const group = groups.get(k);
    if (group) group.push(x);
    else groups.set(k, [x]);
  }
  return groups;
}

/** Rows that carry a transaction id, keyed by it. If an id repeats, the last row wins. */
export function byId(xs: Transaction[]): Map<string, Transaction> {
  return new Map(xs.filter((x) => x.id).map((x) => [x.id!, x]));
}

/** Seconds from the provider capture to the ledger booking. Positive means the ledger is later. */
export const lagSeconds = (provider: Transaction, ledger: Transaction) =>
  (ledger.timestamp.getTime() - provider.timestamp.getTime()) / 1000;

/** Same amount, and the ledger booked between 0 and maxLagSeconds after the provider capture. */
export const couldPair = (provider: Transaction, ledger: Transaction, maxLagSeconds: number) =>
  provider.amountCents === ledger.amountCents &&
  lagSeconds(provider, ledger) >= 0 &&
  lagSeconds(provider, ledger) <= maxLagSeconds;

/** Value at the given percentile of an already sorted list. */
export const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

/** "a=3 b=1" from a groupBy result. */
export const summarizeCounts = <T>(groups: Map<string, T[]>) =>
  [...groups].map(([k, v]) => `${k}=${v.length}`).join(" ");
