/** State between runs, per date: unmatched rows and keys of matched rows. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Finding } from "./findings.js";
import type { Transaction } from "./models.js";
import { rowKey, unmatchedRows, type DayResult, type Rows } from "./reconcile.js";

type StoredTransaction = Omit<Transaction, "timestamp"> & { timestamp: string };

export interface State {
  days: Record<
    string,
    {
      /** unmatched, carried to the next date */
      provider: StoredTransaction[];
      ledger: StoredTransaction[];
      /** matched row keys, to skip re-exports */
      matched: string[];
      /** findings still open after the run; missing in state files written before findings existed */
      open?: Finding[];
    }
  >;
}

export const emptyState = (): State => ({ days: {} });

const toStored = (t: Transaction): StoredTransaction => ({
  ...t,
  timestamp: t.timestamp.toISOString(),
});
const fromStored = (t: StoredTransaction): Transaction => ({
  ...t,
  timestamp: new Date(t.timestamp),
});

export function loadState(path: string): State {
  if (!existsSync(path)) return emptyState();
  return JSON.parse(readFileSync(path, "utf-8")) as State;
}

/** Temp file + rename, so a crash can't leave a half-written file. */
export function saveState(path: string, state: State): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, path);
}

const latestBefore = (state: State, date: string) =>
  Object.keys(state.days)
    .filter((d) => d < date)
    .sort()
    .at(-1);

/** Unmatched rows from the latest run before `date`. */
export function carriedRows(state: State, date: string): Rows {
  const previous = latestBefore(state, date);
  if (!previous) return { provider: [], ledger: [] };
  const day = state.days[previous];
  return { provider: day.provider.map(fromStored), ledger: day.ledger.map(fromStored) };
}

/** Findings still open after the latest run before `date`. */
export function openBefore(state: State, date: string): Finding[] {
  const previous = latestBefore(state, date);
  return previous ? (state.days[previous].open ?? []) : [];
}

/** Keys of rows matched before `date`. */
export function matchedBefore(state: State, date: string): Set<string> {
  return new Set(
    Object.entries(state.days)
      .filter(([d]) => d < date)
      .flatMap(([, day]) => day.matched ?? []),
  );
}

/** Replaces any earlier record for `date`, so re-runs don't duplicate. */
export function recordDay(state: State, date: string, result: DayResult, open: Finding[]): State {
  const unmatched = unmatchedRows(result);
  return {
    days: {
      ...state.days,
      [date]: {
        provider: unmatched.provider.map(toStored),
        ledger: unmatched.ledger.map(toStored),
        matched: result.matched.flatMap((m) => [rowKey(m.provider), rowKey(m.ledger)]),
        open,
      },
    },
  };
}
