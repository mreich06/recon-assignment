/** Profiles both exports. Not part of the tool. Run: npx tsx scripts/profile-data.ts */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Transaction } from "../src/models.js";
import { isoSeconds } from "../src/normalize.js";
import {
  DATA_DIR,
  byId,
  couldPair,
  eur,
  formatRow,
  groupBy,
  heading,
  lagSeconds,
  loadAllDays,
  percentile,
  summarizeCounts,
} from "./lib.js";

const days = loadAllDays();
const DAY_MS = 86_400_000;

// currency and status are dropped by normalisation, so check them on the raw lines.
heading("Raw field values");
for (const { date } of days) {
  const raw = readFileSync(join(DATA_DIR, `provider-${date}.jsonl`), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { currency: string; status: string });
  const currencies = summarizeCounts(groupBy(raw, (r) => r.currency));
  const statuses = summarizeCounts(groupBy(raw, (r) => r.status));
  console.log(`${date} provider currency: ${currencies}  status: ${statuses}`);
}

function profileSide(name: string, rows: Transaction[], date: string) {
  const windowStart = Date.parse(`${date}T00:00:00Z`);
  const times = rows.map((r) => r.timestamp.getTime()).sort((a, b) => a - b);
  const outside = rows.filter((r) => {
    const t = r.timestamp.getTime();
    return t < windowStart || t >= windowStart + DAY_MS;
  });
  const amounts = rows.map((r) => r.amountCents);
  const total = amounts.reduce((a, b) => a + b, 0);

  console.log(
    `${name}: ${rows.length} rows, total ${eur(total)}, no id ${rows.filter((r) => !r.id).length}`,
  );
  console.log(
    `  time range UTC ${isoSeconds(new Date(times[0]))} .. ${isoSeconds(new Date(times.at(-1)!))}; ` +
      `outside the ${date} UTC window: ${outside.length}`,
  );
  for (const t of outside.slice(0, 3)) console.log(`    e.g. ${formatRow(t)}`);
  console.log(
    `  amounts min ${eur(Math.min(...amounts))} max ${eur(Math.max(...amounts))}; ` +
      `zero or negative: ${amounts.filter((a) => a <= 0).length}`,
  );

  const duplicateIds = [
    ...groupBy(
      rows.filter((r) => r.id),
      (r) => r.id!,
    ),
  ].filter(([, group]) => group.length > 1);
  console.log(`  duplicate ids within file: ${duplicateIds.length}`);
  for (const [, group] of duplicateIds.slice(0, 3))
    for (const t of group) console.log(`    ${formatRow(t)}`);

  const lookAlikes = [
    ...groupBy(rows, (r) => `${r.amountCents}|${r.timestamp.getTime()}|${r.merchant}`),
  ].filter(([, group]) => group.length > 1);
  console.log(`  rows identical in amount + time + merchant: ${lookAlikes.length} groups`);
  for (const [, group] of lookAlikes.slice(0, 3))
    for (const t of group) console.log(`    ${formatRow(t)}`);
}

for (const { date, provider, ledger } of days) {
  heading(`Day ${date}`);
  profileSide("provider", provider, date);
  profileSide("ledger", ledger, date);
  const entryIds = ledger.map((l) => l.ref);
  console.log(`ledger duplicate entry_id: ${entryIds.length - new Set(entryIds).size}`);

  // Matching on transaction id within the day.
  const providerById = byId(provider);
  const ledgerById = byId(ledger);
  const both = [...providerById.keys()].filter((id) => ledgerById.has(id));
  const providerOnly = [...providerById.keys()].filter((id) => !ledgerById.has(id));
  const ledgerOnly = [...ledgerById.keys()].filter((id) => !providerById.has(id));
  const pairs = both.map((id) => ({ p: providerById.get(id)!, l: ledgerById.get(id)! }));
  const mismatches = pairs.filter(({ p, l }) => p.amountCents !== l.amountCents);

  console.log(
    `\nID match: both ${both.length}, provider only ${providerOnly.length}, ` +
      `ledger only ${ledgerOnly.length}, amount mismatch ${mismatches.length}`,
  );
  for (const { p, l } of mismatches.slice(0, 5))
    console.log(
      `  ${p.id}: provider ${eur(p.amountCents)} ledger ${eur(l.amountCents)} ` +
        `diff ${eur(l.amountCents - p.amountCents)}`,
    );
  const diffs = groupBy(mismatches, ({ p, l }) => String(l.amountCents - p.amountCents));
  console.log(
    `  mismatch diffs (ledger - provider, cents): ` +
      [...diffs]
        .slice(0, 15)
        .map(([k, v]) => `${k}×${v.length}`)
        .join(", "),
  );
  for (const id of providerOnly.slice(0, 3))
    console.log(`  provider only e.g. ${formatRow(providerById.get(id)!)}`);
  for (const id of ledgerOnly.slice(0, 3))
    console.log(`  ledger only   e.g. ${formatRow(ledgerById.get(id)!)}`);

  // How long after the provider capture does the ledger book it?
  const lags = pairs.map(({ p, l }) => lagSeconds(p, l)).sort((a, b) => a - b);
  console.log(
    `\nBooking lag seconds (ledger - provider): min ${lags[0]} p50 ${percentile(lags, 50)} ` +
      `p95 ${percentile(lags, 95)} p99 ${percentile(lags, 99)} max ${lags.at(-1)}; ` +
      `negative ${lags.filter((x) => x < 0).length}`,
  );
  for (const { p, l } of pairs.filter(({ p, l }) => Math.abs(lagSeconds(p, l)) > 3600).slice(0, 3))
    console.log(`  lag over 1h: ${formatRow(p)}  ->  ${formatRow(l)}`);

  // Which provider descriptor goes with which ledger name, learned from ID matches.
  const merchantPairs = groupBy(pairs, ({ p, l }) => `${p.merchant}  ->  ${l.merchant}`);
  const ledgerNamesPerDescriptor = groupBy([...merchantPairs.keys()], (k) => k.split("  ->  ")[0]);
  const ambiguousDescriptors = [...ledgerNamesPerDescriptor].filter(([, v]) => v.length > 1);
  console.log(
    `\nMerchant pairs (from ID matches): ${merchantPairs.size}; ` +
      `provider descriptors with more than one ledger name: ${ambiguousDescriptors.length}`,
  );
  for (const [pair, group] of [...merchantPairs].sort((a, b) => b[1].length - a[1].length))
    console.log(`  ${String(group.length).padStart(4)}  ${pair}`);

  // ID-less rows: how many ledger candidates would amount + lag window give each one?
  const providerNoId = provider.filter((p) => !p.id);
  const ledgerNoId = ledger.filter((l) => !l.id);
  const maxLag = lags.at(-1) ?? 600;
  const candidates = (p: Transaction, pool: Transaction[]) =>
    pool.filter((l) => couldPair(p, l, maxLag));
  const candidateCounts = (pool: Transaction[]) =>
    summarizeCounts(
      groupBy(providerNoId, (p) => {
        const n = candidates(p, pool).length;
        return n >= 2 ? "2+" : String(n);
      }),
    );
  console.log(
    `\nID-less: provider ${providerNoId.length}, ledger ${ledgerNoId.length}. ` +
      `Candidates by amount + lag window (0..${maxLag}s):`,
  );
  console.log(`  vs ID-less ledger rows: ${candidateCounts(ledgerNoId)}`);
  console.log(`  vs all ledger rows:     ${candidateCounts(ledger)}`);
  for (const p of providerNoId.filter((p) => candidates(p, ledgerNoId).length !== 1).slice(0, 4)) {
    console.log(`  ${formatRow(p)}`);
    for (const l of candidates(p, ledgerNoId)) console.log(`      candidate ${formatRow(l)}`);
  }
}

heading("Across days");
const idSet = (xs: Transaction[]) => new Set(byId(xs).keys());
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((id) => b.has(id));
for (let i = 1; i < days.length; i++) {
  const prev = days[i - 1];
  const next = days[i];
  const prevProvider = idSet(prev.provider);
  const prevLedger = idSet(prev.ledger);
  const prevProviderOnly = new Set([...prevProvider].filter((id) => !prevLedger.has(id)));
  const prevLedgerOnly = new Set([...prevLedger].filter((id) => !prevProvider.has(id)));
  const capturedEarly = next.provider.filter(
    (p) => p.timestamp.getTime() < Date.parse(`${next.date}T00:00:00Z`),
  );

  console.log(`${prev.date} -> ${next.date}`);
  console.log(
    `  ids in both provider files: ${overlap(prevProvider, idSet(next.provider)).length}`,
  );
  console.log(`  ids in both ledger files:   ${overlap(prevLedger, idSet(next.ledger)).length}`);
  console.log(
    `  ${prev.date} provider-only ids found in ${next.date} ledger: ` +
      `${overlap(prevProviderOnly, idSet(next.ledger)).length} of ${prevProviderOnly.size}`,
  );
  console.log(
    `  ${prev.date} ledger-only ids found in ${next.date} provider: ` +
      `${overlap(prevLedgerOnly, idSet(next.provider)).length} of ${prevLedgerOnly.size}`,
  );
  console.log(
    `  ${next.date} provider rows captured before ${next.date} UTC: ${capturedEarly.length} ` +
      `(also in the ${prev.date} provider file: ${capturedEarly.filter((p) => p.id && prevProvider.has(p.id)).length})`,
  );
}
