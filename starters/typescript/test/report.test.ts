import { test } from "node:test";
import assert from "node:assert/strict";
import type { Transaction } from "../src/models.js";
import { totalsLine } from "../src/report.js";

const tx = (source: Transaction["source"], amountCents: number): Transaction => ({
  source,
  id: null,
  ref: "r",
  amountCents,
  timestamp: new Date("2026-03-01T12:00:00Z"),
  merchant: "X",
});

test("totals line says whether the day's files agree", () => {
  assert.match(
    totalsLine({ provider: [tx("provider", 1000)], ledger: [tx("ledger", 1000)] }),
    /They match/,
  );
  assert.match(
    totalsLine({ provider: [tx("provider", 1000)], ledger: [tx("ledger", 1035)] }),
    /do not match: ledger \+€0\.35/,
  );
});
