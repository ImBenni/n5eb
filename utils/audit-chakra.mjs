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
const PACK_SOURCE_ROOT = path.join(SYSTEM_ROOT, "packs", "_source");

const CLASS_PACKS = ["class", "hb-class", "t7-class"];
const ACTOR_PACKS = ["adversary", "hb-adversary", "t7-adversary", "npc", "hb-npc", "t7-npc", "summons", "hb-summons", "t7-summons"];
const CHAKRA_ADVANCEMENT_TYPES = new Set(["Chakra", "ChakraPoints"]);

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-chakra")
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

const records = loadRecords([...CLASS_PACKS, ...ACTOR_PACKS]);
const report = buildReport(records);

if ( argv.out ) {
  fs.mkdirSync(path.dirname(path.resolve(argv.out)), { recursive: true });
  fs.writeFileSync(path.resolve(argv.out), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}

if ( argv.json ) console.log(JSON.stringify(report, null, 2));
else printReport(report);

const blockers = [
  ...report.parseErrors,
  ...report.classIssues,
  ...report.actorIssues
];
if ( blockers.length ) process.exitCode = 1;

function loadRecords(packs) {
  const records = [];
  const parseErrors = [];
  for ( const pack of packs ) {
    const packRoot = path.join(PACK_SOURCE_ROOT, pack);
    if ( !fs.existsSync(packRoot) ) continue;
    for ( const file of findSourceFiles(packRoot) ) {
      try {
        const doc = YAML.load(fs.readFileSync(file, "utf8"));
        if ( doc ) records.push({ pack, file, doc });
      } catch(err) {
        parseErrors.push({ pack, file: relative(file), error: err.message });
      }
    }
  }
  return { records, parseErrors };
}

function* findSourceFiles(dir) {
  for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
    const file = path.join(dir, entry.name);
    if ( entry.isDirectory() ) yield* findSourceFiles(file);
    else if ( entry.isFile() && entry.name.endsWith(".yml") && (entry.name !== "_folder.yml") ) yield file;
  }
}

function buildReport({ records, parseErrors }) {
  const classRows = [];
  const classIssues = [];
  const actorRows = [];
  const actorIssues = [];

  for ( const record of records ) {
    const { doc } = record;
    if ( doc.type === "class" ) {
      const row = auditClass(record);
      classRows.push(row);
      if ( row.issues.length ) classIssues.push(row);
      continue;
    }

    if ( !["character", "npc"].includes(doc.type) ) continue;
    const row = auditActor(record);
    actorRows.push(row);
    if ( row.issues.length ) actorIssues.push(row);
  }

  return {
    checkedAt: new Date().toISOString(),
    scannedPacks: {
      classes: CLASS_PACKS,
      actors: ACTOR_PACKS
    },
    summary: {
      classes: classRows.length,
      actors: actorRows.length,
      characters: actorRows.filter(row => row.type === "character").length,
      npcs: actorRows.filter(row => row.type === "npc").length,
      adversaries: actorRows.filter(row => row.mode === "adversary").length,
      summons: actorRows.filter(row => row.mode === "summon").length,
      actorsWithSpendableJutsu: actorRows.filter(row => row.spendableJutsu.length).length
    },
    parseErrors,
    classIssues,
    actorIssues,
    classRows,
    actorRows
  };
}

function auditClass({ doc, pack, file }) {
  const advancements = advancementEntries(doc.system?.advancement);
  const chakraAdvancements = advancements.filter(advancement => CHAKRA_ADVANCEMENT_TYPES.has(advancement?.type));
  const hpAdvancements = advancements.filter(advancement => advancement?.type === "HitPoints");
  const chakraDie = doc.system?.cd?.denomination ?? doc.system?.chakraDice ?? "";
  const issues = [];

  if ( !chakraDie ) issues.push("missing-chakra-die");
  if ( !chakraAdvancements.length ) issues.push("missing-chakra-advancement");
  if ( !hpAdvancements.length ) issues.push("missing-hit-points-advancement");

  return {
    pack,
    file: relative(file),
    name: doc.name ?? "",
    id: doc._id ?? "",
    chakraDie,
    chakraAdvancements: chakraAdvancements.length,
    hpAdvancements: hpAdvancements.length,
    issues
  };
}

function auditActor({ doc, pack, file }) {
  const system = doc.system ?? {};
  const attributes = system.attributes ?? {};
  const details = system.details ?? {};
  const items = Array.isArray(doc.items) ? doc.items : [];
  const classes = items.filter(item => item?.type === "class");
  const hasClassChakraAdvancement = classes.some(item => {
    return advancementEntries(item.system?.advancement).some(advancement => CHAKRA_ADVANCEMENT_TYPES.has(advancement?.type));
  });
  const spendableJutsu = items.filter(item => (item?.type === "spell") && (getChakraCost(item) > 0))
    .map(item => ({ name: item.name ?? "", id: item._id ?? "", cost: getChakraCost(item) }));
  const chakra = attributes.chakra ?? {};
  const chakraMax = numeric(chakra.max);
  const chakraValue = numeric(chakra.value);
  const chakraFormula = `${chakra.formula ?? ""}`.trim();
  const mode = details.adversary?.enabled ? "adversary" : details.summon?.enabled ? "summon" : details.npcType || doc.type;
  const issues = [];

  if ( (doc.type === "character") && classes.length && (chakra.max === 0) ) issues.push("character-pinned-zero-chakra-max");

  const automaticCharacterChakra = (doc.type === "character") && hasClassChakraAdvancement && (chakra.max === null);
  const spendableActorNeedsPool = spendableJutsu.length && !automaticCharacterChakra && !chakraFormula;
  if ( spendableActorNeedsPool ) {
    const minion = details.adversary?.enabled && (details.adversary?.class === "minion");
    if ( !minion && ((chakraMax ?? 0) <= 0) ) issues.push("spendable-jutsu-without-chakra-max");
    if ( !minion && ((chakraValue ?? 0) <= 0) ) issues.push("spendable-jutsu-without-current-chakra");
  }

  return {
    pack,
    file: relative(file),
    name: doc.name ?? "",
    id: doc._id ?? "",
    type: doc.type,
    mode,
    level: details.level ?? details.adversary?.level ?? details.summon?.level ?? details.cr ?? null,
    chakra: {
      value: chakra.value ?? null,
      max: chakra.max ?? null,
      formula: chakraFormula,
      cd: attributes.cd ?? {}
    },
    classCount: classes.length,
    hasClassChakraAdvancement,
    spendableJutsu,
    issues
  };
}

function advancementEntries(advancement) {
  if ( Array.isArray(advancement) ) return advancement;
  if ( advancement && (typeof advancement === "object") ) return Object.values(advancement);
  return [];
}

function getChakraCost(item) {
  const candidates = [item.system?.chakra?.cost, item.system?.chakraCost, item.system?.cost?.value];
  for ( const candidate of candidates ) {
    if ( Number.isFinite(candidate) && (candidate > 0) ) return candidate;
    if ( typeof candidate !== "string" ) continue;
    const match = candidate.match(/\d+/);
    const value = Number(match?.[0] ?? 0);
    if ( value > 0 ) return value;
  }
  return 0;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function relative(file) {
  return path.relative(SYSTEM_ROOT, file).replaceAll(path.sep, "/");
}

function printReport(report) {
  console.log("N5eB Chakra Audit");
  console.log(`Classes scanned: ${report.summary.classes}`);
  console.log(`Actors scanned: ${report.summary.actors} (${report.summary.characters} characters, ${report.summary.npcs} NPCs, ${report.summary.adversaries} adversaries, ${report.summary.summons} summons)`);
  console.log(`Actors with spendable jutsu: ${report.summary.actorsWithSpendableJutsu}`);
  console.log(`Parse errors: ${report.parseErrors.length}`);
  console.log(`Class issues: ${report.classIssues.length}`);
  console.log(`Actor issues: ${report.actorIssues.length}`);

  for ( const issue of report.parseErrors ) console.log(`PARSE ${issue.file}: ${issue.error}`);
  for ( const issue of report.classIssues ) console.log(`CLASS ${issue.file}: ${issue.issues.join(", ")}`);
  for ( const issue of report.actorIssues ) console.log(`ACTOR ${issue.file}: ${issue.issues.join(", ")}`);
}
