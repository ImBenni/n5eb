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
const CORE_KIT_ROOT = path.join(PACK_SOURCE_ROOT, "items", "consumables", "kits");
const PACKS_ROOT = path.join(PACK_SOURCE_ROOT, "items", "packs");

const EXPECTED_PACKS = {
  "captains-pack": {
    id: "w9c99eBUF9c3P03a",
    name: "Captain's Pack",
    placeholder: { id: "6Aci2VWwiWaU81s7", count: 1, pool: "base" },
    aliases: ["n5ebCaptPack0010"]
  },
  "crafters-pack": {
    id: "wA0Vk7uvLCSVt3VT",
    name: "Crafter's Pack",
    placeholder: { id: "vFSFlV8HfkB0F5SU", count: 3, pool: "base" },
    aliases: []
  },
  "explorers-pack": {
    id: "3pAJEFEnaOt9DOK7",
    name: "Explorer's Pack",
    aliases: ["n5ebExplPack0010"]
  },
  "infiltrators-pack": {
    id: "eo0yvcRzQBR25ymj",
    name: "Infiltrator's Pack",
    placeholder: { id: "EYUt6IvLxhnAqMkN", count: 1, pool: "infiltrator" },
    aliases: []
  },
  "travelers-pack": {
    id: "qo0Gcg4dEicHHBMm",
    name: "Traveler's Pack",
    aliases: ["n5ebTravPack0010"]
  }
};

const REQUIRED_CODE_MARKERS = {
  "module/documents/advancement/item-grant.mjs": [
    "N5EB_TOOLKIT_POOLS",
    "equipmentPack.expandContents",
    "_promptN5eBEquipmentPackToolkits",
    "_promptN5eBToolkitChoice",
    "_getN5eBToolkitPool",
    "flags.n5eb.equipmentPackChoice.placeholderId",
    "flags.n5eb.advancementPackRoot",
    "_getN5eBEquipmentPackContents"
  ],
  "module/config.mjs": [
    "DND5E.n5ebToolKits",
    "antidoteKit",
    "securityKit",
    "hackersKit"
  ]
};

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-toolkits")
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

const source = loadSourceDocuments();
const report = buildReport(source);

if ( argv.out ) {
  fs.mkdirSync(path.dirname(path.resolve(argv.out)), { recursive: true });
  fs.writeFileSync(path.resolve(argv.out), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}

if ( argv.json ) console.log(JSON.stringify(report, null, 2));
else printReport(report);

if ( hasFailures(report) ) process.exitCode = 1;

function buildReport({ documents, parseErrors }) {
  const config = extractConfig();
  const pools = extractToolkitPools();
  const docsByUuid = new Map(documents.filter(row => row.uuid).map(row => [row.uuid, row]));
  const kitDocs = documents.filter(row => isToolkit(row.doc));
  const coreKitDocs = kitDocs.filter(row => row.file.startsWith(CORE_KIT_ROOT));
  const basePromptDocs = coreKitDocs.filter(row => isBasePromptToolkit(row.doc));
  const toolRefs = extractToolkitAdvancementReferences();

  const report = {
    parseErrors,
    config: {
      n5ebToolKits: config.n5ebToolKits.length,
      missingToolConfig: [],
      missingSource: [],
      sourceMismatches: [],
      unresolvedAdvancementRefs: []
    },
    source: {
      totalToolkitDocs: kitDocs.length,
      coreToolkitDocs: coreKitDocs.length,
      basePromptToolkitDocs: basePromptDocs.length,
      invalidToolkitDocs: []
    },
    equipmentPacks: {
      total: 0,
      invalidPacks: [],
      invalidContainedItems: [],
      invalidPlaceholders: []
    },
    promptPools: {
      base: {
        expected: basePromptDocs.length,
        configured: pools.base?.length ?? 0,
        missing: [],
        unexpected: []
      },
      infiltrator: {
        expected: 2,
        configured: pools.infiltrator?.length ?? 0,
        missing: [],
        unexpected: []
      },
      unresolved: []
    },
    code: {
      missingMarkers: []
    }
  };

  auditConfigReferences(config, docsByUuid, report);
  auditToolkitDocuments(kitDocs, report);
  auditAdvancementReferences(toolRefs, config, report);
  auditPromptPools({ pools, docsByUuid, basePromptDocs, report });
  auditEquipmentPacks(report);
  auditCodeMarkers(report);
  return report;
}

function loadSourceDocuments() {
  const documents = [];
  const parseErrors = [];
  for ( const file of findSourceFiles(PACK_SOURCE_ROOT) ) {
    try {
      const doc = YAML.load(fs.readFileSync(file, "utf8"));
      if ( !doc || doc._key === "!folders" ) continue;
      const pack = path.relative(PACK_SOURCE_ROOT, file).split(path.sep)[0];
      documents.push({
        file,
        relative: relative(file),
        pack,
        uuid: doc._id ? `Compendium.n5eb.${pack}.Item.${doc._id}` : "",
        doc
      });
    } catch(err) {
      parseErrors.push({ file: relative(file), error: err.message });
    }
  }
  return { documents, parseErrors };
}

function* findSourceFiles(dir) {
  if ( !fs.existsSync(dir) ) return;
  for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
    const file = path.join(dir, entry.name);
    if ( entry.isDirectory() ) yield* findSourceFiles(file);
    else if ( entry.isFile() && entry.name.endsWith(".yml") && entry.name !== "_folder.yml" ) yield file;
  }
}

function isToolkit(doc) {
  return doc.type === "tool" && doc.system?.type?.value === "kit";
}

function isBasePromptToolkit(doc) {
  if ( !isToolkit(doc) ) return false;
  return !/^(enhanced|greater|superior|supreme)\s+/i.test(doc.name ?? "");
}

function extractConfig() {
  const source = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "config.mjs"), "utf8");
  const tools = {};
  const toolBlock = source.match(/DND5E\.tools = \{([\s\S]*?)\n\};/);
  if ( toolBlock ) {
    const entryPattern = /^\s{2}([A-Za-z][\w]*):\s*\{\s*[\r\n]+\s*ability:\s*"([^"]*)",\s*[\r\n]+\s*id:\s*"([^"]*)"\s*[\r\n]+\s*\}/gm;
    for ( const match of toolBlock[1].matchAll(entryPattern) ) {
      tools[match[1]] = { ability: match[2], id: match[3] };
    }
  }

  const kitArray = source.match(/DND5E\.n5ebToolKits = \[([\s\S]*?)\];/);
  const n5ebToolKits = kitArray ? Array.from(kitArray[1].matchAll(/"([^"]+)"/g), match => match[1]) : [];
  return { tools, n5ebToolKits };
}

function extractToolkitPools() {
  const source = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "documents", "advancement", "item-grant.mjs"), "utf8");
  const pools = {};
  let current = null;
  for ( const line of source.split(/\r?\n/) ) {
    const start = line.match(/^\s{2}(\w+):\s*\[/);
    if ( start ) {
      current = start[1];
      pools[current] = [];
      continue;
    }
    if ( current ) {
      const uuid = line.match(/"([^"]+)"/)?.[1];
      if ( uuid ) pools[current].push(uuid);
      if ( line.trim().startsWith("]") ) current = null;
    }
  }
  return pools;
}

function extractToolkitAdvancementReferences() {
  const refs = [];
  for ( const file of findSourceFiles(PACK_SOURCE_ROOT) ) {
    const text = fs.readFileSync(file, "utf8");
    for ( const match of text.matchAll(/tool:kit:([A-Za-z0-9*_-]+)/g) ) {
      refs.push({ file: relative(file), key: match[1] });
    }
  }
  return refs;
}

function auditConfigReferences(config, docsByUuid, report) {
  for ( const key of config.n5ebToolKits ) {
    const tool = config.tools[key];
    if ( !tool ) {
      report.config.missingToolConfig.push({ key, reason: "not configured in DND5E.tools" });
      continue;
    }
    if ( !tool.id ) {
      report.config.missingToolConfig.push({ key, reason: "empty configured source id" });
      continue;
    }

    const row = docsByUuid.get(tool.id);
    if ( !row ) {
      report.config.missingSource.push({ key, uuid: tool.id });
      continue;
    }
    if ( !isToolkit(row.doc) || row.doc.system?.type?.baseItem !== key ) {
      report.config.sourceMismatches.push({
        key,
        uuid: tool.id,
        file: row.relative,
        type: row.doc.type,
        toolType: row.doc.system?.type?.value ?? "",
        baseItem: row.doc.system?.type?.baseItem ?? ""
      });
    }
  }
}

function auditToolkitDocuments(kitDocs, report) {
  for ( const row of kitDocs ) {
    const system = row.doc.system ?? {};
    const missing = [];
    if ( !system.identifier ) missing.push("system.identifier");
    if ( !system.type?.baseItem ) missing.push("system.type.baseItem");
    if ( system.weight?.units !== "bulk" ) missing.push("system.weight.units=bulk");
    if ( system.price?.denomination !== "ryo" ) missing.push("system.price.denomination=ryo");
    const requiresCharges = row.file.startsWith(CORE_KIT_ROOT) || system.uses?.max || system.uses?.value;
    if ( requiresCharges && (system.uses?.max === undefined || system.uses?.max === "") ) missing.push("system.uses.max");
    if ( requiresCharges && system.uses?.per !== "charges" ) missing.push("system.uses.per=charges");
    if ( missing.length ) report.source.invalidToolkitDocs.push({
      file: row.relative,
      name: row.doc.name,
      missing
    });
  }
}

function auditAdvancementReferences(toolRefs, config, report) {
  const valid = new Set(config.n5ebToolKits);
  for ( const { file, key } of toolRefs ) {
    if ( key === "*" ) continue;
    if ( !valid.has(key) ) report.config.unresolvedAdvancementRefs.push({ file, key });
  }
}

function auditPromptPools({ pools, docsByUuid, basePromptDocs, report }) {
  for ( const [pool, uuids] of Object.entries(pools) ) {
    for ( const uuid of uuids ) {
      const row = docsByUuid.get(uuid);
      if ( !row ) report.promptPools.unresolved.push({ pool, uuid });
      else if ( !isToolkit(row.doc) ) {
        report.promptPools.unresolved.push({ pool, uuid, file: row.relative, reason: "source is not a toolkit" });
      }
    }
  }

  const expectedBase = new Set(basePromptDocs.map(row => row.uuid));
  const configuredBase = new Set(pools.base ?? []);
  report.promptPools.base.missing = [...expectedBase].filter(uuid => !configuredBase.has(uuid)).map(uuid => summarizeUuid(uuid, docsByUuid));
  report.promptPools.base.unexpected = [...configuredBase].filter(uuid => !expectedBase.has(uuid)).map(uuid => summarizeUuid(uuid, docsByUuid));

  const expectedInfiltrator = new Set([
    "Compendium.n5eb.items.Item.CeMakOTuqo0LjEje",
    "Compendium.n5eb.items.Item.z0nkjik1OU6gvhTZ"
  ]);
  const configuredInfiltrator = new Set(pools.infiltrator ?? []);
  report.promptPools.infiltrator.missing = [...expectedInfiltrator]
    .filter(uuid => !configuredInfiltrator.has(uuid)).map(uuid => summarizeUuid(uuid, docsByUuid));
  report.promptPools.infiltrator.unexpected = [...configuredInfiltrator]
    .filter(uuid => !expectedInfiltrator.has(uuid)).map(uuid => summarizeUuid(uuid, docsByUuid));
}

function auditEquipmentPacks(report) {
  for ( const [dirName, expected] of Object.entries(EXPECTED_PACKS) ) {
    const dir = path.join(PACKS_ROOT, dirName);
    const containerFile = path.join(dir, "container.yml");
    report.equipmentPacks.total++;

    if ( !fs.existsSync(containerFile) ) {
      report.equipmentPacks.invalidPacks.push({ pack: dirName, reason: "missing container.yml" });
      continue;
    }

    const container = YAML.load(fs.readFileSync(containerFile, "utf8"));
    const equipmentPack = container.flags?.n5eb?.equipmentPack ?? {};
    const aliases = new Set(equipmentPack.legacyAliases?.ids ?? []);
    const invalid = [];
    if ( container._id !== expected.id ) invalid.push(`container id ${container._id}, expected ${expected.id}`);
    if ( container.name !== expected.name ) invalid.push(`name ${container.name}, expected ${expected.name}`);
    if ( container.type !== "container" ) invalid.push(`type ${container.type}, expected container`);
    if ( !equipmentPack.canonical ) invalid.push("missing flags.n5eb.equipmentPack.canonical");
    if ( !equipmentPack.expandContents ) invalid.push("missing flags.n5eb.equipmentPack.expandContents");
    for ( const alias of expected.aliases ) {
      if ( !aliases.has(alias) ) invalid.push(`missing legacy alias ${alias}`);
    }
    if ( invalid.length ) report.equipmentPacks.invalidPacks.push({ pack: dirName, file: relative(containerFile), invalid });

    const placeholders = [];
    for ( const file of findSourceFiles(dir) ) {
      if ( path.basename(file) === "container.yml" ) continue;
      const doc = YAML.load(fs.readFileSync(file, "utf8"));
      if ( doc.system?.container !== expected.id ) {
        report.equipmentPacks.invalidContainedItems.push({
          pack: dirName,
          file: relative(file),
          name: doc.name,
          container: doc.system?.container ?? null,
          expected: expected.id
        });
      }
      if ( doc.flags?.n5eb?.equipmentPack?.toolkitChoice ) placeholders.push({ file, doc });
    }

    if ( expected.placeholder ) {
      const placeholder = placeholders.find(row => row.doc._id === expected.placeholder.id);
      if ( !placeholder ) {
        report.equipmentPacks.invalidPlaceholders.push({ pack: dirName, reason: `missing placeholder ${expected.placeholder.id}` });
      } else {
        const config = placeholder.doc.flags.n5eb.equipmentPack.toolkitChoice;
        const invalidPlaceholder = [];
        if ( Number(config.count) !== expected.placeholder.count ) {
          invalidPlaceholder.push(`count ${config.count}, expected ${expected.placeholder.count}`);
        }
        if ( config.pool !== expected.placeholder.pool ) {
          invalidPlaceholder.push(`pool ${config.pool}, expected ${expected.placeholder.pool}`);
        }
        if ( invalidPlaceholder.length ) {
          report.equipmentPacks.invalidPlaceholders.push({
            pack: dirName,
            file: relative(placeholder.file),
            invalid: invalidPlaceholder
          });
        }
      }
    } else if ( placeholders.length ) {
      for ( const placeholder of placeholders ) {
        report.equipmentPacks.invalidPlaceholders.push({
          pack: dirName,
          file: relative(placeholder.file),
          reason: "unexpected toolkit placeholder"
        });
      }
    }
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

function summarizeUuid(uuid, docsByUuid) {
  const row = docsByUuid.get(uuid);
  return row ? { uuid, name: row.doc.name, file: row.relative } : { uuid, name: "", file: "" };
}

function hasFailures(report) {
  return report.parseErrors.length
    || report.config.missingToolConfig.length
    || report.config.missingSource.length
    || report.config.sourceMismatches.length
    || report.config.unresolvedAdvancementRefs.length
    || report.source.invalidToolkitDocs.length
    || report.equipmentPacks.invalidPacks.length
    || report.equipmentPacks.invalidContainedItems.length
    || report.equipmentPacks.invalidPlaceholders.length
    || report.promptPools.base.missing.length
    || report.promptPools.base.unexpected.length
    || report.promptPools.infiltrator.missing.length
    || report.promptPools.infiltrator.unexpected.length
    || report.promptPools.unresolved.length
    || report.code.missingMarkers.length;
}

function printReport(report) {
  console.log("N5eB Toolkit & Equipment Pack Audit");
  console.log(`Toolkit docs: ${report.source.totalToolkitDocs} total, ${report.source.coreToolkitDocs} core, ${report.source.basePromptToolkitDocs} base prompt choices`);
  console.log(`Configured N5eB toolkits: ${report.config.n5ebToolKits}`);
  console.log(`Equipment packs audited: ${report.equipmentPacks.total}`);
  console.log(`Base prompt pool: ${report.promptPools.base.configured}/${report.promptPools.base.expected}`);
  console.log(`Infiltrator prompt pool: ${report.promptPools.infiltrator.configured}/${report.promptPools.infiltrator.expected}`);

  const failures = [
    ...report.parseErrors.map(row => `${row.file}: ${row.error}`),
    ...report.config.missingToolConfig.map(row => `config ${row.key}: ${row.reason}`),
    ...report.config.missingSource.map(row => `config ${row.key}: source ${row.uuid} not found in packs/_source`),
    ...report.config.sourceMismatches.map(row => `${row.file}: ${row.key} points at ${row.type}/${row.toolType}/${row.baseItem}`),
    ...report.config.unresolvedAdvancementRefs.map(row => `${row.file}: unknown toolkit advancement key ${row.key}`),
    ...report.source.invalidToolkitDocs.map(row => `${row.file}: ${row.name} missing ${row.missing.join(", ")}`),
    ...report.equipmentPacks.invalidPacks.map(row => `${row.file ?? row.pack}: ${(row.invalid ?? [row.reason]).join(", ")}`),
    ...report.equipmentPacks.invalidContainedItems.map(row => `${row.file}: ${row.name} container ${row.container}, expected ${row.expected}`),
    ...report.equipmentPacks.invalidPlaceholders.map(row => `${row.file ?? row.pack}: ${(row.invalid ?? [row.reason]).join(", ")}`),
    ...report.promptPools.base.missing.map(row => `base prompt missing ${row.name || row.uuid}`),
    ...report.promptPools.base.unexpected.map(row => `base prompt has unexpected ${row.name || row.uuid}`),
    ...report.promptPools.infiltrator.missing.map(row => `infiltrator prompt missing ${row.name || row.uuid}`),
    ...report.promptPools.infiltrator.unexpected.map(row => `infiltrator prompt has unexpected ${row.name || row.uuid}`),
    ...report.promptPools.unresolved.map(row => `${row.pool} prompt unresolved ${row.uuid}${row.reason ? `: ${row.reason}` : ""}`),
    ...report.code.missingMarkers.map(row => `${row.file} missing marker ${row.marker}`)
  ];

  if ( failures.length ) {
    console.log("");
    console.log("Failures");
    console.log("--------");
    for ( const failure of failures ) console.log(`- ${failure}`);
  } else {
    console.log("Failures: 0");
  }
}

function relative(file) {
  return path.relative(SYSTEM_ROOT, file).replaceAll(path.sep, "/");
}
