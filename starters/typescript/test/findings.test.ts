import { test } from "node:test";
import assert from "node:assert/strict";
import type { Transaction } from "../src/models.js";
import { compare, findingsFor, type Finding } from "../src/findings.js";

const f = (key: string, kind: Finding["kind"] = "missing-in-ledger"): Finding => ({
  key,
  kind,
  description: key,
});

function tx(source: Transaction["source"], amountCents: number): Transaction {
  return {
    source,
    id: "a",
    ref: source === "provider" ? "a" : "LG-1",
    amountCents,
    timestamp: new Date("2026-03-01T12:00:00Z"),
    merchant: "X",
  };
}

test("splits findings into new, resolved and still open", () => {
  const c = compare([f("a"), f("b")], [f("b"), f("c")]);
  assert.deepEqual(c.new, [f("c")]);
  assert.deepEqual(c.resolved, [f("a")]);
  assert.deepEqual(c.open, [f("b"), f("c")]);
});

test("an amount mismatch stays open on later runs", () => {
  const mismatch = f("m", "amount-mismatch");
  const c = compare([mismatch], []);
  assert.deepEqual(c.open, [mismatch]);
  assert.equal(c.new.length + c.resolved.length, 0);
});

test("a matched pair is a finding only when the amounts differ", () => {
  const result = (ledgerCents: number) => ({
    matched: [{ provider: tx("provider", 1000), ledger: tx("ledger", ledgerCents) }],
    providerOnly: [],
    ledgerOnly: [],
    ambiguous: [],
  });
  assert.equal(findingsFor(result(1000)).length, 0);
  assert.deepEqual(
    findingsFor(result(1035)).map((x) => x.kind),
    ["amount-mismatch"],
  );
});
