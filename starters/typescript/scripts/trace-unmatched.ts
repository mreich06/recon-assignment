/** Traces unmatched rows into other days' files. Not part of the tool. Run: npx tsx scripts/trace-unmatched.ts */
import type { Transaction } from "../src/models.js";
import { byId, couldPair, formatRow, heading, lagSeconds, loadAllDays } from "./lib.js";

const days = loadAllDays();
/** A pair within this window counts as a likely ID-less match. */
const MATCH_LAG_SECONDS = 90;
/** How far either side to look for near matches when there is no likely match. */
const NEARBY_SECONDS = 600;

const near = (a: Transaction, b: Transaction) => Math.abs(lagSeconds(a, b)) < NEARBY_SECONDS;

for (const { date, provider, ledger } of days) {
  heading(`${date}: ID-less provider rows with no ID-less ledger row within ${MATCH_LAG_SECONDS}s`);
  console.log(
    `(showing ledger rows within ${NEARBY_SECONDS / 60} min that have the same amount or no id)`,
  );
  for (const p of provider.filter((p) => !p.id)) {
    if (ledger.some((l) => !l.id && couldPair(p, l, MATCH_LAG_SECONDS))) continue;
    console.log(" P " + formatRow(p));
    for (const l of ledger.filter((l) => near(p, l) && (l.amountCents === p.amountCents || !l.id)))
      console.log(`     L ${formatRow(l)}  lag ${lagSeconds(p, l)}s`);
  }

  heading(`${date}: ID-less ledger rows with no ID-less provider row within ${MATCH_LAG_SECONDS}s`);
  console.log(
    `(showing provider rows within ${NEARBY_SECONDS / 60} min that have the same amount)`,
  );
  for (const l of ledger.filter((l) => !l.id)) {
    if (provider.some((p) => !p.id && couldPair(p, l, MATCH_LAG_SECONDS))) continue;
    console.log(" L " + formatRow(l));
    for (const p of provider.filter((p) => near(p, l) && p.amountCents === l.amountCents))
      console.log("     P " + formatRow(p));
  }
}

// Every id that repeats inside one provider file, with every row in any file that carries it.
const allRows = days.flatMap((d) => [...d.provider, ...d.ledger]);
for (const { date, provider } of days) {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const p of provider.filter((p) => p.id)) (seen.has(p.id!) ? repeated : seen).add(p.id!);
  for (const id of repeated) {
    heading(`Duplicate id in ${date} provider file: ${id}`);
    for (const t of allRows.filter((t) => t.id === id)) console.log(" " + formatRow(t, true));
  }
}

heading("Ids that appear in more than one provider file");
for (let i = 1; i < days.length; i++) {
  const earlier = byId(days[i - 1].provider);
  for (const p of days[i].provider.filter((p) => p.id && earlier.has(p.id))) {
    console.log(` ${days[i - 1].date} ${formatRow(earlier.get(p.id!)!)}`);
    console.log(` ${days[i].date} ${formatRow(p)}`);
    for (const l of days.flatMap((d) => d.ledger).filter((l) => l.id === p.id))
      console.log(`    L ${formatRow(l)}`);
  }
}

/** Which day's file on the other side, if any, holds this id. */
const foundIn = (id: string, side: "provider" | "ledger", skipDate: string) =>
  days.filter((d) => d.date !== skipDate && byId(d[side]).has(id)).map((d) => d.date);

for (const { date, provider, ledger } of days) {
  heading(`${date}: rows matched by id on one side only, and where the other side turns up`);
  const providerById = byId(provider);
  const ledgerById = byId(ledger);
  for (const p of provider.filter((p) => p.id && !ledgerById.has(p.id))) {
    const elsewhere = foundIn(p.id!, "ledger", date);
    console.log(` provider only ${formatRow(p)}  -> ledger ${elsewhere.join(", ") || "nowhere"}`);
  }
  for (const l of ledger.filter((l) => l.id && !providerById.has(l.id))) {
    const elsewhere = foundIn(l.id!, "provider", date);
    console.log(` ledger only   ${formatRow(l)}  -> provider ${elsewhere.join(", ") || "nowhere"}`);
  }
}

heading("Amount mismatches on id matches");
for (const { date, provider, ledger } of days) {
  const ledgerById = byId(ledger);
  for (const p of provider.filter((p) => p.id && ledgerById.has(p.id))) {
    const l = ledgerById.get(p.id!)!;
    if (l.amountCents === p.amountCents) continue;
    console.log(` ${date} P ${formatRow(p)}`);
    console.log(`            L ${formatRow(l)}`);
  }
}
