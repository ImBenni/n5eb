/* eslint-disable jsdoc/require-jsdoc, max-len */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "..");
const SYSTEM_JSON = path.join(SYSTEM_ROOT, "system.json");
const PACKAGE_JSON = path.join(SYSTEM_ROOT, "package.json");
const MIGRATION_MODULE = path.join(SYSTEM_ROOT, "module", "migration.mjs");
const LEGACY_MODULE = path.join(SYSTEM_ROOT, "module", "legacy-migration.mjs");
const SETTINGS_MODULE = path.join(SYSTEM_ROOT, "module", "settings.mjs");

const REQUIRED_JSON = {
  "icon-migration.json": "object",
  "spell-icon-migration.json": "object",
  "legacy-pack-uuid-map.json": "object",
  "asset-path-map.json": "object",
  "book-parity-fixes.json": "array"
};

const REQUIRED_MIGRATION_EXPORTS = [
  "getTargetMigrationVersion",
  "cleanLegacyDeletionKeys",
  "previewLegacyMigration",
  "promptLegacyMigration",
  "runLegacyMigration",
  "migrateWorld",
  "ensureN5eBCompendiumFolders",
  "migrateActorData",
  "migrateItemData",
  "migrateSceneData",
  "getMigrationData"
];

const REQUIRED_INTERNAL_HELPERS = [
  "_migrateLegacyPackUUIDs",
  "_migrateN5eBAffinityTrait",
  "_migrateN5eBAffinityEffectKeys",
  "_migrateN5eBConditionEffect",
  "_migrateN5eBEquipmentPackAliases",
  "_migrateActorDowntimeCosts",
  "_migrateDowntimeTemplateCost",
  "_migrateN5eBArmorAndSeals",
  "_migrateN5eBBookParityFixes",
  "_migrateN5eBActorToolKits",
  "_migrateJutsuChakraScaling",
  "_migrateN5eBClassmodArts"
];

const REQUIRED_SETTINGS = [
  "systemMigrationVersion",
  "legacyDeletionKeyCleanupVersion",
  "legacyMigrationConfirmed",
  "legacyMigrationReport"
];

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-migrations")
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
    manifest: {
      version: "",
      needsMigrationVersion: "",
      compatibleMigrationVersion: "",
      issues: []
    },
    packageScripts: {
      present: [],
      missing: []
    },
    migrationModule: {
      exports: [],
      missingExports: [],
      helpers: [],
      missingHelpers: [],
      fetchesRequiredJson: [],
      missingFetches: []
    },
    settings: {
      present: [],
      missing: []
    },
    legacyModule: {
      issues: []
    },
    json: {
      files: [],
      issues: [],
      missingAssetTargets: [],
      missingBookParitySources: [],
      invalidUuidEntries: []
    }
  };

  auditManifest(report);
  auditPackageScripts(report);
  auditMigrationModule(report);
  auditSettings(report);
  auditLegacyModule(report);
  auditMigrationJson(report);
  return report;
}

function auditManifest(report) {
  const system = readJson(SYSTEM_JSON, report.manifest.issues);
  if ( !system ) return;

  report.manifest.version = system.version ?? "";
  report.manifest.needsMigrationVersion = system.flags?.needsMigrationVersion ?? "";
  report.manifest.compatibleMigrationVersion = system.flags?.compatibleMigrationVersion ?? "";

  for ( const [key, value] of Object.entries(report.manifest) ) {
    if ( key === "issues" ) continue;
    if ( !value ) report.manifest.issues.push(`system.json is missing ${key}.`);
  }
  if ( !isVersionLike(report.manifest.version) ) {
    report.manifest.issues.push(`system.json version is not version-like: ${report.manifest.version}`);
  }
  if ( !isVersionLike(report.manifest.needsMigrationVersion) ) {
    report.manifest.issues.push(`system.json flags.needsMigrationVersion is not version-like: ${report.manifest.needsMigrationVersion}`);
  }
}

function auditPackageScripts(report) {
  const pkg = readJson(PACKAGE_JSON, report.packageScripts.missing);
  const scripts = pkg?.scripts ?? {};
  for ( const script of ["audit:migrations", "audit:playtest"] ) {
    if ( scripts[script] ) report.packageScripts.present.push(script);
    else report.packageScripts.missing.push(`package.json missing ${script}.`);
  }
}

function auditMigrationModule(report) {
  const source = fs.readFileSync(MIGRATION_MODULE, "utf8");
  for ( const name of REQUIRED_MIGRATION_EXPORTS ) {
    if ( new RegExp(`export\\s+(?:async\\s+)?function\\s+${escapeRegExp(name)}\\b`).test(source) ) {
      report.migrationModule.exports.push(name);
    } else {
      report.migrationModule.missingExports.push(name);
    }
  }
  for ( const name of REQUIRED_INTERNAL_HELPERS ) {
    if ( new RegExp(`function\\s+${escapeRegExp(name)}\\b`).test(source) ) report.migrationModule.helpers.push(name);
    else report.migrationModule.missingHelpers.push(name);
  }
  for ( const file of Object.keys(REQUIRED_JSON) ) {
    if ( source.includes(`json/${file}`) ) report.migrationModule.fetchesRequiredJson.push(file);
    else report.migrationModule.missingFetches.push(file);
  }
}

function auditSettings(report) {
  const source = fs.readFileSync(SETTINGS_MODULE, "utf8");
  for ( const setting of REQUIRED_SETTINGS ) {
    if ( source.includes(`"${setting}"`) ) report.settings.present.push(setting);
    else report.settings.missing.push(setting);
  }
}

function auditLegacyModule(report) {
  const source = fs.readFileSync(LEGACY_MODULE, "utf8");
  for ( const required of [
    "LEGACY_N5EB_SYSTEM_IDS",
    "LEGACY_N5EB_VERSION_CUTOFF",
    "preserveLegacyN5eBSource",
    "collectUnmappedLegacyPaths",
    "KNOWN_MAPPED_LEGACY_PATHS"
  ] ) {
    if ( !source.includes(required) ) report.legacyModule.issues.push(`module/legacy-migration.mjs missing ${required}.`);
  }
}

function auditMigrationJson(report) {
  const jsonRoot = path.join(SYSTEM_ROOT, "json");
  const loaded = {};
  for ( const [file, expectedType] of Object.entries(REQUIRED_JSON) ) {
    const fullPath = path.join(jsonRoot, file);
    const issues = [];
    const data = readJson(fullPath, issues);
    const count = Array.isArray(data) ? data.length : Object.keys(data ?? {}).length;
    report.json.files.push({ file, type: Array.isArray(data) ? "array" : typeof data, count });
    report.json.issues.push(...issues);
    if ( !data ) continue;
    const actualType = Array.isArray(data) ? "array" : "object";
    if ( actualType !== expectedType ) {
      report.json.issues.push(`${file} expected ${expectedType}, got ${actualType}.`);
      continue;
    }
    if ( count === 0 ) report.json.issues.push(`${file} is empty.`);
    loaded[file] = data;
  }

  auditUuidMap(loaded["legacy-pack-uuid-map.json"] ?? {}, report);
  auditAssetPathMap(loaded["asset-path-map.json"] ?? {}, report);
  auditBookParityFixes(loaded["book-parity-fixes.json"] ?? [], report);
  auditIconMaps(loaded["icon-migration.json"] ?? {}, loaded["spell-icon-migration.json"] ?? {}, report);
}

function auditUuidMap(map, report) {
  const fromUuidRe = /^Compendium\.(?:n5eb|world)\.[A-Za-z0-9-]+\.(?:Actor|Item|JournalEntry)\.[A-Za-z0-9]{16}$/;
  const toUuidRe = /^Compendium\.n5eb\.[A-Za-z0-9-]+\.(?:Actor|Item|JournalEntry)\.[A-Za-z0-9]{16}$/;
  for ( const [from, to] of Object.entries(map) ) {
    if ( fromUuidRe.test(from) && toUuidRe.test(to) ) continue;
    report.json.invalidUuidEntries.push({ from, to });
    if ( report.json.invalidUuidEntries.length >= 25 ) break;
  }
}

function auditAssetPathMap(map, report) {
  const missing = new Set();
  for ( const target of new Set(Object.values(map)) ) {
    if ( !target.startsWith("systems/n5eb/") ) continue;
    const file = path.join(SYSTEM_ROOT, target.replace(/^systems\/n5eb\//, ""));
    if ( !fs.existsSync(file) ) missing.add(target);
    if ( missing.size >= 50 ) break;
  }
  report.json.missingAssetTargets = Array.from(missing);
}

function auditBookParityFixes(fixes, report) {
  for ( const fix of fixes ) {
    if ( !fix.sourceId || !Array.isArray(fix.changes) || !fix.changes.length ) {
      report.json.issues.push(`Invalid book parity fix row for ${fix.currentSourcePath ?? fix.sourcePath ?? "unknown"}.`);
    }
    if ( fix.currentSourcePath ) {
      const source = path.join(SYSTEM_ROOT, fix.currentSourcePath);
      if ( !fs.existsSync(source) ) report.json.missingBookParitySources.push(fix.currentSourcePath);
    }
  }
}

function auditIconMaps(iconMap, spellIconMap, report) {
  for ( const [mapName, map] of [["icon-migration.json", iconMap], ["spell-icon-migration.json", spellIconMap]] ) {
    for ( const target of new Set(Object.values(map)) ) {
      if ( !target.startsWith("systems/n5eb/") ) continue;
      const file = path.join(SYSTEM_ROOT, target.replace(/^systems\/n5eb\//, ""));
      if ( fs.existsSync(file) ) continue;
      report.json.issues.push(`${mapName} target does not exist: ${target}`);
      if ( report.json.issues.length >= 50 ) return;
    }
  }
}

function readJson(file, issues) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(err) {
    issues.push(`${relative(file)}: ${err.message}`);
    return null;
  }
}

function hasFailures(report) {
  return report.manifest.issues.length
    || report.packageScripts.missing.length
    || report.migrationModule.missingExports.length
    || report.migrationModule.missingHelpers.length
    || report.migrationModule.missingFetches.length
    || report.settings.missing.length
    || report.legacyModule.issues.length
    || report.json.issues.length
    || report.json.missingAssetTargets.length
    || report.json.missingBookParitySources.length
    || report.json.invalidUuidEntries.length;
}

function printReport(report) {
  console.log("N5eB Migration Smoke Audit");
  console.log(`Manifest: system ${report.manifest.version}, migration ${report.manifest.needsMigrationVersion}`);
  console.log(`JSON files: ${report.json.files.map(row => `${row.file}=${row.count}`).join(", ")}`);
  console.log(`Migration exports: ${report.migrationModule.exports.length}/${REQUIRED_MIGRATION_EXPORTS.length}`);
  console.log(`Migration helpers: ${report.migrationModule.helpers.length}/${REQUIRED_INTERNAL_HELPERS.length}`);
  console.log(`Migration settings: ${report.settings.present.length}/${REQUIRED_SETTINGS.length}`);
  console.log(`Asset path targets missing: ${report.json.missingAssetTargets.length}`);
  console.log(`Book parity source files missing: ${report.json.missingBookParitySources.length}`);
  console.log(`Invalid UUID map entries: ${report.json.invalidUuidEntries.length}`);

  const failures = [
    ...report.manifest.issues,
    ...report.packageScripts.missing,
    ...report.migrationModule.missingExports.map(name => `Missing migration export: ${name}`),
    ...report.migrationModule.missingHelpers.map(name => `Missing migration helper: ${name}`),
    ...report.migrationModule.missingFetches.map(name => `getMigrationData does not fetch ${name}`),
    ...report.settings.missing.map(name => `Missing migration setting: ${name}`),
    ...report.legacyModule.issues,
    ...report.json.issues,
    ...report.json.missingAssetTargets.map(name => `Missing migrated asset target: ${name}`),
    ...report.json.missingBookParitySources.map(name => `Missing book parity source: ${name}`),
    ...report.json.invalidUuidEntries.map(row => `Invalid UUID map row: ${row.from} -> ${row.to}`)
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

function isVersionLike(value) {
  return /^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/.test(`${value ?? ""}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relative(file) {
  return path.relative(SYSTEM_ROOT, file).replaceAll(path.sep, "/");
}
