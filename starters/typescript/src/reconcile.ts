/** Reconcile one day: today's rows plus rows still unmatched from earlier days. Pure. */
import { matchFallback, learnMerchantMap } from "./fallback.js";
import { matchById, type Match } from "./match.js";
import type { Transaction } from "./models.js";

export interface Rows {
  provider: Transaction[];
  ledger: Transaction[];
}

export interface DayResult {
  matched: Match[];
  providerOnly: Transaction[];
  ledgerOnly: Transaction[];
  /** Rows needing a human decision. */
  ambiguous: { provider: Transaction[]; ledger: Transaction[] }[];
}

/** Same row across files. Provider rows without an id skip ref ("file:line" differs per file). */
export const rowKey = (t: Transaction) =>
  [
    t.source,
    t.source === "ledger" ? t.ref : (t.id ?? ""),
    t.amountCents,
    t.timestamp.toISOString(),
    t.merchant,
  ].join("|");

function dedupe(rows: Transaction[]): Transaction[] {
  const seen = new Set<string>();
  return rows.filter((t) => {
    const key = rowKey(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Rows in `alreadyMatched` (matched on earlier days) are skipped. */
export function reconcileDay(
  today: Rows,
  carried: Rows,
  alreadyMatched: Set<string> = new Set(),
): DayResult {
  const isNew = (t: Transaction) => !alreadyMatched.has(rowKey(t));
  const provider = dedupe([...carried.provider, ...today.provider.filter(isNew)]);
  const ledger = dedupe([...carried.ledger, ...today.ledger.filter(isNew)]);

  const byId = matchById(provider, ledger);
  const fallback = matchFallback(
    byId.noId.provider,
    byId.noId.ledger,
    learnMerchantMap(byId.matched),
  );

  return {
    matched: [...byId.matched, ...fallback.matched],
    providerOnly: [...byId.providerOnly, ...fallback.providerOnly],
    ledgerOnly: [...byId.ledgerOnly, ...fallback.ledgerOnly],
    ambiguous: [...byId.ambiguous, ...fallback.ambiguous],
  };
}

/** Rows still waiting for a counterpart. */
export function unmatchedRows(result: DayResult): Rows {
  return {
    provider: [...result.providerOnly, ...result.ambiguous.flatMap((a) => a.provider)],
    ledger: [...result.ledgerOnly, ...result.ambiguous.flatMap((a) => a.ledger)],
  };
}
