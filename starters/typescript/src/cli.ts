/** recon run --date YYYY-MM-DD */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDay } from "./readers.js";
import { compare, findingsFor } from "./findings.js";
import { reconcileDay } from "./reconcile.js";
import { formatReport } from "./report.js";
import {
  carriedRows,
  loadState,
  matchedBefore,
  openBefore,
  recordDay,
  saveState,
} from "./state.js";

const DEFAULT_STATE_FILE = resolve(fileURLToPath(import.meta.url), "../../state/recon-state.json");
const REPORTS_DIR = resolve(fileURLToPath(import.meta.url), "../../reports");
const DEFAULT_DATA_DIR = resolve(fileURLToPath(import.meta.url), "../../../../data");

function run(date: string, dataDir: string, stateFile: string): number {
  const today = loadDay(dataDir, date);
  const state = loadState(stateFile);
  const result = reconcileDay(today, carriedRows(state, date), matchedBefore(state, date));
  const changes = compare(openBefore(state, date), findingsFor(result));
  saveState(stateFile, recordDay(state, date, result, changes.open));

  const report = formatReport(date, changes, today);
  console.log(report);
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, `${date}.txt`), report + "\n");
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
