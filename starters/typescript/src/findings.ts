/** Turn a day's result into findings, and compare them with the previous run's. Pure. */
import type { Transaction } from "./models.js";
import { rowKey, type DayResult } from "./reconcile.js";

export type FindingKind =
  "missing-in-ledger" | "missing-at-provider" | "amount-mismatch" | "needs-review";

export interface Finding {
  /** Same finding on two runs = same key. */
  key: string;
  kind: FindingKind;
  description: string;
}

export interface Changes {
  new: Finding[];
  resolved: Finding[];
  /** Everything open after this run, new ones included. */
  open: Finding[];
}

export const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const when = (t: Transaction) => `${t.timestamp.toISOString().slice(0, 19).replace("T", " ")} UTC`;
const describe = (t: Transaction) => `${euros(t.amountCents)} ${t.merchant}, ${when(t)} (${t.ref})`;

function finding(kind: FindingKind, rows: Transaction[], description: string): Finding {
  return { key: [kind, ...rows.map(rowKey).sort()].join("~"), kind, description };
}

const rows = (n: number, side: string) => `${n} ${side} row${n === 1 ? "" : "s"}`;
const signed = (cents: number) => (cents < 0 ? `-${euros(-cents)}` : `+${euros(cents)}`);

/** Descriptions are for finance; a multi-line one is printed indented. */
export function findingsFor(result: DayResult): Finding[] {
  return [
    ...result.providerOnly.map((t) => finding("missing-in-ledger", [t], describe(t))),
    ...result.ledgerOnly.map((t) => finding("missing-at-provider", [t], describe(t))),
    ...result.matched
      .filter((m) => m.provider.amountCents !== m.ledger.amountCents)
      .map(({ provider: p, ledger: l }) =>
        finding(
          "amount-mismatch",
          [p, l],
          `${p.merchant}, ${when(p)}: provider ${euros(p.amountCents)}, ledger ${euros(l.amountCents)} ` +
            `(ledger ${signed(l.amountCents - p.amountCents)}) (${p.ref} / ${l.ref})`,
        ),
      ),
    ...result.ambiguous.map((a) =>
      finding(
        "needs-review",
        [...a.provider, ...a.ledger],
        [
          `${rows(a.provider.length, "provider")} could match ${rows(a.ledger.length, "ledger")}:`,
          ...a.provider.map((t) => `provider  ${describe(t)}`),
          ...a.ledger.map((t) => `ledger    ${describe(t)}`),
        ].join("\n"),
      ),
    ),
  ];
}

/** Amount mismatches stay open: a matched pair isn't seen again, and no later export fixes it. */
export function compare(previousOpen: Finding[], today: Finding[]): Changes {
  const todayKeys = new Set(today.map((f) => f.key));
  const open = [
    ...today,
    ...previousOpen.filter((f) => f.kind === "amount-mismatch" && !todayKeys.has(f.key)),
  ];
  const before = new Set(previousOpen.map((f) => f.key));
  const after = new Set(open.map((f) => f.key));
  return {
    new: open.filter((f) => !before.has(f.key)),
    resolved: previousOpen.filter((f) => !after.has(f.key)),
    open,
  };
}
