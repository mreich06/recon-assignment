/** The printed report, for finance. */
import { euros, type Changes, type Finding, type FindingKind } from "./findings.js";
import type { Rows } from "./reconcile.js";

const HEADINGS: Record<FindingKind, string> = {
  "missing-in-ledger": "Paid at the provider, missing from the ledger",
  "missing-at-provider": "In the ledger, no payment at the provider",
  "amount-mismatch": "Amounts differ",
  "needs-review": "Needs a person to review",
};

function section(title: string, findings: Finding[]): string[] {
  if (findings.length === 0) return [title, "  None", ""];
  const lines = [title];
  for (const kind of Object.keys(HEADINGS) as FindingKind[]) {
    const group = findings.filter((f) => f.kind === kind);
    if (group.length === 0) continue;
    lines.push(`  ${HEADINGS[kind]} (${group.length})`);
    for (const f of group) lines.push(`    - ${f.description.replaceAll("\n", "\n        ")}`);
  }
  return [...lines, ""];
}

const sum = (rows: Rows["provider"]) => rows.reduce((total, t) => total + t.amountCents, 0);

/** FIN-121: totals of the day's two files as exported, before any carried-over rows. */
export function totalsLine(today: Rows): string {
  const provider = sum(today.provider);
  const ledger = sum(today.ledger);
  const diff = ledger - provider;
  if (diff === 0)
    return `Totals: provider ${euros(provider)}, ledger ${euros(ledger)}. They match.`;
  const signed = diff < 0 ? `-${euros(-diff)}` : `+${euros(diff)}`;
  return (
    `Totals: provider ${euros(provider)}, ledger ${euros(ledger)}. ` +
    `They do not match: ledger ${signed}. See the findings for the rows involved.`
  );
}

export function formatReport(date: string, changes: Changes, today: Rows): string {
  const stillOpen = changes.open.length - changes.new.length;
  return [
    `Reconciliation for ${date}`,
    totalsLine(today),
    `Summary: ${changes.new.length} new, ${changes.resolved.length} resolved, ` +
      `${stillOpen} still open from earlier runs (not listed again)`,
    "",
    ...section("NEW", changes.new),
    ...section("RESOLVED SINCE THE PREVIOUS RUN", changes.resolved),
  ]
    .join("\n")
    .trimEnd();
}
