/* eslint-disable jsdoc/require-jsdoc, keyword-spacing, max-len */

import crypto from "node:crypto";
import fs from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import YAML from "js-yaml";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "..");
const PACK_SOURCE_ROOT = path.join(SYSTEM_ROOT, "packs", "_source");
const DEFAULT_OLD_ROOT = path.resolve(SYSTEM_ROOT, "..", "n5eb_old - Copy");
const DEFAULT_AUDIT_PATH = path.join(PACK_SOURCE_ROOT, "legacy-import-audit.json");
const LEGACY_UUID_MAP_PATH = path.join(SYSTEM_ROOT, "json", "legacy-pack-uuid-map.json");
const SYSTEM_JSON = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8"));
const SYSTEM_VERSION = SYSTEM_JSON.version ?? "0.0.0";

const TARGET_PACKS = [
  "items", "jutsus", "backgrounds", "traits-quirks", "class", "subclass", "clan", "rules", "conditions",
  "feats", "classmod", "adversary", "adversary-traits", "adversary-passives", "summons", "npc",
  "cheat-sheets",
  "t7-class", "t7-subclass", "t7-clan", "t7-backgrounds", "t7-feats", "t7-classmod", "t7-items",
  "t7-jutsus", "t7-adversary", "t7-summons", "t7-npc", "t7-cheat-sheets",
  "hb-class", "hb-subclass", "hb-clan", "hb-backgrounds", "hb-feats", "hb-classmod", "hb-items",
  "hb-jutsus", "hb-adversary", "hb-summons", "hb-npc", "hb-cheat-sheets"
];
const MERGED_IMPORT_PACKS = [
  "n5eb-classes",
  "n5eb-origins",
  "n5eb-jutsu",
  "n5eb-equipment",
  "n5eb-actors",
  "n5eb-features",
  "n5eb-rules"
];
const JOURNAL_PACKS = new Set(["rules", "cheat-sheets", "t7-cheat-sheets", "hb-cheat-sheets"]);
const ACTOR_PACKS = new Set(["adversary", "npc", "t7-adversary", "t7-npc", "hb-adversary", "hb-npc"]);

const ACTOR_TYPES = new Set(["character", "npc", "vehicle", "group", "encounter"]);
const PHYSICAL_TYPES = new Set(["container", "consumable", "equipment", "loot", "tool", "weapon"]);
const ITEM_DOCUMENT_TYPES = new Set(["background", "class", "classmod", "container", "consumable", "equipment",
  "feat", "loot", "race", "spell", "subclass", "tool", "weapon"]);

const JUTSU_SCHOOL_MAP = {
  buki: "bukijutsu",
  gen: "genjutsu",
  hi: "ninjutsu",
  nin: "ninjutsu",
  tai: "taijutsu"
};
const JUTSU_COMPONENT_MAP = {
  chakramolding: "cm",
  chakraseals: "cs",
  handseals: "hs",
  mobility: "m",
  molding: "cm",
  ninjatool: "nt",
  ninjatools: "nt",
  weapon: "w",
  weapons: "w"
};
const JUTSU_KEYWORD_MAP = {
  auditory: "auditory",
  bukijutsu: "bukijutsu",
  chain: "chain",
  clash: "clash",
  clone: "clone",
  combo: "combo",
  combination: "combination",
  construct: "construct",
  earth: "earth",
  fire: "fire",
  fuinjutsu: "fuinjutsu",
  genjutsu: "genjutsu",
  hijutsu: "hijutsu",
  inhaled: "inhaled",
  kinjutsu: "kinjutsu",
  lightning: "lightning",
  medical: "medical",
  ninjutsu: "ninjutsu",
  sensory: "sensory",
  tactile: "tactile",
  taijutsu: "taijutsu",
  unaware: "unaware",
  visual: "visual",
  water: "water",
  wind: "wind"
};
const ACTION_TYPE_MAP = {
  abil: "abil",
  mgak: "msak",
  mnak: "msak",
  mtak: "msak",
  rgak: "rsak",
  rnak: "rsak",
  rtak: "rsak"
};
const SPELL_LEVEL_BY_RANK = { e: 0, d: 1, c: 3, b: 5, a: 7, s: 9 };
const RANK_BY_SPELL_LEVEL = {
  0: "e",
  1: "d",
  2: "d",
  3: "c",
  4: "c",
  5: "b",
  6: "b",
  7: "a",
  8: "a",
  9: "s"
};
const CURRENCY_CONVERSIONS = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

const argv = yargs(hideBin(process.argv))
  .option("old-root", {
    alias: "old",
    type: "string",
    default: DEFAULT_OLD_ROOT,
    describe: "Path to the old n5eb system folder."
  })
  .option("audit", {
    type: "string",
    default: DEFAULT_AUDIT_PATH,
    describe: "Path to write the import audit report."
  })
  .option("dry-run", {
    type: "boolean",
    default: false,
    describe: "Analyze and report without writing pack sources or copying assets."
  })
  .strict()
  .help()
  .parseSync();

const oldRoot = path.resolve(argv.oldRoot);
const oldPackRoot = path.join(oldRoot, "packs", "_source");
const auditPath = path.resolve(argv.audit);
const dryRun = argv.dryRun;

const audit = {
  dryRun,
  oldRoot,
  systemRoot: SYSTEM_ROOT,
  generatedAt: new Date().toISOString(),
  systemVersion: SYSTEM_VERSION,
  counts: {
    oldDocuments: 0,
    oldFolders: 0,
    imported: 0,
    foldersImported: 0,
    currentOnlyImported: 0,
    duplicatesReplaced: 0,
    oldDuplicateIdentifiers: 0,
    skippedFolders: 0,
    invalid: 0
  },
  byTargetPack: {},
  byDocumentType: {},
  duplicates: [],
  invalidDocuments: [],
  unresolvedUUIDs: [],
  assets: {
    referenced: 0,
    copied: 0,
    existing: 0,
    fallbacks: [],
    missing: []
  },
  uuidMappings: 0,
  schemaWarnings: []
};

for ( const pack of TARGET_PACKS ) audit.byTargetPack[pack] = 0;

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

/* -------------------------------------------- */

async function main() {
  if ( !fs.existsSync(oldPackRoot) ) throw new Error(`Old pack source folder not found: ${oldPackRoot}`);
  const current = await loadCurrentIndex();
  const oldEntries = await loadOldEntries(current);
  const uuidMap = buildUuidMap(oldEntries);
  audit.uuidMappings = uuidMap.size;
  const assets = new Set(["systems/n5eb/icons/svg/items/classmod.svg"]);

  if ( !dryRun ) {
    await cleanGeneratedLegacySources();
    for ( const pack of TARGET_PACKS ) await mkdir(path.join(PACK_SOURCE_ROOT, pack), { recursive: true });
  }

  for ( const entry of oldEntries ) {
    const document = normalizeDocument(entry, uuidMap);
    rewriteUUIDs(document, uuidMap, entry);
    collectAssetReferences(document, assets);
    attachLegacyImportFlags(document, entry);
    updateEmbeddedKeys(document);

    if ( !dryRun ) await writeSource(entry.outputPath, document);
    audit.counts.imported++;
    if ( entry.documentName === "Folder" ) audit.counts.foldersImported++;
    audit.byTargetPack[entry.targetPack]++;
    audit.byDocumentType[entry.documentName] = (audit.byDocumentType[entry.documentName] ?? 0) + 1;
  }

  await copyReferencedAssets(assets);
  if ( !dryRun ) await writeUuidMap(uuidMap);
  await writeAudit();

  printSummary();
}

/* -------------------------------------------- */

async function loadCurrentIndex() {
  const index = {
    byDuplicateKey: new Map(),
    usedIds: new Map(TARGET_PACKS.map(pack => [pack, new Set()])),
    documents: [],
    consumedFiles: new Set(),
    outputPaths: new Set()
  };

  for ( const pack of MERGED_IMPORT_PACKS ) {
    const dir = path.join(PACK_SOURCE_ROOT, pack);
    if ( !fs.existsSync(dir) ) continue;
    for await ( const file of walkFiles(dir, ".yml") ) {
      if ( path.basename(file).startsWith("_") ) continue;
      if ( toPosix(path.relative(dir, file)).startsWith("legacy-import/") ) continue;
      const document = YAML.load(await readFile(file, "utf8"));
      if ( !document?._id ) continue;
      const documentName = getDocumentName(document);
      if ( documentName === "Invalid" ) continue;
      const targetPack = classifyCurrentTargetPack(pack, document, documentName);
      if ( !targetPack ) continue;

      const originalId = document._id;
      document._id = normalizeExistingDocumentId(originalId, `${pack}.${toPosix(path.relative(PACK_SOURCE_ROOT, file))}`);
      while ( index.usedIds.get(targetPack).has(document._id) ) document._id = makeId(`${document._id}.${file}`);
      if ( originalId !== document._id ) {
        audit.schemaWarnings.push({
          pack: targetPack,
          sourcePack: pack,
          path: toPosix(path.relative(SYSTEM_ROOT, file)),
          id: originalId,
          normalizedId: document._id,
          reason: "Current source document ID was not a valid Foundry v14 ID."
        });
      }

      index.usedIds.get(targetPack).add(document._id);
      index.outputPaths.add(path.resolve(file).toLowerCase());
      const sourceRelativePath = toPosix(path.relative(dir, file));
      const record = { document, file, originalId, sourcePack: pack, sourceRelativePath, targetPack, documentName };
      index.documents.push(record);
      const duplicateKey = makeDuplicateKey(targetPack, documentName, document.type, getIdentifier(document));
      if ( !index.byDuplicateKey.has(duplicateKey) ) index.byDuplicateKey.set(duplicateKey, record);
    }
  }

  return index;
}

/* -------------------------------------------- */

async function loadOldEntries(current) {
  const entries = [];
  const assignedDuplicates = new Set();
  const oldDuplicateKeys = new Map();
  const folderIdMaps = new Map(TARGET_PACKS.map(pack => [pack, new Map()]));

  for ( const packDir of fs.readdirSync(oldPackRoot, { withFileTypes: true }).filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)) ) {
    const pack = packDir.name;
    const sourceDir = path.join(oldPackRoot, pack);

    for await ( const file of walkFiles(sourceDir, ".json") ) {
      const relPath = toPosix(path.relative(sourceDir, file));
      const targetPack = TARGET_PACKS.includes(pack) ? pack : null;
      const document = JSON.parse(await readFile(file, "utf8"));

      if ( path.basename(file) === "_folder.json" ) {
        audit.counts.oldFolders++;
        if ( !targetPack ) {
          audit.counts.invalid++;
          audit.invalidDocuments.push({
            pack,
            path: relPath,
            id: document._id,
            name: document.name,
            type: "Folder",
            reason: "No target pack"
          });
          continue;
        }

        const id = chooseDocumentId(document._id, targetPack, current.usedIds);
        folderIdMaps.get(targetPack).set(document._id, id);
        current.usedIds.get(targetPack).add(id);
        entries.push({
          oldPack: pack,
          oldPath: file,
          oldRelativePath: relPath,
          oldDocument: document,
          documentName: "Folder",
          targetPack,
          outputPath: oldStyleOutputPath(targetPack, relPath),
          newId: id,
          identifier: formatIdentifier(document.name || document._id),
          replacedCurrent: null,
          folderIdMap: folderIdMaps.get(targetPack)
        });
        continue;
      }

      const documentName = getDocumentName(document);
      const normalizedTargetPack = classifyTargetPack(pack, documentName);
      audit.counts.oldDocuments++;

      if ( !normalizedTargetPack || (documentName === "Invalid") ) {
        audit.counts.invalid++;
        audit.invalidDocuments.push({
          pack,
          path: relPath,
          id: document._id,
          name: document.name,
          type: document.type,
          reason: normalizedTargetPack ? "Unsupported document type" : "No target pack"
        });
        continue;
      }

      let identifier = getIdentifier(document);
      const originalDuplicateKey = makeDuplicateKey(normalizedTargetPack, documentName, document.type, identifier);
      const currentMatch = current.byDuplicateKey.get(originalDuplicateKey);
      const oldDuplicateCount = oldDuplicateKeys.get(originalDuplicateKey) ?? 0;
      oldDuplicateKeys.set(originalDuplicateKey, oldDuplicateCount + 1);

      let replacedCurrent = null;
      let sourceCurrent = null;
      let id;
      let outputPath;

      if ( currentMatch && !assignedDuplicates.has(originalDuplicateKey) ) {
        assignedDuplicates.add(originalDuplicateKey);
        current.consumedFiles.add(path.resolve(currentMatch.file).toLowerCase());
        replacedCurrent = unwrapReplacedCurrent(currentMatch.document);
        id = currentMatch.document._id;
        outputPath = oldStyleOutputPath(normalizedTargetPack, relPath);
        sourceCurrent = {
          sourcePack: currentMatch.sourcePack,
          sourcePath: currentMatch.sourceRelativePath,
          sourceId: currentMatch.document._id,
          documentName: currentMatch.documentName
        };
        audit.counts.duplicatesReplaced++;
        audit.duplicates.push({
          targetPack: normalizedTargetPack,
          identifier,
          type: document.type,
          oldPack: pack,
          oldPath: relPath,
          currentPath: toPosix(path.relative(SYSTEM_ROOT, currentMatch.file)),
          preservedId: id,
          previousId: currentMatch.originalId === id ? undefined : currentMatch.originalId
        });
      } else {
        if ( oldDuplicateCount > 0 ) {
          audit.counts.oldDuplicateIdentifiers++;
          identifier = `${identifier}-${formatIdentifier(pack)}-${oldDuplicateCount + 1}`;
        }
        id = chooseDocumentId(document._id, normalizedTargetPack, current.usedIds);
        outputPath = oldStyleOutputPath(normalizedTargetPack, relPath);
      }

      current.usedIds.get(normalizedTargetPack).add(id);
      entries.push({
        oldPack: pack,
        oldPath: file,
        oldRelativePath: relPath,
        oldDocument: document,
        documentName,
        targetPack: normalizedTargetPack,
        outputPath,
        newId: id,
        identifier,
        replacedCurrent,
        sourceCurrent,
        folderIdMap: folderIdMaps.get(normalizedTargetPack)
      });
    }
  }

  for ( const currentDocument of current.documents ) {
    if ( current.consumedFiles.has(path.resolve(currentDocument.file).toLowerCase()) ) continue;

    const document = currentDocument.document;
    const identifier = getIdentifier(document);
    entries.push({
      oldPack: currentDocument.sourcePack,
      oldPath: currentDocument.file,
      oldRelativePath: currentDocument.sourceRelativePath,
      oldDocument: document,
      documentName: currentDocument.documentName,
      targetPack: currentDocument.targetPack,
      outputPath: currentOnlyOutputPath(currentDocument),
      newId: document._id,
      identifier,
      replacedCurrent: null,
      currentOnly: true,
      sourceCurrent: {
        sourcePack: currentDocument.sourcePack,
        sourcePath: currentDocument.sourceRelativePath,
        sourceId: document._id,
        documentName: currentDocument.documentName
      },
      folderIdMap: folderIdMaps.get(currentDocument.targetPack) ?? new Map()
    });
    audit.counts.currentOnlyImported++;
  }

  return entries;
}

/* -------------------------------------------- */

function buildUuidMap(entries) {
  const map = new Map();
  const itemById = new Map();
  const actorById = new Map();
  const journalById = new Map();

  for ( const entry of entries ) {
    const { oldDocument, oldPack, documentName, targetPack, newId } = entry;
    if ( !oldDocument._id || (documentName === "Folder") ) continue;
    const targetUuid = `Compendium.n5eb.${targetPack}.${documentName}.${newId}`;
    map.set(`Compendium.n5eb.${oldPack}.${documentName}.${oldDocument._id}`, targetUuid);
    if ( entry.sourceCurrent?.sourcePack && entry.sourceCurrent?.sourceId ) {
      map.set(
        `Compendium.n5eb.${entry.sourceCurrent.sourcePack}.${entry.sourceCurrent.documentName}.${entry.sourceCurrent.sourceId}`,
        targetUuid
      );
    }
    if ( documentName === "Item" ) itemById.set(oldDocument._id, targetUuid);
    if ( documentName === "Actor" ) actorById.set(oldDocument._id, targetUuid);
    if ( documentName === "JournalEntry" ) journalById.set(oldDocument._id, targetUuid);
  }

  for ( const [id, uuid] of itemById ) map.set(`Compendium.world.items.Item.${id}`, uuid);
  for ( const [id, uuid] of actorById ) map.set(`Compendium.world.actors.Actor.${id}`, uuid);
  for ( const [id, uuid] of journalById ) map.set(`Compendium.world.journal.JournalEntry.${id}`, uuid);

  for ( const entry of entries ) {
    const serialized = JSON.stringify(entry.oldDocument);
    for ( const match of serialized.matchAll(/Compendium\.(?:n5eb|world)\.[A-Za-z0-9_-]+\.(Actor|Item|JournalEntry)\.([A-Za-z0-9]{16})/g) ) {
      const [, documentName, id] = match;
      const replacement = { Actor: actorById, Item: itemById, JournalEntry: journalById }[documentName]?.get(id);
      if ( replacement ) map.set(match[0], replacement);
    }
  }

  return map;
}

/* -------------------------------------------- */

function normalizeDocument(entry) {
  const document = structuredClone(entry.oldDocument);
  document._id = entry.newId;
  document.folder = entry.currentOnly ? null : remapFolderId(document.folder, entry);
  if ( entry.documentName !== "Folder" ) document.ownership ??= { default: 0 };
  document._stats = normalizeStats(document._stats, entry);

  if ( entry.documentName === "Folder" ) normalizeFolder(document, entry);
  else if ( entry.documentName === "Item" ) normalizeItem(document, entry);
  else if ( entry.documentName === "Actor" ) normalizeActor(document, entry);
  else if ( entry.documentName === "JournalEntry" ) normalizeJournal(document, entry);

  document._key = keyForDocument(entry.documentName, document._id);
  return document;
}

/* -------------------------------------------- */

function normalizeFolder(document, entry) {
  document.type = packDocumentName(entry.targetPack);
  document.folder = remapFolderId(document.folder, entry);
  document.flags ??= {};
  document.description ??= "";
  document.sort ??= 0;
  document.sorting ??= "a";
}

/* -------------------------------------------- */

function normalizeItem(document, entry, { embedded=false, actorId=null }={}) {
  if ( document.type === "backpack" ) document.type = "container";
  if ( !ITEM_DOCUMENT_TYPES.has(document.type) ) {
    audit.schemaWarnings.push({
      pack: entry.oldPack,
      path: entry.oldRelativePath,
      id: document._id,
      warning: `Unsupported item type retained: ${document.type}`
    });
  }

  document.system ??= {};
  document.system.identifier = embedded
    ? (document.system.identifier || formatIdentifier(document.name))
    : entry.identifier;
  document.system.description ??= { value: "", chat: "" };
  document.system.description.value ??= "";
  document.system.description.chat ??= "";
  document.system.source ??= {};
  document.system.source.rules ??= "n5eb";

  if ( document.type === "spell" ) normalizeJutsu(document, entry);
  if ( document.type === "class" ) normalizeClass(document);
  if ( document.type === "subclass" ) normalizeSubclass(document);
  if ( document.type === "classmod" ) normalizeClassMod(document);
  if ( PHYSICAL_TYPES.has(document.type) ) normalizePhysicalItem(document);

  if ( embedded && actorId ) document._key = `!actors.items!${actorId}.${document._id}`;
  else document._key = keyForDocument("Item", document._id);
}

/* -------------------------------------------- */

function normalizeActor(document, entry) {
  document.system ??= {};
  normalizeRyoCurrency(document.system);
  normalizeActorSenses(document.system);
  document.items ??= [];

  for ( const item of document.items ) {
    const embeddedEntry = {
      ...entry,
      oldDocument: item,
      identifier: item.system?.identifier || formatIdentifier(item.name)
    };
    normalizeItem(item, embeddedEntry, { embedded: true, actorId: document._id });
    item._stats = normalizeStats(item._stats, entry);
  }

  document._key = keyForDocument("Actor", document._id);
}

/* -------------------------------------------- */

function normalizeJournal(document) {
  document.pages ??= [];
  for ( const page of document.pages ) {
    page._id ??= makeId(`${document._id}.${page.name}`);
    page.ownership ??= { default: -1 };
    page._key = `!journal.pages!${document._id}.${page._id}`;
  }
  document._key = keyForDocument("JournalEntry", document._id);
}

/* -------------------------------------------- */

function normalizeJutsu(document, entry) {
  const system = document.system;
  const oldProperties = keysOf(system.properties);
  const oldKeywords = keysOf(system.keywords);
  const components = new Set(keysOf(system.jutsu?.components));
  const keywords = new Set([...keysOf(system.jutsu?.keywords), ...oldKeywords]);
  const inferredRank = inferRank(entry.oldRelativePath) ?? normalizeRank(system.rank) ?? rankForLevel(system.level);

  system.jutsu ??= {};
  system.jutsu.components = Array.from(components);
  system.jutsu.keywords = Array.from(keywords);
  system.jutsu.countsKnown ??= true;
  system.jutsu.ability ??= "";
  system.rank = inferredRank;
  system.level = SPELL_LEVEL_BY_RANK[inferredRank] ?? rankForLevel(system.level);

  const jutsuType = JUTSU_SCHOOL_MAP[system.school] ?? system.jutsu.type;
  if ( jutsuType ) {
    system.jutsu.type = jutsuType;
    system.jutsu.keywords.push(jutsuType);
    if ( system.school === "hi" ) system.jutsu.keywords.push("hijutsu");
    system.school = jutsuType === "genjutsu" ? "ill" : "trs";
  }

  for ( const property of oldProperties ) {
    const component = JUTSU_COMPONENT_MAP[property];
    if ( component ) system.jutsu.components.push(component);
    const keyword = JUTSU_KEYWORD_MAP[property];
    if ( keyword ) system.jutsu.keywords.push(keyword);
  }

  system.jutsu.components = Array.from(new Set(system.jutsu.components)).filter(Boolean);
  system.jutsu.keywords = Array.from(new Set(system.jutsu.keywords.map(k => JUTSU_KEYWORD_MAP[k] ?? k))).filter(Boolean);
  system.chakra ??= {};
  if ( "chakraCost" in system ) {
    if ( !system.chakra.cost ) system.chakra.cost = `${system.chakraCost ?? ""}`;
    delete system.chakraCost;
  }
  normalizeChakraScaling(system);
  system.chakra.cost ??= "";
  system.chakra.scaling ??= { mode: "none", value: 0 };
  system.chakra.special ??= "";

  if ( system.preparation ) {
    system.method ??= system.preparation.mode === "prepared" ? "spell" : (system.preparation.mode || "spell");
    system.prepared ??= Number(Boolean(system.preparation.prepared));
  }
  system.method ??= "spell";
  system.prepared ??= 0;
  system.properties = oldProperties.filter(p => ["concentration", "material", "ritual", "somatic", "vocal"].includes(p));
  system.actionType = ACTION_TYPE_MAP[system.actionType] ?? system.actionType;
  delete system.keywords;

  if ( Object.keys(system.activities ?? {}).length === 0 && (system.actionType || system.activation?.type) ) {
    document._stats.systemVersion = "3.0.0";
  }
}

/* -------------------------------------------- */

function normalizeClass(document) {
  const system = document.system;
  normalizeClassLikeSpellcasting(system);
  if ( ("hitDice" in system) && (!system.hd || !("denomination" in system.hd)) ) {
    system.hd ??= {};
    system.hd.denomination = system.hitDice;
  }
  if ( ("chakraDice" in system) && (!system.cd || !("denomination" in system.cd)) ) {
    system.cd ??= {};
    system.cd.denomination = system.chakraDice;
  }
}

/* -------------------------------------------- */

function normalizeSubclass(document) {
  normalizeClassLikeSpellcasting(document.system);
}

/* -------------------------------------------- */

function normalizeClassLikeSpellcasting(system) {
  if ( !system || (typeof system.spellcasting !== "object") || Array.isArray(system.spellcasting) ) return;
  const legacy = system.spellcasting;
  const abilities = ["ninjutsu", "genjutsu", "taijutsu"].reduce((obj, key) => {
    if ( legacy[key] ) obj[key] = legacy[key];
    return obj;
  }, {});
  if ( !Object.keys(abilities).length ) return;

  system.jutsu ??= {};
  system.jutsu.abilities ??= {};
  Object.assign(system.jutsu.abilities, abilities);
  system.spellcasting = {
    progression: legacy.progression || "none",
    ability: legacy.ability || abilities.ninjutsu || "",
    preparation: legacy.preparation ?? { formula: "" }
  };
}

/* -------------------------------------------- */

function normalizeClassMod(document) {
  const system = document.system;
  system.identifier ??= formatIdentifier(document.name);
  system.levels = Number.isFinite(Number(system.levels)) ? Number(system.levels) : 1;
  system.advancement ??= {};
  if ( Array.isArray(system.advancement) ) {
    system.advancement = Object.fromEntries(system.advancement.map(a => [a._id ?? makeId(`${document._id}.${a.type}`), a]));
  }
  normalizeFormulaBlock(system, "save");
  normalizeFormulaBlock(system, "attackBonus");
}

/* -------------------------------------------- */

function normalizeFormulaBlock(system, key) {
  if ( typeof system[key] === "object" && !Array.isArray(system[key]) && (system[key] !== null) ) {
    system[key].value ??= "";
    system[key].scaling ??= "";
    return;
  }
  system[key] = { value: system[key] ?? "", scaling: "" };
}

/* -------------------------------------------- */

function normalizePhysicalItem(document) {
  const system = document.system;
  system.quantity ??= 1;
  if ( typeof system.weight === "number" ) system.weight = { value: system.weight, units: "bulk" };
  else {
    system.weight ??= { value: 0, units: "bulk" };
    system.weight.value = finiteNumber(system.weight.value);
    system.weight.units = "bulk";
  }

  if ( typeof system.price === "number" ) system.price = { value: system.price, denomination: "ryo" };
  else {
    system.price ??= { value: 0, denomination: "ryo" };
    if ( system.price.denomination && (system.price.denomination !== "ryo") ) {
      system.price.value = Math.round(finiteNumber(system.price.value) * (CURRENCY_CONVERSIONS[system.price.denomination] ?? 1));
    } else system.price.value = finiteNumber(system.price.value);
    system.price.denomination = "ryo";
  }

  system.properties = keysOf(system.properties);
  system.attunement ??= "";
  system.equipped ??= false;
  system.rarity ??= "";
  system.identified ??= true;
  system.unidentified ??= { description: "" };
  system.container ??= null;
  if ( document.type === "container" ) {
    system.currency ??= { ryo: 0 };
    normalizeRyoCurrency(system);
    system.capacity ??= {};
    system.capacity.weight ??= { value: null, units: "bulk" };
    if ( typeof system.capacity.weight === "number" ) {
      system.capacity.weight = { value: system.capacity.weight, units: "bulk" };
    }
    if ( (system.capacity.type === "weight") && (system.capacity.value !== undefined) ) {
      system.capacity.weight.value = finiteNumber(system.capacity.value);
      delete system.capacity.type;
      delete system.capacity.value;
    }
    system.capacity.weight.units = "bulk";
  }
}

/* -------------------------------------------- */

function normalizeRyoCurrency(system) {
  if ( !system?.currency ) return;
  if ( Number.isFinite(Number(system.currency.ryo)) ) {
    system.currency = { ryo: Number(system.currency.ryo) };
    return;
  }

  const ryo = Object.entries(CURRENCY_CONVERSIONS).reduce((total, [denomination, value]) => {
    return total + (finiteNumber(system.currency[denomination]) * value);
  }, 0);
  system.currency = { ryo: Math.round(ryo) };
}

/* -------------------------------------------- */

function normalizeActorSenses(system) {
  const senses = system?.attributes?.senses;
  if ( !senses || (senses.chakrasight === undefined) ) return;
  senses.ranges ??= {};
  senses.ranges.chakrasight ??= senses.chakrasight;
  delete senses.chakrasight;
}

/* -------------------------------------------- */

function rewriteUUIDs(value, uuidMap, entry, pathParts=[]) {
  if ( typeof value === "string" ) {
    return value.replace(/Compendium\.(?:n5eb|world)\.[A-Za-z0-9_-]+\.(?:Actor|Item|JournalEntry)\.[A-Za-z0-9]{16}/g, uuid => {
      const replacement = uuidMap.get(uuid);
      if ( replacement ) return replacement;
      audit.unresolvedUUIDs.push({
        uuid,
        targetPack: entry.targetPack,
        oldPack: entry.oldPack,
        path: entry.oldRelativePath,
        field: pathParts.join(".")
      });
      return uuid;
    });
  }

  if ( Array.isArray(value) ) {
    for ( let i = 0; i < value.length; i++ ) value[i] = rewriteUUIDs(value[i], uuidMap, entry, [...pathParts, i]);
    return value;
  }

  if ( value && (typeof value === "object") ) {
    for ( const [key, child] of Object.entries(value) ) value[key] = rewriteUUIDs(child, uuidMap, entry, [...pathParts, key]);
  }
  return value;
}

/* -------------------------------------------- */

function attachLegacyImportFlags(document, entry) {
  if ( entry.documentName === "Folder" ) return;
  document.flags ??= {};
  document.flags.n5eb ??= {};
  document.flags.n5eb.legacyImport = {
    sourceSystem: entry.currentOnly ? "n5eb current source" : "n5eb_old - Copy",
    sourcePack: entry.oldPack,
    sourcePath: entry.oldRelativePath,
    sourceId: entry.oldDocument._id ?? null,
    sourceType: entry.oldDocument.type ?? entry.documentName,
    originalSystem: entry.oldDocument.system ?? null
  };
  if ( entry.sourceCurrent ) document.flags.n5eb.legacyImport.currentSource = entry.sourceCurrent;
  if ( entry.replacedCurrent ) {
    document.flags.n5eb.legacyImport.replacedCurrent = entry.replacedCurrent;
    if ( entry.replacedCurrent.flags?.n5eb?.bulk && !document.flags.n5eb.bulk ) {
      document.flags.n5eb.bulk = structuredClone(entry.replacedCurrent.flags.n5eb.bulk);
    }
  }
}

/* -------------------------------------------- */

function updateEmbeddedKeys(document) {
  if ( document.items ) {
    for ( const item of document.items ) item._key = `!actors.items!${document._id}.${item._id}`;
  }
  if ( document.pages ) {
    for ( const page of document.pages ) page._key = `!journal.pages!${document._id}.${page._id}`;
  }
}

/* -------------------------------------------- */

async function cleanGeneratedLegacySources() {
  for ( const pack of TARGET_PACKS ) {
    const sourceDir = path.join(PACK_SOURCE_ROOT, pack);
    const resolved = path.resolve(sourceDir);
    const expectedRoot = path.resolve(PACK_SOURCE_ROOT);
    if ( (resolved === expectedRoot) || !resolved.startsWith(`${expectedRoot}${path.sep}`) ) {
      throw new Error(`Refusing to clean unexpected pack source path: ${resolved}`);
    }
    await rm(sourceDir, { recursive: true, force: true });
  }
}

/* -------------------------------------------- */

async function writeSource(file, document) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${YAML.dump(document, { lineWidth: 120, noRefs: true })}\n`, "utf8");
}

/* -------------------------------------------- */

function collectAssetReferences(value, assets) {
  if ( typeof value === "string" ) {
    if ( value.startsWith("systems/n5eb/") ) assets.add(value.replace(/&amp;/g, "&"));
    const matches = value.match(/systems\/n5eb\/[^"'<>\n\r]+/g) ?? [];
    for ( const match of matches ) assets.add(match.replace(/&amp;/g, "&").trim());
    return;
  }

  if ( Array.isArray(value) ) {
    for ( const child of value ) collectAssetReferences(child, assets);
    return;
  }

  if ( value && (typeof value === "object") ) {
    for ( const child of Object.values(value) ) collectAssetReferences(child, assets);
  }
}

/* -------------------------------------------- */

async function copyReferencedAssets(assets) {
  audit.assets.referenced = assets.size;
  for ( const asset of [...assets].sort() ) {
    const relative = asset.replace(/^systems\/n5eb\//, "");
    const decoded = decodeAssetPath(relative);
    let source = path.join(oldRoot, decoded);
    const destination = path.join(SYSTEM_ROOT, decoded);

    if ( fs.existsSync(destination) ) {
      audit.assets.existing++;
      continue;
    }
    if ( !fs.existsSync(source) ) {
      const fallback = findLegacyAssetByBasename(decoded);
      if ( fallback ) {
        source = fallback;
        audit.assets.fallbacks.push({
          asset,
          source: toPosix(path.relative(oldRoot, fallback))
        });
      } else {
        audit.assets.missing.push(asset);
        continue;
      }
    }

    audit.assets.copied++;
    if ( dryRun ) continue;
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

/* -------------------------------------------- */

let legacyAssetBasenameIndex = null;

function findLegacyAssetByBasename(decodedRelativePath) {
  legacyAssetBasenameIndex ??= buildLegacyAssetBasenameIndex();
  const basename = path.basename(decodedRelativePath);
  const ext = path.extname(basename);
  const stem = basename.slice(0, basename.length - ext.length);
  const names = [basename];

  const unsuffixed = stem.replace(/-[A-Za-z0-9]{16}$/, "");
  if ( unsuffixed && (unsuffixed !== stem) ) names.unshift(`${unsuffixed}${ext}`);
  const semanticSegments = stem.split("-").filter(part => part && !/^[A-Za-z0-9]{16}$/.test(part)
    && (part !== "pages"));
  const semanticName = semanticSegments.at(-1);
  if ( semanticName ) names.unshift(`${semanticName}${ext}`);

  for ( const name of names ) {
    const matches = legacyAssetBasenameIndex.get(name.toLowerCase());
    if ( matches?.length ) return matches[0];
  }

  return null;
}

/* -------------------------------------------- */

function buildLegacyAssetBasenameIndex() {
  const index = new Map();
  const stack = [oldRoot];
  while ( stack.length ) {
    const dir = stack.pop();
    for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
      const fullPath = path.join(dir, entry.name);
      if ( entry.isDirectory() ) {
        if ( [".git", "packs"].includes(entry.name) ) continue;
        stack.push(fullPath);
        continue;
      }
      if ( !entry.isFile() ) continue;
      const key = entry.name.toLowerCase();
      const existing = index.get(key) ?? [];
      existing.push(fullPath);
      index.set(key, existing);
    }
  }
  return index;
}

/* -------------------------------------------- */

async function writeAudit() {
  audit.unresolvedUUIDs = uniqueObjects(audit.unresolvedUUIDs, u => `${u.uuid}|${u.oldPack}|${u.path}|${u.field}`);
  audit.assets.missing = [...new Set(audit.assets.missing)].sort();
  await mkdir(path.dirname(auditPath), { recursive: true });
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

/* -------------------------------------------- */

async function writeUuidMap(uuidMap) {
  const mappings = Object.fromEntries([...uuidMap.entries()].sort(([a], [b]) => a.localeCompare(b)));
  audit.uuidMappings = Object.keys(mappings).length;
  await mkdir(path.dirname(LEGACY_UUID_MAP_PATH), { recursive: true });
  await writeFile(LEGACY_UUID_MAP_PATH, `${JSON.stringify(mappings, null, 2)}\n`, "utf8");
}

/* -------------------------------------------- */

function printSummary() {
  console.log(`Old N5eB import ${dryRun ? "dry run" : "complete"}`);
  console.log(`Documents imported: ${audit.counts.imported}`);
  console.log(`Target packs: ${TARGET_PACKS.length}`);
  console.log(`Compendium folders imported: ${audit.counts.foldersImported}`);
  console.log(`Current-only starter/sample documents folded in: ${audit.counts.currentOnlyImported}`);
  console.log(`Current duplicates replaced: ${audit.counts.duplicatesReplaced}`);
  console.log(`Old duplicate identifiers preserved with suffixes: ${audit.counts.oldDuplicateIdentifiers}`);
  console.log(`Invalid/skipped documents: ${audit.counts.invalid}`);
  console.log(`Referenced assets: ${audit.assets.referenced}`);
  console.log(`Assets ${dryRun ? "to copy" : "copied"}: ${audit.assets.copied}`);
  console.log(`UUID mappings: ${audit.uuidMappings}`);
  console.log(`Missing assets: ${audit.assets.missing.length}`);
  console.log(`Unresolved UUID references: ${uniqueObjects(audit.unresolvedUUIDs, u => `${u.uuid}|${u.oldPack}|${u.path}|${u.field}`).length}`);
  console.log(`Audit report: ${auditPath}`);
}

/* -------------------------------------------- */

function classifyTargetPack(pack, documentName) {
  if ( !TARGET_PACKS.includes(pack) ) return null;
  if ( documentName !== packDocumentName(pack) ) return null;
  return pack;
}

/* -------------------------------------------- */

function classifyCurrentTargetPack(sourcePack, document, documentName) {
  if ( documentName === "Actor" ) return "npc";
  if ( documentName === "JournalEntry" ) return sourcePack === "n5eb-rules" ? "rules" : "cheat-sheets";
  if ( documentName !== "Item" ) return null;

  if ( document.type === "spell" ) return "jutsus";
  if ( PHYSICAL_TYPES.has(document.type) || (document.type === "backpack") ) return "items";
  if ( document.type === "class" ) return "class";
  if ( document.type === "subclass" ) return "subclass";
  if ( document.type === "classmod" ) return "classmod";
  if ( document.type === "race" ) return "clan";
  if ( document.type === "background" ) return "backgrounds";

  if ( document.type === "feat" ) {
    if ( sourcePack === "n5eb-classes" ) return "class";
    if ( sourcePack === "n5eb-origins" ) return "traits-quirks";
    if ( sourcePack === "n5eb-equipment" ) return "items";
    return "feats";
  }

  return null;
}

/* -------------------------------------------- */

function packDocumentName(pack) {
  if ( JOURNAL_PACKS.has(pack) ) return "JournalEntry";
  if ( ACTOR_PACKS.has(pack) ) return "Actor";
  return "Item";
}

/* -------------------------------------------- */

function getDocumentName(document) {
  if ( document._key?.startsWith("!folders!") ) return "Folder";
  if ( document.pages ) return "JournalEntry";
  if ( ACTOR_TYPES.has(document.type) ) return "Actor";
  if ( document.type ) return "Item";
  return "Invalid";
}

/* -------------------------------------------- */

function getIdentifier(document) {
  return document.system?.identifier || document.identifier || formatIdentifier(document.name || document._id);
}

/* -------------------------------------------- */

function unwrapReplacedCurrent(document) {
  let snapshot = document;
  const seen = new Set();
  while ( snapshot?.flags?.n5eb?.legacyImport?.replacedCurrent && !seen.has(snapshot) ) {
    seen.add(snapshot);
    snapshot = snapshot.flags.n5eb.legacyImport.replacedCurrent;
  }

  snapshot = structuredClone(snapshot);
  if ( snapshot.flags?.n5eb?.legacyImport ) delete snapshot.flags.n5eb.legacyImport;
  if ( snapshot.flags?.n5eb && !Object.keys(snapshot.flags.n5eb).length ) delete snapshot.flags.n5eb;
  if ( snapshot.flags && !Object.keys(snapshot.flags).length ) delete snapshot.flags;
  return snapshot;
}

/* -------------------------------------------- */

function makeDuplicateKey(pack, documentName, type, identifier) {
  return [pack, documentName, type ?? documentName, identifier].map(part => `${part}`.toLowerCase()).join("|");
}

/* -------------------------------------------- */

function chooseDocumentId(oldId, targetPack, usedIds) {
  if ( isFoundryId(oldId) && !usedIds.get(targetPack).has(oldId) ) return oldId;
  let id = makeId(`${targetPack}.${oldId}.${usedIds.get(targetPack).size}`);
  while ( usedIds.get(targetPack).has(id) ) id = makeId(`${id}.${Math.random()}`);
  return id;
}

/* -------------------------------------------- */

function normalizeExistingDocumentId(value, seed) {
  if ( isFoundryId(value) ) return value;
  const clean = `${value ?? ""}`.replace(/[^A-Za-z0-9]/g, "");
  if ( clean && (clean.length <= 16) ) return clean.padEnd(16, "0");
  return makeId(`${seed}.${value}`);
}

/* -------------------------------------------- */

function oldStyleOutputPath(targetPack, oldRelativePath) {
  const parsed = path.posix.parse(oldRelativePath);
  const relDir = parsed.dir ? parsed.dir.split("/").map(formatFilename).join(path.sep) : "";
  const filename = parsed.base === "_folder.json" ? "_folder.yml" : `${formatFilename(parsed.name)}.yml`;
  return path.join(PACK_SOURCE_ROOT, targetPack, relDir, filename);
}

/* -------------------------------------------- */

function currentOnlyOutputPath(currentDocument) {
  const parsed = path.posix.parse(currentDocument.sourceRelativePath);
  const relDir = parsed.dir ? parsed.dir.split("/").map(formatFilename).join(path.sep) : "";
  const filename = `${formatFilename(parsed.name)}-${currentDocument.document._id}.yml`;
  return path.join(PACK_SOURCE_ROOT, currentDocument.targetPack, "current-import",
    formatFilename(currentDocument.sourcePack), relDir, filename);
}

/* -------------------------------------------- */

function keyForDocument(documentName, id) {
  return {
    Actor: `!actors!${id}`,
    Item: `!items!${id}`,
    JournalEntry: `!journal!${id}`,
    Folder: `!folders!${id}`
  }[documentName];
}

/* -------------------------------------------- */

function remapFolderId(folderId, entry) {
  if ( !folderId ) return null;
  return entry.folderIdMap?.get(folderId) ?? folderId;
}

/* -------------------------------------------- */

function normalizeStats(stats, entry) {
  stats ??= {};
  return {
    duplicateSource: stats.duplicateSource ?? null,
    coreVersion: stats.coreVersion ?? "13.351",
    systemId: "n5eb",
    systemVersion: normalizeSystemVersion(stats.systemVersion),
    createdTime: stats.createdTime ?? Date.now(),
    modifiedTime: stats.modifiedTime ?? Date.now(),
    lastModifiedBy: "n5ebbuilder00000",
    exportSource: stats.exportSource ?? null,
    legacyImport: {
      sourcePack: entry.oldPack,
      sourcePath: entry.oldRelativePath
    }
  };
}

/* -------------------------------------------- */

function inferRank(relPath) {
  const match = relPath.match(/(?:^|\/)([edcbas])-rank(?:\/|$)/i);
  return match?.[1]?.toLowerCase();
}

/* -------------------------------------------- */

function normalizeSystemVersion(version) {
  version = `${version ?? ""}`;
  return /^\d+\.\d+\.\d+/.test(version) ? version : "3.0.0";
}

/* -------------------------------------------- */

function normalizeRank(rank) {
  if ( !rank ) return null;
  const clean = `${rank}`.trim().toLowerCase().replace(/-?rank$/, "");
  return clean in SPELL_LEVEL_BY_RANK ? clean : null;
}

/* -------------------------------------------- */

function rankForLevel(level) {
  const numeric = Math.min(Math.max(Number(level) || 0, 0), 9);
  return RANK_BY_SPELL_LEVEL[numeric] ?? "d";
}

/* -------------------------------------------- */

function normalizeChakraScaling(system) {
  system.chakra ??= {};
  if ( system.chakra.scaling?.mode ) {
    delete system.chakraScaling;
    return;
  }

  const scaling = system.chakraScaling;
  const mode = `${scaling?.mode ?? ""}`.toLowerCase();
  const value = Number(scaling?.value ?? 0);
  if ( (mode === "level") && Number.isFinite(value) && (value > 0) ) {
    system.chakra.scaling = { mode: "rank", value: Math.floor(value) };
    if ( isLegacyScalingNote(system.chakra.special) ) system.chakra.special = "";
  } else {
    system.chakra.scaling = { mode: "none", value: 0 };
    if ( mode === "none" && Number.isFinite(value) && (value > 0) ) {
      system.chakra.special = `Legacy chakra scaling value ${value} was marked none.`;
    } else if ( isLegacyScalingNote(system.chakra.special) ) system.chakra.special = "";
  }
  delete system.chakraScaling;
}

/* -------------------------------------------- */

function isLegacyScalingNote(value) {
  if ( !value ) return false;
  const trimmed = `${value}`.trim();
  return /^-?\d+$/.test(trimmed) || /^\{.*"mode".*"value".*\}$/.test(trimmed);
}

/* -------------------------------------------- */

function keysOf(value) {
  if ( Array.isArray(value) ) return value.filter(Boolean);
  if ( value instanceof Set ) return [...value].filter(Boolean);
  if ( value && (typeof value === "object") ) {
    return Object.entries(value).filter(([, active]) => active).map(([key]) => key);
  }
  return [];
}

/* -------------------------------------------- */

function formatIdentifier(value) {
  return `${value ?? ""}`.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "legacy-import";
}

/* -------------------------------------------- */

function formatFilename(value) {
  return formatIdentifier(value).slice(0, 96);
}

/* -------------------------------------------- */

function makeId(seed) {
  return crypto.createHash("sha1").update(seed).digest("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
}

/* -------------------------------------------- */

function isFoundryId(value) {
  return /^[A-Za-z0-9]{16}$/.test(value ?? "");
}

/* -------------------------------------------- */

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/* -------------------------------------------- */

function decodeAssetPath(value) {
  return value.split(/[\\/]/).map(part => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }).join(path.sep);
}

/* -------------------------------------------- */

function uniqueObjects(values, keyFn) {
  const seen = new Set();
  return values.filter(value => {
    const key = keyFn(value);
    if ( seen.has(key) ) return false;
    seen.add(key);
    return true;
  });
}

/* -------------------------------------------- */

async function* walkFiles(dir, extension) {
  if ( !fs.existsSync(dir) ) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for ( const entry of entries ) {
    const fullPath = path.join(dir, entry.name);
    if ( entry.isDirectory() ) yield* walkFiles(fullPath, extension);
    else if ( entry.name.endsWith(extension) ) yield fullPath;
  }
}

/* -------------------------------------------- */

function toPosix(value) {
  return value.split(path.sep).join("/");
}
