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
const CONDITIONS_MODULE = path.join(SYSTEM_ROOT, "module", "conditions.mjs");
const CONDITION_SOURCE_ROOT = path.join(SYSTEM_ROOT, "packs", "_source", "conditions");
const LANG_EN = path.join(SYSTEM_ROOT, "lang", "en.json");

const EXPECTED_CONDITION_COUNT = 31;
const EXPECTED_ALIASES = {
  burned: ["burning"],
  envenomed: ["poisoned", "poisoned-envenomed"],
  demoralized: ["fear", "fear-demoralized", "frightened"]
};
const EXPECTED_DAMAGE = {
  burned: ["turnStart", "fire"],
  shocked: ["reaction", "lightning"],
  envenomed: ["turnStart", "poison"],
  bleeding: ["turnStart", "necrotic"],
  lacerated: ["turnStart", "necrotic"]
};
const EXPECTED_REST_BLOCKED = ["envenomed", "bleeding", "lacerated", "concussed"];
const EXPECTED_OVERFLOW = {
  bruised: "staggered",
  bleeding: "lacerated"
};
const REQUIRED_RUNTIME_MARKERS = [
  "configureConditionTypes",
  "registerConditionHooks",
  "getConditionTooltip",
  "applyTurnStartConditions",
  "applyTurnEndConditions",
  "expireDazedAtTurnEnd",
  "applyShockedReactionDamage",
  "applyBruisedBonusDamage",
  "adjustConditionApplicationRank",
  "warnActivityRestrictions",
  "checkShockedReaction",
  "getRestBlockingConditions",
  "onPreRest",
  "onRestCompleted"
];

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-conditions")
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
  const moduleSource = fs.readFileSync(CONDITIONS_MODULE, "utf8");
  const lang = JSON.parse(fs.readFileSync(LANG_EN, "utf8"));
  const registry = parseConditionRegistry(moduleSource);
  const source = loadConditionSourceDocuments();
  const report = {
    registry: {
      count: registry.size,
      missingExpectedCount: registry.size === EXPECTED_CONDITION_COUNT ? [] : [`Expected ${EXPECTED_CONDITION_COUNT} conditions, found ${registry.size}.`],
      missingRuntimeMarkers: REQUIRED_RUNTIME_MARKERS.filter(marker => !moduleSource.includes(marker)),
      missingLocalization: [],
      missingIcons: [],
      missingAliases: [],
      missingDamageAutomation: [],
      missingRestBlocked: [],
      missingOverflow: []
    },
    compendium: {
      count: source.documents.length,
      parseErrors: source.parseErrors,
      missingDocuments: [],
      extraDocuments: [],
      invalidDocuments: []
    },
    summary: {
      ranked: [],
      unranked: [],
      aliases: EXPECTED_ALIASES,
      damageAutomated: EXPECTED_DAMAGE,
      restBlocked: EXPECTED_REST_BLOCKED
    }
  };

  auditRegistry({ registry, lang, report });
  auditConditionCompendium({ registry, documents: source.documents, report });
  return report;
}

function parseConditionRegistry(source) {
  const start = source.indexOf("export const CONDITIONS = {");
  const end = source.indexOf("export const CONDITION_ALIASES", start);
  const registrySource = source.slice(start, end);
  const ids = Array.from(registrySource.matchAll(/^ {2}([a-z][a-z0-9-]*): \{/gm)).map(match => ({
    id: match[1],
    start: match.index
  }));
  const registry = new Map();
  for ( let i = 0; i < ids.length; i++ ) {
    const { id, start } = ids[i];
    const blockEnd = ids[i + 1]?.start ?? registrySource.lastIndexOf("};");
    const block = registrySource.slice(start, blockEnd);
    const name = block.match(/name:\s+"([^"]+)"/)?.[1] ?? "";
    const img = block.match(/img:\s+`?\$\{STATUS_ICON\}\/([^"`]+)`?/)?.[1] ?? "";
    const category = block.match(/category:\s+"([^"]+)"/)?.[1] ?? "";
    const ranked = /\branked:\s+true\b/.test(block);
    const maxRank = Number(block.match(/maxRank:\s+(\d+)/)?.[1] ?? (ranked ? 5 : 1));
    const aliases = Array.from(block.matchAll(/aliases:\s+\[([^\]]*)\]/g))
      .flatMap(match => Array.from(match[1].matchAll(/"([^"]+)"/g)).map(alias => alias[1]));
    const restBlocked = /\brestBlocked:\s+true\b/.test(block);
    const damage = ["turnStart", "reaction", "movement"].reduce((arr, trigger) => {
      const triggerIndex = block.indexOf(`${trigger}:`);
      if ( triggerIndex === -1 ) return arr;
      const nextTriggerIndex = ["turnStart", "reaction", "movement"]
        .filter(candidate => candidate !== trigger)
        .map(candidate => block.indexOf(`${candidate}:`, triggerIndex + trigger.length))
        .filter(index => index !== -1)
        .sort((a, b) => a - b)[0] ?? block.length;
      const triggerBlock = block.slice(triggerIndex, nextTriggerIndex);
      const type = triggerBlock.match(/type:\s+"([^"]+)"/)?.[1];
      if ( type ) arr.push({ trigger, type });
      return arr;
    }, []);
    const overflow = block.match(/overflow:\s+\{\s+condition:\s+"([^"]+)"/)?.[1] ?? "";
    registry.set(id, { id, name, img, iconPath: img ? `systems/n5eb/icons/svg/statuses/${img}` : "", category, ranked, maxRank, aliases, restBlocked, damage, overflow });
  }
  return registry;
}

function loadConditionSourceDocuments() {
  const documents = [];
  const parseErrors = [];
  for ( const file of findSourceFiles(CONDITION_SOURCE_ROOT) ) {
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

function auditRegistry({ registry, lang, report }) {
  for ( const [id, condition] of registry ) {
    if ( !condition.name || !Object.hasOwn(lang, condition.name) ) report.registry.missingLocalization.push(id);
    if ( !condition.iconPath || !fs.existsSync(path.join(SYSTEM_ROOT, condition.iconPath.replace(/^systems\/n5eb\//, ""))) ) {
      report.registry.missingIcons.push({ id, img: condition.iconPath });
    }
    if ( condition.ranked ) report.summary.ranked.push({ id, maxRank: condition.maxRank });
    else report.summary.unranked.push(id);
  }

  for ( const [id, aliases] of Object.entries(EXPECTED_ALIASES) ) {
    const condition = registry.get(id);
    const missing = aliases.filter(alias => !condition?.aliases.includes(alias));
    if ( missing.length ) report.registry.missingAliases.push({ id, missing });
  }

  for ( const [id, [trigger, type]] of Object.entries(EXPECTED_DAMAGE) ) {
    const condition = registry.get(id);
    if ( !condition?.damage.some(row => row.trigger === trigger && row.type === type) ) {
      report.registry.missingDamageAutomation.push({ id, trigger, type });
    }
  }

  for ( const id of EXPECTED_REST_BLOCKED ) {
    if ( !registry.get(id)?.restBlocked ) report.registry.missingRestBlocked.push(id);
  }

  for ( const [id, overflow] of Object.entries(EXPECTED_OVERFLOW) ) {
    if ( registry.get(id)?.overflow !== overflow ) report.registry.missingOverflow.push({ id, overflow });
  }
}

function auditConditionCompendium({ registry, documents, report }) {
  const byIdentifier = new Map();
  for ( const row of documents ) {
    const identifier = row.doc.system?.identifier;
    if ( identifier ) byIdentifier.set(identifier, row);
  }

  for ( const id of registry.keys() ) {
    if ( !byIdentifier.has(id) ) report.compendium.missingDocuments.push(id);
  }
  for ( const row of documents ) {
    const doc = row.doc;
    const identifier = doc.system?.identifier;
    const condition = registry.get(identifier);
    if ( !condition ) {
      report.compendium.extraDocuments.push({ file: relative(row.file), identifier });
      continue;
    }
    const issues = [];
    if ( doc.type !== "feat" ) issues.push(`type is ${doc.type}, expected feat`);
    if ( doc.img !== condition.iconPath ) issues.push(`img mismatch: ${doc.img} != ${condition.iconPath}`);
    if ( !doc.system?.description?.value ) issues.push("missing description");
    const effects = Array.isArray(doc.effects) ? doc.effects : [];
    const effect = effects.find(e => e.flags?.n5eb?.condition?.id === identifier);
    if ( !effect ) issues.push("missing native n5eb condition effect");
    else {
      const flags = effect.flags?.n5eb?.condition ?? {};
      if ( flags.category !== condition.category ) issues.push(`effect category mismatch: ${flags.category} != ${condition.category}`);
      if ( condition.ranked && (Number(flags.maxRank) !== condition.maxRank) ) {
        issues.push(`effect maxRank mismatch: ${flags.maxRank} != ${condition.maxRank}`);
      }
      if ( effect.img !== condition.iconPath ) issues.push(`effect img mismatch: ${effect.img} != ${condition.iconPath}`);
    }
    if ( issues.length ) report.compendium.invalidDocuments.push({ file: relative(row.file), identifier, issues });
  }
}

function hasFailures(report) {
  return report.registry.missingExpectedCount.length
    || report.registry.missingRuntimeMarkers.length
    || report.registry.missingLocalization.length
    || report.registry.missingIcons.length
    || report.registry.missingAliases.length
    || report.registry.missingDamageAutomation.length
    || report.registry.missingRestBlocked.length
    || report.registry.missingOverflow.length
    || report.compendium.parseErrors.length
    || report.compendium.missingDocuments.length
    || report.compendium.extraDocuments.length
    || report.compendium.invalidDocuments.length;
}

function printReport(report) {
  console.log("N5eB Condition Audit");
  console.log(`Registry conditions: ${report.registry.count}`);
  console.log(`Compendium condition docs: ${report.compendium.count}`);
  console.log(`Ranked conditions: ${report.summary.ranked.length}`);
  console.log(`Unranked conditions: ${report.summary.unranked.length}`);
  console.log(`Missing localization: ${report.registry.missingLocalization.length}`);
  console.log(`Missing icons: ${report.registry.missingIcons.length}`);
  console.log(`Missing compendium docs: ${report.compendium.missingDocuments.length}`);
  console.log(`Invalid compendium docs: ${report.compendium.invalidDocuments.length}`);
  console.log(`Runtime markers missing: ${report.registry.missingRuntimeMarkers.length}`);

  const failures = [
    ...report.registry.missingExpectedCount,
    ...report.registry.missingRuntimeMarkers.map(marker => `Missing condition runtime marker: ${marker}`),
    ...report.registry.missingLocalization.map(id => `Missing localization for ${id}`),
    ...report.registry.missingIcons.map(row => `Missing icon for ${row.id}: ${row.img}`),
    ...report.registry.missingAliases.map(row => `Missing aliases for ${row.id}: ${row.missing.join(", ")}`),
    ...report.registry.missingDamageAutomation.map(row => `Missing damage automation for ${row.id}: ${row.trigger}/${row.type}`),
    ...report.registry.missingRestBlocked.map(id => `Missing restBlocked flag for ${id}`),
    ...report.registry.missingOverflow.map(row => `Missing overflow for ${row.id}: ${row.overflow}`),
    ...report.compendium.parseErrors.map(row => `${row.file}: ${row.error}`),
    ...report.compendium.missingDocuments.map(id => `Missing condition compendium document: ${id}`),
    ...report.compendium.extraDocuments.map(row => `Extra condition document ${row.identifier} at ${row.file}`),
    ...report.compendium.invalidDocuments.map(row => `${row.file}: ${row.issues.join("; ")}`)
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
