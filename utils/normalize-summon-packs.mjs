/* eslint-disable jsdoc/require-jsdoc */

import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import YAML from "js-yaml";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_ROOT = path.resolve(__dirname, "..");
const PACK_SOURCE_ROOT = path.join(SYSTEM_ROOT, "packs", "_source");

const ACTOR_PACKS = ["npc", "hb-npc", "t7-npc"];
const ITEM_PACKS = ["summons", "hb-summons", "t7-summons"];
const RANKS = new Set(["d", "c", "b", "a", "s"]);
const LEGACY_RANKS = {
  erank: "d",
  drank: "d",
  crank: "c",
  brank: "b",
  arank: "a",
  srank: "s"
};
const ROLES = new Set(["caster", "controller", "defender", "lurker", "striker", "supporter"]);
const ROLE_MAP = {
  casternin: "caster",
  castergen: "caster",
  castertai: "caster",
  strikernin: "striker",
  strikergen: "striker",
  strikertai: "striker",
  controller: "controller",
  defender: "defender",
  generalist: "striker",
  lurker: "lurker",
  supporter: "supporter"
};
const SUMMON_TYPES = new Set([
  "", "amphibian", "avian", "carnivoran", "dragon", "herbivore", "insectoid", "puppet", "reptilian", "rodent",
  "spirit", "other"
]);
const ABILITIES = new Set(["str", "dex", "con", "int", "wis", "cha"]);

const argv = yargs(hideBin(process.argv))
  .option("dry-run", {
    type: "boolean",
    default: false,
    describe: "Report changes without writing pack sources."
  })
  .option("audit", {
    type: "string",
    describe: "Optional path to write a JSON audit report."
  })
  .strict()
  .help()
  .parseSync();

const audit = {
  actorsScanned: 0,
  actorCandidates: 0,
  actorNormalized: 0,
  actorAlreadyNormalized: 0,
  itemDocumentsScanned: 0,
  summonFeaturesNormalized: 0,
  summonFeaturesAlreadyTyped: 0,
  summonWeaponsAudited: 0,
  summonJutsuAudited: 0,
  embeddedSummonItemsNormalized: 0,
  legacyClassTemplates: 0,
  legacyClassTemplatesMarked: 0,
  changedFiles: [],
  warnings: []
};

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

async function main() {
  for ( const pack of ACTOR_PACKS ) await normalizeActorPack(pack);
  for ( const pack of ITEM_PACKS ) await normalizeItemPack(pack);
  if ( argv.audit ) await writeAudit(path.resolve(argv.audit));
  printSummary();
}

async function normalizeActorPack(pack) {
  const root = path.join(PACK_SOURCE_ROOT, pack);
  if ( !fs.existsSync(root) ) return;
  for await ( const file of walkFiles(root, ".yml") ) {
    if ( path.basename(file) === "_folder.yml" ) continue;
    const source = await readFile(file, "utf8");
    const document = YAML.load(source);
    if ( document?.type !== "npc" ) continue;
    audit.actorsScanned++;

    const before = JSON.stringify(document);
    const candidate = normalizeActorDocument(document, toPosix(path.relative(root, file)));
    if ( !candidate ) continue;
    const changed = before !== JSON.stringify(document);
    if ( !changed ) {
      audit.actorAlreadyNormalized++;
      continue;
    }

    audit.actorNormalized++;
    audit.changedFiles.push(toPosix(path.relative(SYSTEM_ROOT, file)));
    if ( !argv.dryRun ) await writeFile(file, YAML.dump(document, { lineWidth: 120, noRefs: true }), "utf8");
  }
}

function normalizeActorDocument(document, relativePath) {
  document.system ??= {};
  document.system.attributes ??= {};
  if ( document.system.attributes.cp && !document.system.attributes.chakra ) {
    document.system.attributes.chakra = document.system.attributes.cp;
    delete document.system.attributes.cp;
  }

  document.system.details ??= {};
  const details = document.system.details;
  const sourcePath = getLegacySourcePath(document) || relativePath.replace(/\.ya?ml$/i, ".json");
  const candidate = details.summon?.enabled || (details.npcType === "summon") || isSummonActorPath(sourcePath);
  if ( !candidate ) return false;
  audit.actorCandidates++;

  const classTemplate = getEmbeddedClassTemplate(document);
  const parsed = parseSummonTemplate(classTemplate?.system?.description?.value ?? details.biography?.value ?? "");
  parsed.jutsuAbility ||= getClassJutsuAbility(classTemplate);
  const category = normalizeCategory(details.summon?.category ?? inferCategory(sourcePath));
  const tribe = normalizeTribe(details.summon?.tribe ?? inferTribe(sourcePath) ?? inferTribe(document.name));
  const role = normalizeRole(details.summon?.role ?? details.role);
  const level = normalizeLevel(details.summon?.level ?? details.level ?? details.cr, document.items);

  details.summon = {
    enabled: true,
    level,
    rank: normalizeRank(details.summon?.rank ?? details.rank ?? inferRank(sourcePath)),
    category,
    tribe,
    variant: details.summon?.variant ?? (category === "inuzuka" ? slug(document.name) : ""),
    role,
    summonType: normalizeSummonType(details.summon?.summonType || parsed.summonType),
    toughness: Math.max(
      0, Number(details.summon?.toughness || classTemplate?.system?.toughness || parsed.toughness) || 0
    ),
    defenseAbility: normalizeAbility(details.summon?.defenseAbility || parsed.defenseAbility),
    jutsuAbility: normalizeAbility(details.summon?.jutsuAbility || parsed.jutsuAbility),
    migrated: true,
    sourceUuid: details.summon?.sourceUuid ?? getCompendiumSourceUuid(document)
  };

  normalizeEmbeddedSummonItems(document, sourcePath);

  if ( details.adversary ) details.adversary.enabled = false;
  for ( const key of ["npcType", "rank", "classNPC", "affiliation", "role", "highRole", "clan"] ) delete details[key];
  return true;
}

async function normalizeItemPack(pack) {
  const root = path.join(PACK_SOURCE_ROOT, pack);
  if ( !fs.existsSync(root) ) return;
  for await ( const file of walkFiles(root, ".yml") ) {
    if ( path.basename(file) === "_folder.yml" ) continue;
    const source = await readFile(file, "utf8");
    const document = YAML.load(source);
    if ( !document?.type ) continue;
    audit.itemDocumentsScanned++;

    const before = JSON.stringify(document);
    normalizeItemDocument(document, toPosix(path.relative(root, file)), pack);
    const changed = before !== JSON.stringify(document);
    if ( !changed ) continue;

    audit.changedFiles.push(toPosix(path.relative(SYSTEM_ROOT, file)));
    if ( !argv.dryRun ) await writeFile(file, YAML.dump(document, { lineWidth: 120, noRefs: true }), "utf8");
  }
}

function normalizeItemDocument(document, relativePath, pack) {
  const sourcePath = getLegacySourcePath(document) || relativePath.replace(/\.ya?ml$/i, ".json");
  const summonSourced = ITEM_PACKS.includes(pack) || sourcePath.includes("summon") || relativePath.includes("summon");

  if ( document.type === "class" && summonSourced ) {
    audit.legacyClassTemplates++;
    document.flags ??= {};
    document.flags.n5eb ??= {};
    document.flags.n5eb.summonBuilder ??= {};
    if ( document.flags.n5eb.summonBuilder.legacyTemplate !== true ) {
      document.flags.n5eb.summonBuilder.legacyTemplate = true;
      audit.legacyClassTemplatesMarked++;
    }
    return;
  }

  if ( document.type === "feat" && summonSourced ) {
    document.system ??= {};
    document.system.type ??= {};
    const wasSummon = document.system.type.value === "summon";
    document.system.type.value = "summon";
    document.system.type.subtype = normalizeSubtype(document.system.type.subtype, sourcePath);
    const rank = normalizeRank(document.system.type.nestedsubtype ?? inferRank(sourcePath));
    document.system.type.nestedsubtype = rank || "";
    if ( wasSummon ) audit.summonFeaturesAlreadyTyped++;
    else audit.summonFeaturesNormalized++;
    return;
  }

  if ( document.type === "weapon" && summonSourced ) audit.summonWeaponsAudited++;
  if ( document.type === "spell" && summonSourced ) audit.summonJutsuAudited++;
}

function normalizeEmbeddedSummonItems(document, actorSourcePath) {
  for ( const item of document.items ?? [] ) {
    if ( item.type !== "feat" ) continue;
    const sourcePath = getLegacySourcePath(item) || actorSourcePath;
    const summonSourced = item.system?.type?.value === "summon" || sourcePath.includes("summon")
      || actorSourcePath.includes("summon");
    if ( !summonSourced ) continue;

    const before = JSON.stringify(item.system?.type ?? {});
    item.system ??= {};
    item.system.type ??= {};
    item.system.type.value = "summon";
    item.system.type.subtype = normalizeSubtype(item.system.type.subtype, sourcePath);
    item.system.type.nestedsubtype = normalizeRank(item.system.type.nestedsubtype ?? inferRank(sourcePath));
    if ( before !== JSON.stringify(item.system.type) ) audit.embeddedSummonItemsNormalized++;
  }
}

async function writeAudit(auditPath) {
  await mkdir(path.dirname(auditPath), { recursive: true });
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

function printSummary() {
  console.log(`Summon pack normalization ${argv.dryRun ? "dry run" : "complete"}`);
  console.log(`Actors scanned: ${audit.actorsScanned}`);
  console.log(`Summon actor candidates: ${audit.actorCandidates}`);
  console.log(`${argv.dryRun ? "Actors that would be normalized" : "Actors normalized"}: ${audit.actorNormalized}`);
  console.log(`Already normalized actors: ${audit.actorAlreadyNormalized}`);
  console.log(`Item documents scanned: ${audit.itemDocumentsScanned}`);
  console.log(`Summon features typed: ${audit.summonFeaturesNormalized}`);
  console.log(`Summon features already typed: ${audit.summonFeaturesAlreadyTyped}`);
  console.log(`Natural weapons audited: ${audit.summonWeaponsAudited}`);
  console.log(`Summon jutsu audited: ${audit.summonJutsuAudited}`);
  console.log(`Embedded summon items normalized: ${audit.embeddedSummonItemsNormalized}`);
  console.log(`Legacy summon class templates: ${audit.legacyClassTemplates}`);
  console.log(`Legacy class templates marked: ${audit.legacyClassTemplatesMarked}`);
  console.log(`Changed files: ${audit.changedFiles.length}`);
  if ( argv.audit ) console.log(`Audit report: ${path.resolve(argv.audit)}`);
  if ( audit.legacyClassTemplates ) {
    console.log("Legacy class templates are kept as authoring references; no NPC stat blocks were synthesized from them.");
  }
}

async function* walkFiles(dir, ext) {
  if ( !fs.existsSync(dir) ) return;
  for ( const entry of await fs.promises.readdir(dir, { withFileTypes: true }) ) {
    const file = path.join(dir, entry.name);
    if ( entry.isDirectory() ) yield* walkFiles(file, ext);
    else if ( entry.isFile() && file.endsWith(ext) ) yield file;
  }
}

function getEmbeddedClassTemplate(document) {
  return (document.items ?? []).find(item => item.type === "class");
}

function getClassJutsuAbility(item) {
  for ( const advancement of item?.system?.advancement ?? [] ) {
    for ( const grant of advancement.configuration?.grants ?? [] ) {
      const ability = `${grant ?? ""}`.match(/^jutsuscore:([a-z]{3})$/i)?.[1];
      if ( ability ) return normalizeAbility(ability);
    }
  }
  return "";
}

function getLegacySourcePath(document) {
  return slug(document.flags?.n5eb?.legacyImport?.sourcePath ?? document._stats?.legacyImport?.sourcePath ?? "");
}

function getCompendiumSourceUuid(document) {
  const sourceId = document.flags?.n5eb?.legacyImport?.sourceId;
  const sourcePack = document.flags?.n5eb?.legacyImport?.sourcePack;
  return sourceId && sourcePack ? `Compendium.n5eb.${sourcePack}.Actor.${sourceId}` : "";
}

function isSummonActorPath(sourcePath) {
  return /(^|\/|-)(jutsu-summons|tribe-summons|inuzuka-summons)(\/|-|$)/.test(sourcePath);
}

function parseSummonTemplate(description) {
  const text = stripHtml(description);
  return {
    summonType: slug(text.match(/Summon Type\s*:?\s*([A-Za-z /-]+?)(?=\s+Toughness|\s+Defensive|\s+Saving|$)/i)?.[1]
      ?? ""),
    toughness: Number(text.match(/Toughness\s*:?\s*(\d+)/i)?.[1]) || 0,
    defenseAbility: normalizeAbility(text.match(/Defensive Ability Score\s*:?\s*([A-Za-z]+)/i)?.[1]),
    jutsuAbility: normalizeAbility(text.match(/jutsuscore:([a-z]{3})/i)?.[1])
  };
}

function normalizeRank(rank) {
  rank = `${rank ?? ""}`.toLowerCase();
  if ( LEGACY_RANKS[rank] ) return LEGACY_RANKS[rank];
  return RANKS.has(rank) ? rank : "d";
}

function normalizeLevel(level, items=[]) {
  const classLevels = items.reduce((total, item) => {
    if ( item.type !== "class" ) return total;
    const levels = Number(item.system?.levels);
    return total + (Number.isFinite(levels) ? Math.max(0, Math.trunc(levels)) : 0);
  }, 0);
  if ( classLevels ) return Math.min(Math.max(classLevels, 1), 30);
  level = Number(level);
  if ( Number.isFinite(level) && level ) return Math.min(Math.max(Math.trunc(level), 1), 30);
  return 1;
}

function normalizeCategory(category) {
  category = slug(category);
  if ( ["tribe", "inuzuka", "jutsu", "custom"].includes(category) ) return category;
  return "tribe";
}

function inferCategory(sourcePath) {
  if ( sourcePath.includes("inuzuka-summons") ) return "inuzuka";
  if ( sourcePath.includes("jutsu-summons") ) return "jutsu";
  return "tribe";
}

function normalizeTribe(tribe) {
  tribe = slug(tribe);
  if ( tribe === "dog-wolf" ) return "dogWolf";
  if ( tribe === "hare-rabbit" ) return "hareRabbit";
  if ( ["corvid", "insect", "lizard", "rat", "shark", "snake", "spider", "toad", "turtle", "weasel"].includes(tribe) ) {
    return tribe;
  }
  return tribe ? "custom" : "";
}

function inferTribe(value) {
  value = slug(value);
  if ( value.includes("dog-wolf") || value.includes("wolf") || value.includes("inuit")
    || value.includes("kugsha") || value.includes("yamaskan") || value.includes("tamaskan") ) return "dogWolf";
  if ( value.includes("hare") || value.includes("rabbit") || value.includes("usagi") ) return "hareRabbit";
  for ( const tribe of ["corvid", "insect", "lizard", "rat", "shark", "snake", "spider", "toad", "turtle", "weasel"] ) {
    if ( value.includes(tribe) ) return tribe;
  }
  return "";
}

function normalizeRole(role) {
  role = slug(role);
  if ( ROLES.has(role) ) return role;
  return ROLE_MAP[role] ?? "striker";
}

function normalizeSummonType(type) {
  type = slug(type);
  if ( type === "rodents" ) return "rodent";
  if ( type === "dragon" ) return "dragon";
  return SUMMON_TYPES.has(type) ? type : "";
}

function normalizeAbility(ability) {
  ability = `${ability ?? ""}`.trim().toLowerCase().slice(0, 3);
  return ABILITIES.has(ability) ? ability : "";
}

function normalizeSubtype(subtype, sourcePath) {
  const original = `${subtype ?? ""}`;
  if ( ["role", "tribe", "rank", "naturalWeapon", "senses", "variant", "jutsu", "special"].includes(original) ) {
    return original;
  }
  subtype = slug(original);
  if ( subtype === "naturalweapon" ) return "naturalWeapon";
  if ( ["role", "tribe", "rank", "senses", "variant", "jutsu", "special"].includes(subtype) ) return subtype;
  if ( sourcePath.includes("role-features") ) return "role";
  if ( sourcePath.includes("natural-weapons") || sourcePath.includes("tribe-weapons") ) return "naturalWeapon";
  if ( sourcePath.includes("senses") ) return "senses";
  if ( sourcePath.includes("summon-jutsus") ) return "jutsu";
  if ( sourcePath.includes("inuzuka-summon-features") ) return "variant";
  if ( /(^|-)rank($|-)/.test(sourcePath) ) return "rank";
  if ( sourcePath.includes("features") ) return "tribe";
  return "special";
}

function inferRank(sourcePath) {
  return sourcePath.match(/(^|-)([dcbas])-rank($|-)/)?.[2]
    ?? sourcePath.match(/(^|-)([dcbas])rank($|-)/)?.[2] ?? "";
}

function stripHtml(value) {
  return `${value ?? ""}`.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return `${value ?? ""}`.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
