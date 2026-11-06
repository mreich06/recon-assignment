/** Checks ID-less pairing by amount and time. Not part of the tool. Run: npx tsx scripts/check-idless-matching.ts */
import { couldPair, eur, formatRow, heading, lagSeconds, loadAllDays } from "./lib.js";

/** Amounts picked by hand from profile-data.ts output. */
const AMBIGUOUS_AMOUNTS_CENTS = [24900, 2100, 15034];
const MAX_LAG_SECONDS = 300;

const days = loadAllDays();
const allRows = days.flatMap((d) => [...d.provider, ...d.ledger]);

for (const amount of AMBIGUOUS_AMOUNTS_CENTS) {
  heading(`Every row for ${eur(amount)}`);
  allRows
    .filter((t) => t.amountCents === amount)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .forEach((t) => console.log(formatRow(t, true)));
}

for (const { date, provider, ledger } of days) {
  const ledgerNoId = ledger.filter((l) => !l.id);
  const lags = provider
    .filter((p) => !p.id)
    .map((p) =>
      ledgerNoId.filter((l) => couldPair(p, l, MAX_LAG_SECONDS)).map((l) => lagSeconds(p, l)),
    );
  heading(`${date}: ID-less candidate lags within ${MAX_LAG_SECONDS / 60} min (seconds)`);
  console.log(JSON.stringify(lags));
}
