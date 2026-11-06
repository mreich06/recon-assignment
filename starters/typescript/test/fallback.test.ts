import { test } from "node:test";
import assert from "node:assert/strict";
import type { Transaction } from "../src/models.js";
import { learnMerchantMap, matchFallback } from "../src/fallback.js";

const MERCHANTS = new Map([["AMZN", "Amazon"]]);

function tx(
  source: Transaction["source"],
  amountCents: number,
  second: number,
  merchant = source === "provider" ? "AMZN" : "Amazon",
): Transaction {
  return {
    source,
    id: null,
    ref: `${source}-${amountCents}-${second}`,
    amountCents,
    timestamp: new Date(Date.UTC(2026, 2, 1, 12, 0, second)),
    merchant,
  };
}

test("pairs one provider row with one ledger row", () => {
  const p = tx("provider", 2674, 0);
  const l = tx("ledger", 2674, 114);
  const r = matchFallback([p], [l], MERCHANTS);
  assert.deepEqual(r.matched, [{ provider: p, ledger: l }]);
  assert.equal(r.ambiguous.length + r.providerOnly.length + r.ledgerOnly.length, 0);
});

test("two ledger candidates for one provider row are flagged, not guessed", () => {
  const p = tx("provider", 24900, 0);
  const l1 = tx("ledger", 24900, 25);
  const l2 = tx("ledger", 24900, 115);
  const r = matchFallback([p], [l1, l2], MERCHANTS);
  assert.equal(r.matched.length, 0);
  assert.deepEqual(r.ambiguous, [{ provider: [p], ledger: [l1, l2] }]);
});

test("two provider rows sharing one ledger candidate are flagged", () => {
  const p1 = tx("provider", 1000, 0);
  const p2 = tx("provider", 1000, 10);
  const l = tx("ledger", 1000, 60);
  const r = matchFallback([p1, p2], [l], MERCHANTS);
  assert.equal(r.matched.length, 0);
  assert.deepEqual(r.ambiguous, [{ provider: [p1, p2], ledger: [l] }]);
});

test("no match when amount, merchant or timing differ, or the descriptor is unknown", () => {
  const p = tx("provider", 1000, 0);
  const unknown = tx("provider", 2000, 0, "NEW SHOP");
  const wrongAmount = tx("ledger", 1001, 30);
  const wrongMerchant = tx("ledger", 1000, 30, "Bol");
  const tooLate = tx("ledger", 1000, 301);
  const before = tx("ledger", 1000, -5);
  const unknownLedger = tx("ledger", 2000, 30, "New Shop B.V.");
  const ledger = [wrongAmount, wrongMerchant, tooLate, before, unknownLedger];
  const r = matchFallback([p, unknown], ledger, MERCHANTS);
  assert.deepEqual(r.providerOnly, [p, unknown]);
  assert.deepEqual(r.ledgerOnly, ledger);
  assert.equal(r.matched.length + r.ambiguous.length, 0);
});

test("learnMerchantMap reads names from matched pairs", () => {
  const p = tx("provider", 1000, 0, "AMZN");
  const l = tx("ledger", 1000, 5, "Amazon");
  assert.deepEqual([...learnMerchantMap([{ provider: p, ledger: l }])], [["AMZN", "Amazon"]]);
});
