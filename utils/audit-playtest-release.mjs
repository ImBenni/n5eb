/* eslint-disable jsdoc/require-jsdoc */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "..");

const TASKS = [
  {
    label: "Automation references and manual-engine boundaries",
    script: "audit:automation",
    command: ["utils/audit-automation.mjs"]
  },
  {
    label: "Chakra progression and actor chakra readiness",
    script: "audit:chakra",
    command: ["utils/audit-chakra.mjs"]
  },
  {
    label: "Ranked condition registry and compendium coverage",
    script: "audit:conditions",
    command: ["utils/audit-conditions.mjs"]
  },
  {
    label: "Adversary Builder jutsu lookup coverage",
    script: "audit:adversary-jutsu",
    command: ["utils/audit-adversary-jutsu-lookup.mjs"]
  },
  {
    label: "Enhancement seal and armor seal-field coverage",
    script: "audit:seals",
    command: ["utils/audit-seals.mjs"]
  },
  {
    label: "Armor AC, DR, and source-data coverage",
    script: "audit:armor",
    command: ["utils/audit-armor.mjs"]
  },
  {
    label: "Toolkit source data and equipment pack expansion coverage",
    script: "audit:toolkits",
    command: ["utils/audit-toolkits.mjs"]
  },
  {
    label: "Crafting downtime templates and claim workflow coverage",
    script: "audit:crafting-downtime",
    command: ["utils/audit-crafting-downtime.mjs"]
  },
  {
    label: "Feat and fighting stance compendium coverage",
    script: "audit:feats-stances",
    command: ["utils/audit-feats-stances.mjs"]
  },
  {
    label: "Migration smoke and bundled migration data",
    script: "audit:migrations",
    command: ["utils/audit-migrations.mjs"]
  },
  {
    label: "Adversary pack normalization dry-run",
    script: "adversary:normalize:dry",
    command: ["utils/normalize-adversary-packs.mjs", "--dry-run"]
  },
  {
    label: "Summon pack normalization dry-run",
    script: "summon:normalize:dry",
    command: ["utils/normalize-summon-packs.mjs", "--dry-run"]
  }
];

const results = [];

console.log("N5eB Playtest Release Audit");
console.log("===========================");

for ( const task of TASKS ) {
  console.log("");
  console.log(`> ${task.label}`);
  console.log(`  npm run ${task.script}`);
  const [script, ...args] = task.command;
  const result = spawnSync(process.execPath, [path.join(SYSTEM_ROOT, script), ...args], {
    cwd: SYSTEM_ROOT,
    env: process.env,
    encoding: "utf8",
    stdio: "inherit"
  });
  results.push({
    ...task,
    status: result.status ?? 1,
    signal: result.signal ?? null,
    error: result.error?.message ?? ""
  });
}

console.log("");
console.log("Summary");
console.log("-------");
for ( const result of results ) {
  const passed = result.status === 0 && !result.signal && !result.error;
  console.log(`${passed ? "PASS" : "FAIL"} ${result.script} - ${result.label}`);
  if ( result.signal ) console.log(`  signal: ${result.signal}`);
  if ( result.error ) console.log(`  error: ${result.error}`);
}

if ( results.some(result => result.status !== 0 || result.signal || result.error) ) process.exitCode = 1;
