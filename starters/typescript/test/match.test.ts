import { test } from "node:test";
import assert from "node:assert/strict";
import type { Transaction } from "../src/models.js";
import { matchById } from "../src/match.js";

let n = 0;
function tx(source: Transaction["source"], id: string | null, amountCents = 1000): Transaction {
  return {
    source,
    id,
    ref: id ?? `${source}-${n++}`,
    amountCents,
    timestamp: new Date("2026-03-01T12:00:00Z"),
    merchant: "X",
  };
}

test("matches rows that share an id", () => {
  const p = tx("provider", "a");
  const l = tx("ledger", "a");
  const r = matchById([p], [l]);
  assert.deepEqual(r.matched, [{ provider: p, ledger: l }]);
  assert.equal(r.providerOnly.length + r.ledgerOnly.length + r.ambiguous.length, 0);
});

test("a matched pair with different amounts is still a match", () => {
  const r = matchById([tx("provider", "a", 1000)], [tx("ledger", "a", 1035)]);
  assert.equal(r.matched.length, 1);
});

test("a repeated id is ambiguous and not matched", () => {
  const p1 = tx("provider", "a");
  const p2 = tx("provider", "a");
  const l = tx("ledger", "a");
  const r = matchById([p1, p2], [l]);
  assert.equal(r.matched.length, 0);
  assert.deepEqual(r.ambiguous, [{ id: "a", provider: [p1, p2], ledger: [l] }]);
});

test("a repeated ledger id is ambiguous, with or without a provider row", () => {
  const p = tx("provider", "a");
  const la1 = tx("ledger", "a");
  const la2 = tx("ledger", "a");
  const lb1 = tx("ledger", "b");
  const lb2 = tx("ledger", "b");
  const r = matchById([p], [la1, la2, lb1, lb2]);
  assert.deepEqual(r.ambiguous, [
    { id: "a", provider: [p], ledger: [la1, la2] },
    { id: "b", provider: [], ledger: [lb1, lb2] },
  ]);
  assert.equal(r.matched.length + r.providerOnly.length + r.ledgerOnly.length, 0);
});

test("empty inputs give empty results", () => {
  assert.deepEqual(matchById([], []), {
    matched: [],
    providerOnly: [],
    ledgerOnly: [],
    ambiguous: [],
    noId: { provider: [], ledger: [] },
  });
});

test("a mixed batch puts every row in exactly one bucket", () => {
  const provider = [
    tx("provider", "a"),
    tx("provider", null),
    tx("provider", "b"),
    tx("provider", "d"),
    tx("provider", "d"),
  ];
  const ledger = [tx("ledger", null), tx("ledger", "a"), tx("ledger", "c"), tx("ledger", null)];
  const before = JSON.stringify([provider, ledger]);
  const r = matchById(provider, ledger);
  assert.equal(JSON.stringify([provider, ledger]), before, "inputs unchanged");
  assert.equal(r.matched.length, 1);
  assert.deepEqual(r.providerOnly, [provider[2]]);
  assert.deepEqual(r.ledgerOnly, [ledger[2]]);
  assert.deepEqual(r.ambiguous, [{ id: "d", provider: [provider[3], provider[4]], ledger: [] }]);
  assert.deepEqual(r.noId, { provider: [provider[1]], ledger: [ledger[0], ledger[3]] });
  const seen = [
    ...r.matched.flatMap((m) => [m.provider, m.ledger]),
    ...r.providerOnly,
    ...r.ledgerOnly,
    ...r.ambiguous.flatMap((a) => [...a.provider, ...a.ledger]),
    ...r.noId.provider,
    ...r.noId.ledger,
  ];
  assert.equal(seen.length, provider.length + ledger.length);
  assert.equal(new Set(seen).size, seen.length);
});
