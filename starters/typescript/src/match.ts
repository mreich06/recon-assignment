/** Match provider and ledger transactions by transaction id. Pure: no I/O, no state. */
import type { Transaction } from "./models.js";

export interface Match {
  provider: Transaction;
  ledger: Transaction;
}

/** An id that appears more than once on a side. Never matched automatically. */
export interface AmbiguousId {
  id: string;
  provider: Transaction[];
  ledger: Transaction[];
}

export interface IdMatchResult {
  matched: Match[];
  providerOnly: Transaction[];
  ledgerOnly: Transaction[];
  ambiguous: AmbiguousId[];
  /** Rows without an id, left for a later fallback match. */
  noId: { provider: Transaction[]; ledger: Transaction[] };
}

function groupById(rows: Transaction[]): { byId: Map<string, Transaction[]>; noId: Transaction[] } {
  const byId = new Map<string, Transaction[]>();
  const noId: Transaction[] = [];
  for (const row of rows) {
    if (!row.id) {
      noId.push(row);
      continue;
    }
    const group = byId.get(row.id);
    if (group) group.push(row);
    else byId.set(row.id, [row]);
  }
  return { byId, noId };
}

export function matchById(provider: Transaction[], ledger: Transaction[]): IdMatchResult {
  const p = groupById(provider);
  const l = groupById(ledger);
  const result: IdMatchResult = {
    matched: [],
    providerOnly: [],
    ledgerOnly: [],
    ambiguous: [],
    noId: { provider: p.noId, ledger: l.noId },
  };

  // An id repeated on either side is ambiguous, even if the other side lacks it.
  for (const [id, providerRows] of p.byId) {
    const ledgerRows = l.byId.get(id) ?? [];
    if (providerRows.length > 1 || ledgerRows.length > 1)
      result.ambiguous.push({ id, provider: providerRows, ledger: ledgerRows });
    else if (ledgerRows.length === 0) result.providerOnly.push(providerRows[0]);
    else result.matched.push({ provider: providerRows[0], ledger: ledgerRows[0] });
  }
  for (const [id, ledgerRows] of l.byId) {
    if (p.byId.has(id)) continue;
    if (ledgerRows.length > 1) result.ambiguous.push({ id, provider: [], ledger: ledgerRows });
    else result.ledgerOnly.push(ledgerRows[0]);
  }
  return result;
}
