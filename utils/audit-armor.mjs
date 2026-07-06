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
const ARMOR_SOURCE_ROOT = path.join(SYSTEM_ROOT, "packs", "_source", "items", "armors");

const EXPECTED_ARMORS = 18;
const ARMOR_TYPES = new Set(["light", "medium", "heavy"]);
const REQUIRED_ARMOR_FIELDS = ["bonus", "dexCap", "dr", "don", "doff"];
const REQUIRED_ARMOR_PROPERTIES = [
  "bulky", "bulwark", "camouflage", "fashionable", "fortified",
  "heavyweight", "highQuality", "lightweight", "reinforced", "threatening"
];
const REQUIRED_SOURCE_PROPERTIES = new Set(["reinforced", "lightweight", "bulky", "fortified", "highQuality"]);

const REQUIRED_CODE_MARKERS = {
  "module/data/actor/templates/attributes.mjs": [
    "10 + armorBonus + dex + prof",
    "Math.floor((this.attributes.prof ?? 0) / 2)",
    "N5EB.ARMOR.Warning.NonProficient",
    "getExhaustionPenalty",
    "getConditionACPenalty"
  ],
  "module/seals.mjs": [
    "BPS_DAMAGE_TYPES",
    "applyArmorDamageReduction",
    "getArmorDexBonus",
    "isArmorProficient",
    "getNonProficientArmor",
    "N5EB.ARMOR.Warning.NonProficientCasting",
    "normalizeArmorProperties"
  ],
  "module/applications/components/damage-application.mjs": [
    "n5ebArmorDR",
    "getArmorDRSourceHTML",
    "N5EB.ARMOR.DRTooltip"
  ],
  "templates/items/details/details-equipment.hbs": [
    "N5EB.ARMOR.Bonus",
    "N5EB.ARMOR.DexCap",
    "N5EB.ARMOR.DR",
    "N5EB.ARMOR.Time",
    "dnd5e.details-seals"
  ],
  "lang/en.json": [
    "N5EB.ARMOR.Bonus",
    "N5EB.ARMOR.Warning.NonProficient",
    "N5EB.ARMOR.Warning.NonProficientCasting",
    "N5EB.ARMOR.DRTooltip"
  ]
};

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-armor")
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
  const source = loadArmorSourceDocuments();
  const report = {
    source: {
      total: source.documents.length,
      byType: {},
      parseErrors: source.parseErrors,
      missingFields: [],
      invalidDexCaps: [],
      invalidSealSlots: [],
      propertyCoverage: {},
      missingSourceProperties: []
    },
    code: {
      missingMarkers: []
    }
  };

  for ( const row of source.documents ) auditArmorDocument(row, report);
  for ( const property of REQUIRED_SOURCE_PROPERTIES ) {
    if ( !report.source.propertyCoverage[property] ) report.source.missingSourceProperties.push(property);
  }
  auditCodeMarkers(report);
  return report;
}

function loadArmorSourceDocuments() {
  const documents = [];
  const parseErrors = [];
  for ( const file of findSourceFiles(ARMOR_SOURCE_ROOT) ) {
    try {
      const doc = YAML.load(fs.readFileSync(file, "utf8"));
      if ( doc?._key === "!folders" ) continue;
      if ( !doc ) continue;
      if ( doc.type === "equipment" && ARMOR_TYPES.has(doc.system?.type?.value) ) documents.push({ file, doc });
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

function auditArmorDocument({ file, doc }, report) {
  const system = doc.system ?? {};
  const armor = system.armor ?? {};
  const type = system.type?.value ?? "";
  report.source.byType[type] = (report.source.byType[type] ?? 0) + 1;

  for ( const field of REQUIRED_ARMOR_FIELDS ) {
    const value = armor[field];
    if ( value === undefined || value === null || value === "" ) {
      report.source.missingFields.push({ file: relative(file), name: doc.name, field });
    }
  }

  if ( type === "light" && Number(armor.dexCap) !== 7 ) {
    report.source.invalidDexCaps.push({ file: relative(file), name: doc.name, type, dexCap: armor.dexCap, expected: 7 });
  }
  if ( type === "heavy" && Number(armor.dexCap) !== 0 ) {
    report.source.invalidDexCaps.push({ file: relative(file), name: doc.name, type, dexCap: armor.dexCap, expected: 0 });
  }

  const quality = system.seals?.quality;
  const capacity = system.seals?.capacity;
  if ( !quality ) {
    report.source.invalidSealSlots.push({ file: relative(file), name: doc.name, reason: "missing seal quality" });
  } else if ( (capacity !== null) && (capacity !== undefined) && Number(capacity) < 3 ) {
    report.source.invalidSealSlots.push({ file: relative(file), name: doc.name, reason: `configured capacity ${capacity} is below 3` });
  }

  const properties = normalizeProperties(system.properties);
  for ( const property of properties ) {
    if ( !REQUIRED_ARMOR_PROPERTIES.includes(property) ) continue;
    report.source.propertyCoverage[property] = (report.source.propertyCoverage[property] ?? 0) + 1;
  }
}

function auditCodeMarkers(report) {
  for ( const [file, markers] of Object.entries(REQUIRED_CODE_MARKERS) ) {
    const source = fs.readFileSync(path.join(SYSTEM_ROOT, file), "utf8");
    for ( const marker of markers ) {
      if ( !source.includes(marker) ) report.code.missingMarkers.push({ file, marker });
    }
  }
}

function normalizeProperties(properties) {
  if ( Array.isArray(properties) ) return properties;
  if ( properties && (typeof properties === "object") ) {
    return Object.entries(properties).filter(([, value]) => !!value).map(([key]) => key);
  }
  return [];
}

function hasFailures(report) {
  return report.source.total !== EXPECTED_ARMORS
    || report.source.parseErrors.length
    || report.source.missingFields.length
    || report.source.invalidDexCaps.length
    || report.source.invalidSealSlots.length
    || report.source.missingSourceProperties.length
    || report.code.missingMarkers.length;
}

function printReport(report) {
  console.log("N5eB Armor Audit");
  console.log(`Armor documents: ${report.source.total}`);
  console.log(`By type: ${Object.entries(report.source.byType).map(([type, count]) => `${type}=${count}`).join(", ")}`);
  console.log(`Property coverage: ${Object.entries(report.source.propertyCoverage).map(([type, count]) => `${type}=${count}`).join(", ")}`);
  console.log(`Missing fields: ${report.source.missingFields.length}`);
  console.log(`Invalid Dex caps: ${report.source.invalidDexCaps.length}`);
  console.log(`Invalid seal slots: ${report.source.invalidSealSlots.length}`);
  console.log(`Missing code markers: ${report.code.missingMarkers.length}`);

  const failures = [
    ...(report.source.total === EXPECTED_ARMORS ? [] : [`Expected ${EXPECTED_ARMORS} armors, found ${report.source.total}.`]),
    ...report.source.parseErrors.map(row => `${row.file}: ${row.error}`),
    ...report.source.missingFields.map(row => `${row.file}: ${row.name} missing ${row.field}`),
    ...report.source.invalidDexCaps.map(row => `${row.file}: ${row.name} ${row.type} Dex cap ${row.dexCap}, expected ${row.expected}`),
    ...report.source.invalidSealSlots.map(row => `${row.file}: ${row.name} invalid seal slots: ${row.reason}`),
    ...report.source.missingSourceProperties.map(property => `No source armor uses required property ${property}.`),
    ...report.code.missingMarkers.map(row => `${row.file} missing marker ${row.marker}`)
  ];

  if ( failures.length ) {
    console.log("");
    console.log("Failures");
    for ( const failure of failures.slice(0, 80) ) console.log(`- ${failure}`);
    if ( failures.length > 80 ) console.log(`- ... ${failures.length - 80} more`);
  } else {
    console.log("Result: PASS");
  }
}

function relative(file) {
  return path.relative(SYSTEM_ROOT, file).replaceAll(path.sep, "/");
}
