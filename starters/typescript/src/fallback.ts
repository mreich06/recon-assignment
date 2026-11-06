/** Match rows that have no transaction id, by amount, merchant and booking lag. Pure. */
import type { Match } from "./match.js";
import type { Transaction } from "./models.js";

/** Rows without an id were booked 98-160 s after capture in the data; allow up to 5 minutes. */
export const FALLBACK_WINDOW_SECONDS = 300;

/** Provider merchant descriptor -> ledger merchant name. */
export type MerchantMap = Map<string, string>;

/** Several rows that could pair up in more than one way. A human has to decide. */
export interface AmbiguousGroup {
  provider: Transaction[];
  ledger: Transaction[];
}

export interface FallbackResult {
  matched: Match[];
  ambiguous: AmbiguousGroup[];
  providerOnly: Transaction[];
  ledgerOnly: Transaction[];
}

/** Learn which ledger name goes with each provider descriptor from rows already matched by id. */
export function learnMerchantMap(matches: Match[]): MerchantMap {
  const map: MerchantMap = new Map();
  for (const { provider, ledger } of matches) map.set(provider.merchant, ledger.merchant);
  return map;
}

function couldPair(
  p: Transaction,
  l: Transaction,
  merchants: MerchantMap,
  windowSeconds: number,
): boolean {
  const lagSeconds = (l.timestamp.getTime() - p.timestamp.getTime()) / 1000;
  return (
    p.amountCents === l.amountCents &&
    lagSeconds >= 0 &&
    lagSeconds <= windowSeconds &&
    // An unknown descriptor has no candidates, so it is reported instead of guessed.
    merchants.get(p.merchant) === l.merchant
  );
}

/**
 * A provider row and a ledger row are matched only if each is the other's single candidate.
 * Rows that share candidates are grouped and flagged as ambiguous.
 */
export function matchFallback(
  provider: Transaction[],
  ledger: Transaction[],
  merchants: MerchantMap,
  windowSeconds = FALLBACK_WINDOW_SECONDS,
): FallbackResult {
  const candidates = provider.map((p) =>
    ledger.filter((l) => couldPair(p, l, merchants, windowSeconds)),
  );

  // Group rows that are linked by a candidate pair, so one ambiguous case is reported once.
  const ledgerToProviders = new Map<Transaction, number[]>();
  candidates.forEach((ls, i) =>
    ls.forEach((l) => ledgerToProviders.set(l, [...(ledgerToProviders.get(l) ?? []), i])),
  );

  const result: FallbackResult = { matched: [], ambiguous: [], providerOnly: [], ledgerOnly: [] };
  const seenProviders = new Set<number>();
  const usedLedger = new Set<Transaction>();

  provider.forEach((p, start) => {
    if (seenProviders.has(start)) return;
    if (candidates[start].length === 0) {
      result.providerOnly.push(p);
      return;
    }
    const providers = new Set<number>([start]);
    const ledgers = new Set<Transaction>();
    const queue = [start];
    while (queue.length) {
      const i = queue.pop()!;
      for (const l of candidates[i]) {
        ledgers.add(l);
        for (const j of ledgerToProviders.get(l)!) {
          if (!providers.has(j)) {
            providers.add(j);
            queue.push(j);
          }
        }
      }
    }
    providers.forEach((i) => seenProviders.add(i));
    ledgers.forEach((l) => usedLedger.add(l));
    const group = {
      provider: [...providers].sort((a, b) => a - b).map((i) => provider[i]),
      ledger: [...ledgers],
    };
    if (group.provider.length === 1 && group.ledger.length === 1)
      result.matched.push({ provider: group.provider[0], ledger: group.ledger[0] });
    else result.ambiguous.push(group);
  });

  result.ledgerOnly = ledger.filter((l) => !usedLedger.has(l));
  return result;
}
