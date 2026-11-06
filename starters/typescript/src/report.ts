/** The printed report, for finance. */
import type { Changes, Finding, FindingKind } from "./findings.js";

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

export function formatReport(date: string, changes: Changes): string {
  const stillOpen = changes.open.length - changes.new.length;
  return [
    `Reconciliation for ${date}`,
    `Summary: ${changes.new.length} new, ${changes.resolved.length} resolved, ` +
      `${stillOpen} still open from earlier runs (not listed again)`,
    "",
    ...section("NEW", changes.new),
    ...section("RESOLVED SINCE THE PREVIOUS RUN", changes.resolved),
  ]
    .join("\n")
    .trimEnd();
}
