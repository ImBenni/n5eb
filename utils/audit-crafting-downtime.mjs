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
const DOWNTIME_ROOT = path.join(SYSTEM_ROOT, "packs", "_source", "downtime-activities");
const ITEM_ROOT = path.join(SYSTEM_ROOT, "packs", "_source", "items");

const EXPECTED_TEMPLATES = {
  "crafting-non-enhanced-items": {
    file: "crafting-non-enhanced-items.yml",
    name: "Crafting Non-Enhanced Items",
    minWeeks: 1,
    targetTypes: ["item"]
  },
  "crafting-chakra-enhanced-items": {
    file: "crafting-chakra-enhanced-items.yml",
    name: "Crafting Chakra-Enhanced Items",
    minWeeks: 2,
    targetTypes: ["item-or-seal"]
  }
};

const EXPECTED_SEAL_RANKS = {
  d: { slots: 1, level: 1, craftingDC: 14, downtime: 2 },
  c: { slots: 2, level: 5, craftingDC: 18, downtime: 4 },
  b: { slots: 3, level: 9, craftingDC: 22, downtime: 8 },
  a: { slots: 4, level: 13, craftingDC: 26, downtime: 12 },
  s: { slots: 5, level: 17, craftingDC: 30, downtime: 20 }
};

const REQUIRED_CODE_MARKERS = {
  "module/applications/actor/character-sheet.mjs": [
    "applyDowntimeCraftingTarget",
    "claimDowntimeCraftingResult",
    "getDowntimeCraftingContribution",
    "Math.ceil(price / 2)",
    "mastery >= 1 ? 150 : 100",
    "game.items.fromCompendium",
    "flags.n5eb.downtimeCrafting",
    "N5EB.DOWNTIME.Crafting.SealTargetNote",
    "N5EB.DOWNTIME.Crafting.TargetNote"
  ],
  "module/data/actor/character.mjs": [
    "downtime:",
    "identifier",
    "result",
    "itemUuid",
    "claimedAt"
  ],
  "module/data/item/downtime.mjs": [
    "identifier",
    "N5EB.DOWNTIME.Category.Label",
    "N5EB.DOWNTIME.Target.Label"
  ],
  "templates/actors/tabs/character-downtime.hbs": [
    "claimDowntimeCraftingResult",
    "activity.crafting.canClaim",
    "N5EB.DOWNTIME.Crafting.DropTarget"
  ]
};

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-crafting-downtime")
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

const report = buildReport();

if ( argv.out ) {
  fs.mkdirSync(path.dirname(path.resolve(argv.out)), { recursive: true });
  fs.writeFileSync(path.resolve(argv.out), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}

if ( argv.json ) console.log(JSON.stringify(report, null, 2));
else printReport(report);

if ( hasFailures(report) ) process.exitCode = 1;

function buildReport() {
  const report = {
    parseErrors: [],
    templates: {
      total: 0,
      missing: [],
      invalid: []
    },
    seals: {
      total: 0,
      missingCraftingFields: [],
      missingRyoPrice: []
    },
    sealRanks: {
      invalid: []
    },
    code: {
      missingMarkers: []
    }
  };

  auditTemplates(report);
  auditSealRanks(report);
  auditSeals(report);
  auditCodeMarkers(report);
  return report;
}

function auditTemplates(report) {
  for ( const [identifier, expected] of Object.entries(EXPECTED_TEMPLATES) ) {
    const file = path.join(DOWNTIME_ROOT, expected.file);
    if ( !fs.existsSync(file) ) {
      report.templates.missing.push({ identifier, file: relative(file) });
      continue;
    }

    const doc = loadYaml(file, report);
    if ( !doc ) continue;
    report.templates.total++;
    const system = doc.system ?? {};
    const invalid = [];
    if ( doc.type !== "downtime" ) invalid.push(`type=${doc.type}`);
    if ( doc.name !== expected.name ) invalid.push(`name=${doc.name}`);
    if ( system.identifier !== identifier ) invalid.push(`identifier=${system.identifier}`);
    if ( system.category !== "crafting" ) invalid.push(`category=${system.category}`);
    if ( Number(system.weeks?.max ?? 0) < expected.minWeeks ) invalid.push(`weeks.max=${system.weeks?.max}`);
    if ( !expected.targetTypes.includes(system.target?.type) ) invalid.push(`target.type=${system.target?.type}`);
    if ( !system.roll?.enabled ) invalid.push("roll.enabled=false");
    if ( system.roll?.ability !== "int" ) invalid.push(`roll.ability=${system.roll?.ability}`);
    if ( system.roll?.skill !== "cra" ) invalid.push(`roll.skill=${system.roll?.skill}`);
    if ( system.source?.book !== "Naruto 5e" ) invalid.push(`source.book=${system.source?.book}`);
    if ( invalid.length ) report.templates.invalid.push({ identifier, file: relative(file), invalid });
  }
}

function auditSealRanks(report) {
  const config = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "config.mjs"), "utf8");
  for ( const [rank, expected] of Object.entries(EXPECTED_SEAL_RANKS) ) {
    const pattern = new RegExp(`${rank}: \\{[^}]*slots: ${expected.slots}[^}]*level: ${expected.level}[^}]*craftingDC: ${expected.craftingDC}[^}]*downtime: ${expected.downtime}`, "s");
    if ( !pattern.test(config) ) report.sealRanks.invalid.push({ rank, expected });
  }
}

function auditSeals(report) {
  for ( const file of findSourceFiles(path.join(ITEM_ROOT, "seals")) ) {
    const doc = loadYaml(file, report);
    if ( !doc || doc._key === "!folders" ) continue;
    if ( doc.type !== "consumable" ) continue;
    const seal = doc.system?.seal ?? {};
    if ( !seal.target && !seal.rank ) continue;
    report.seals.total++;
    const missing = ["target", "rank", "slots", "baseName", "level", "craftingDC", "downtime"].filter(key => {
      const value = seal[key];
      return value === undefined || value === null || value === "";
    });
    if ( missing.length ) report.seals.missingCraftingFields.push({ file: relative(file), name: doc.name, missing });
    if ( (doc.system?.price?.denomination !== "ryo") || !Number.isFinite(Number(doc.system?.price?.value)) ) {
      report.seals.missingRyoPrice.push({ file: relative(file), name: doc.name, price: doc.system?.price ?? null });
    }
  }
}

function auditCodeMarkers(report) {
  for ( const [file, markers] of Object.entries(REQUIRED_CODE_MARKERS) ) {
    const sourcePath = path.join(SYSTEM_ROOT, file);
    if ( !fs.existsSync(sourcePath) ) {
      report.code.missingMarkers.push({ file, markers: ["<file missing>"] });
      continue;
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    const missing = markers.filter(marker => !source.includes(marker));
    if ( missing.length ) report.code.missingMarkers.push({ file, markers: missing });
  }
}

function loadYaml(file, report) {
  try {
    return YAML.load(fs.readFileSync(file, "utf8"));
  } catch(err) {
    report.parseErrors.push({ file: relative(file), error: err.message });
    return null;
  }
}

function* findSourceFiles(dir) {
  if ( !fs.existsSync(dir) ) return;
  for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
    const file = path.join(dir, entry.name);
    if ( entry.isDirectory() ) yield* findSourceFiles(file);
    else if ( entry.isFile() && entry.name.endsWith(".yml") && (entry.name !== "_folder.yml") ) yield file;
  }
}

function hasFailures(report) {
  return Boolean(
    report.parseErrors.length
    || report.templates.missing.length
    || report.templates.invalid.length
    || report.seals.missingCraftingFields.length
    || report.seals.missingRyoPrice.length
    || report.sealRanks.invalid.length
    || report.code.missingMarkers.length
  );
}

function printReport(report) {
  console.log("N5eB Crafting Downtime Audit");
  console.log(`Templates: ${report.templates.total}/${Object.keys(EXPECTED_TEMPLATES).length}`);
  console.log(`Enhancement seals with crafting metadata: ${report.seals.total}`);

  printIssues("Missing templates", report.templates.missing);
  printIssues("Invalid templates", report.templates.invalid);
  printIssues("Invalid seal rank config", report.sealRanks.invalid);
  printIssues("Seals missing crafting fields", report.seals.missingCraftingFields);
  printIssues("Seals missing Ryo prices", report.seals.missingRyoPrice);
  printIssues("Missing code markers", report.code.missingMarkers);
  printIssues("Parse errors", report.parseErrors);

  if ( !hasFailures(report) ) {
    console.log("PASS: Crafting downtime templates, target helpers, claim workflow, seal rank data, and seal crafting metadata are present.");
  }
}

function printIssues(label, rows) {
  if ( !rows.length ) return;
  console.log("");
  console.log(`${label}: ${rows.length}`);
  for ( const row of rows.slice(0, 20) ) console.log(`  - ${JSON.stringify(row)}`);
  if ( rows.length > 20 ) console.log(`  ... ${rows.length - 20} more`);
}

function relative(file) {
  return path.relative(SYSTEM_ROOT, file);
}
