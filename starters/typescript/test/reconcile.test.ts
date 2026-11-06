import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transaction } from "../src/models.js";
import { compare, findingsFor } from "../src/findings.js";
import { reconcileDay, type Rows } from "../src/reconcile.js";
import {
  carriedRows,
  emptyState,
  loadState,
  matchedBefore,
  openBefore,
  recordDay,
  saveState,
  type State,
} from "../src/state.js";

function tx(
  source: Transaction["source"],
  id: string | null,
  second = 0,
  amountCents = 1000,
): Transaction {
  return {
    source,
    id,
    ref: id ?? `${source}-${second}`,
    amountCents,
    timestamp: new Date(Date.UTC(2026, 2, 1, 12, 0, second)),
    merchant: source === "provider" ? "AMZN" : "Amazon",
  };
}
const none: Rows = { provider: [], ledger: [] };

/** One run of the tool for `date`, as the CLI does it. */
function runDay(state: State, date: string, today: Rows) {
  const result = reconcileDay(today, carriedRows(state, date), matchedBefore(state, date));
  const changes = compare(openBefore(state, date), findingsFor(result));
  return { result, changes, state: recordDay(state, date, result, changes.open) };
}

test("a row unmatched on day 1 is matched when its counterpart arrives on day 2", () => {
  const day1 = runDay(emptyState(), "2026-03-01", { provider: [tx("provider", "a")], ledger: [] });
  assert.equal(day1.result.providerOnly.length, 1);
  const day2 = runDay(day1.state, "2026-03-02", { provider: [], ledger: [tx("ledger", "a")] });
  assert.equal(day2.result.matched.length, 1);
  assert.equal(day2.result.providerOnly.length + day2.result.ledgerOnly.length, 0);
  assert.equal(day2.changes.resolved.length, 1);
  assert.equal(day2.changes.new.length, 0);
});

test("a row matched on day 1 and exported again on day 2 is not reported again", () => {
  const p = tx("provider", "a");
  const day1 = runDay(emptyState(), "2026-03-01", { provider: [p], ledger: [tx("ledger", "a")] });
  assert.equal(day1.result.matched.length, 1);
  const day2 = runDay(day1.state, "2026-03-02", { provider: [{ ...p }], ledger: [] });
  assert.deepEqual(day2.result, { matched: [], providerOnly: [], ledgerOnly: [], ambiguous: [] });
});

test("an unmatched row without an id, exported on both days, is counted once", () => {
  const row = { ...tx("provider", null), ref: "provider-2026-03-01.jsonl:9" };
  const reexport = { ...row, ref: "provider-2026-03-02.jsonl:1" };
  const day1 = runDay(emptyState(), "2026-03-01", { provider: [row], ledger: [] });
  const day2 = runDay(day1.state, "2026-03-02", { provider: [reexport], ledger: [] });
  assert.equal(day2.result.providerOnly.length, 1);
});

test("two real captures of the same id seconds apart are kept apart", () => {
  const r = reconcileDay(
    { provider: [tx("provider", "a", 0), tx("provider", "a", 4)], ledger: [tx("ledger", "a", 50)] },
    none,
  );
  assert.equal(r.ambiguous.length, 1);
});

test("re-running a date gives the same result and the same state", () => {
  const day1 = runDay(emptyState(), "2026-03-01", { provider: [tx("provider", "a")], ledger: [] });
  const today = { provider: [tx("provider", "b")], ledger: [tx("ledger", "a")] };
  const once = runDay(day1.state, "2026-03-02", today);
  const twice = runDay(once.state, "2026-03-02", today);
  assert.deepEqual(twice, once);
});

test("state survives a save and load, including timestamps", () => {
  const path = join(mkdtempSync(join(tmpdir(), "recon-")), "nested", "state.json");
  const { state } = runDay(emptyState(), "2026-03-01", {
    provider: [tx("provider", "a", 7)],
    ledger: [],
  });
  saveState(path, state);
  const row = carriedRows(loadState(path), "2026-03-02").provider[0];
  assert.equal(row.timestamp.toISOString(), "2026-03-01T12:00:07.000Z");
});

test("only the latest earlier run is carried forward", () => {
  const day1 = runDay(emptyState(), "2026-03-01", { provider: [tx("provider", "a")], ledger: [] });
  const day2 = runDay(day1.state, "2026-03-02", { provider: [], ledger: [tx("ledger", "a")] });
  assert.deepEqual(carriedRows(day2.state, "2026-03-03"), none);
});
