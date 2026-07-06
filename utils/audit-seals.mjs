/* eslint-disable jsdoc/require-jsdoc, max-len */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "..");
const PACK_SOURCE_ROOT = path.join(SYSTEM_ROOT, "packs", "_source", "items");

const REQUIRED_SEAL_FIELDS = ["target", "rank", "slots", "baseName", "level", "craftingDC", "downtime"];
const REQUIRED_ARMOR_FIELDS = ["bonus", "dexCap", "dr", "don", "doff"];
const ARMOR_TYPES = new Set(["light", "medium", "heavy"]);

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-seals")
  .option("json", {
    describe: "Print the full audit report as JSON.",
    type: "boolean",
    default: false
  })
  .option("out", {
    describe: "Optional path to write the full JSON audit report.",
    type: "string",
    requiresArg: true
  })
  .help();

const report = buildReport(loadItemSourceDocuments());

if ( argv.out ) {
  fs.mkdirSync(path.dirname(path.resolve(argv.out)), { recursive: true });
  fs.writeFileSync(path.resolve(argv.out), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}

if ( argv.json ) console.log(JSON.stringify(report, null, 2));
else printReport(report);

if (
  report.parseErrors.length
  || report.seals.missingFields.length
  || report.seals.missingRyoPrice.length
  || report.seals.missingEffects.length
  || report.armors.missingFields.length
) {
  process.exitCode = 1;
}

function loadItemSourceDocuments() {
  const documents = [];
  const parseErrors = [];
  for ( const file of findSourceFiles(PACK_SOURCE_ROOT) ) {
    try {
      const doc = YAML.load(fs.readFileSync(file, "utf8"));
      if ( doc?._key === "!folders" ) continue;
      if ( doc ) documents.push({ file, doc });
    } catch(err) {
      parseErrors.push({ file: relative(file), error: err.message });
    }
  }
  return { documents, parseErrors };
}

function* findSourceFiles(dir) {
  for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
    const file = path.join(dir, entry.name);
    if ( entry.isDirectory() ) yield* findSourceFiles(file);
    else if ( entry.isFile() && entry.name.endsWith(".yml") && (entry.name !== "_folder.yml") ) yield file;
  }
}

function buildReport({ documents, parseErrors }) {
  const report = {
    parseErrors,
    seals: {
      total: 0,
      byTarget: {},
      byRank: {},
      missingFields: [],
      missingRyoPrice: [],
      missingEffects: []
    },
    armors: {
      total: 0,
      missingFields: []
    },
    targets: {
      weapons: 0,
      armors: 0,
      containers: 0,
      equipment: 0,
      explicitSealSlots: 0,
      implicitSchemaSealSlots: []
    }
  };

  for ( const row of documents ) auditDocument(row, report);
  return report;
}

function auditDocument({ file, doc }, report) {
  const system = doc.system ?? {};
  const isSeal = doc.type === "consumable" && (system.seal?.target || ["aseal", "wseal"].includes(system.type?.value));
  const isArmor = doc.type === "equipment" && ARMOR_TYPES.has(system.type?.value);
  const canReceiveSeals = ["weapon", "equipment", "container"].includes(doc.type);

  if ( isSeal ) auditSeal({ file, doc }, report);
  if ( isArmor ) auditArmor({ file, doc }, report);

  if ( doc.type === "weapon" ) report.targets.weapons++;
  else if ( isArmor ) report.targets.armors++;
  else if ( doc.type === "container" ) report.targets.containers++;
  else if ( doc.type === "equipment" ) report.targets.equipment++;

  if ( !canReceiveSeals ) return;
  if ( system.seals ) report.targets.explicitSealSlots++;
  else if ( doc.type === "weapon" || isArmor ) {
    report.targets.implicitSchemaSealSlots.push({
      file: relative(file),
      name: doc.name,
      type: doc.type,
      itemType: system.type?.value ?? ""
    });
  }
}

function auditSeal({ file, doc }, report) {
  const system = doc.system ?? {};
  const seal = system.seal ?? {};
  report.seals.total++;
  report.seals.byTarget[seal.target ?? ""] = (report.seals.byTarget[seal.target ?? ""] ?? 0) + 1;
  report.seals.byRank[seal.rank ?? ""] = (report.seals.byRank[seal.rank ?? ""] ?? 0) + 1;

  const missing = REQUIRED_SEAL_FIELDS.filter(field => seal[field] === undefined || seal[field] === null || seal[field] === "");
  if ( missing.length ) report.seals.missingFields.push({ file: relative(file), name: doc.name, missing });

  if ( (system.price?.denomination !== "ryo") || !Number.isFinite(Number(system.price?.value)) ) {
    report.seals.missingRyoPrice.push({ file: relative(file), name: doc.name, price: system.price ?? null });
  }

  if ( !Array.isArray(doc.effects) || !doc.effects.length ) {
    report.seals.missingEffects.push({ file: relative(file), name: doc.name });
  }
}

function auditArmor({ file, doc }, report) {
  const system = doc.system ?? {};
  report.armors.total++;
  const missing = REQUIRED_ARMOR_FIELDS.filter(field => {
    const value = system.armor?.[field];
    return value === undefined || value === null || value === "";
  });
  if ( !system.seals?.quality ) missing.push("seals.quality");
  if ( missing.length ) report.armors.missingFields.push({ file: relative(file), name: doc.name, missing });
}

function printReport(report) {
  console.log("N5eB Enhancement Seal Audit");
  console.log(`Seals: ${report.seals.total}`);
  console.log(`  Targets: ${Object.entries(report.seals.byTarget).map(([k, v]) => `${k || "blank"}=${v}`).join(", ")}`);
  console.log(`  Ranks: ${Object.entries(report.seals.byRank).map(([k, v]) => `${k || "blank"}=${v}`).join(", ")}`);
  console.log(`Armors with N5eB armor fields: ${report.armors.total}`);
  console.log(`Seal-capable targets: ${report.targets.weapons} weapons, ${report.targets.armors} armors, ${report.targets.containers} containers, ${report.targets.equipment} other equipment`);
  console.log(`Explicit source slot data: ${report.targets.explicitSealSlots}`);
  console.log(`Schema-default slot data: ${report.targets.implicitSchemaSealSlots.length}`);

  printIssues("Missing seal fields", report.seals.missingFields);
  printIssues("Missing Ryo prices", report.seals.missingRyoPrice);
  printIssues("Seals without effects", report.seals.missingEffects);
  printIssues("Armor field issues", report.armors.missingFields);
  printIssues("Parse errors", report.parseErrors);
}

function printIssues(label, rows) {
  if ( !rows.length ) return;
  console.log("");
  console.log(`${label}:`);
  for ( const row of rows ) console.log(`  - ${row.file}: ${row.name ?? row.error}`);
}

function relative(file) {
  return path.relative(SYSTEM_ROOT, file).replaceAll(path.sep, "/");
}
