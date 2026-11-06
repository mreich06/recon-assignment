/** recon run --date YYYY-MM-DD */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDay } from "./readers.js";
import { reconcileDay } from "./reconcile.js";
import { carriedRows, loadState, matchedBefore, recordDay, saveState } from "./state.js";

const DEFAULT_STATE_FILE = resolve(fileURLToPath(import.meta.url), "../../state/recon-state.json");
const DEFAULT_DATA_DIR = resolve(fileURLToPath(import.meta.url), "../../../../data");

function run(date: string, dataDir: string, stateFile: string): number {
  const today = loadDay(dataDir, date);
  console.log(
    `${date}: ${today.provider.length} provider records, ${today.ledger.length} ledger rows`,
  );

  const state = loadState(stateFile);
  const result = reconcileDay(today, carriedRows(state, date), matchedBefore(state, date));
  saveState(stateFile, recordDay(state, date, result));

  console.log(
    `matched ${result.matched.length}, provider only ${result.providerOnly.length}, ` +
      `ledger only ${result.ledgerOnly.length}, needs review ${result.ambiguous.length}`,
  );
  return 0;
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command !== "run") {
    console.error("usage: recon run --date YYYY-MM-DD [--data-dir <path>] [--state-file <path>]");
    return 2;
  }
  let date: string | undefined;
  let dataDir = DEFAULT_DATA_DIR;
  let stateFile = DEFAULT_STATE_FILE;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--date") date = rest[++i];
    else if (rest[i] === "--data-dir") dataDir = resolve(rest[++i]);
    else if (rest[i] === "--state-file") stateFile = resolve(rest[++i]);
  }
  if (!date) {
    console.error("--date is required");
    return 2;
  }
  return run(date, dataDir, stateFile);
}

process.exit(main(process.argv.slice(2)));
