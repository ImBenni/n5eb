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

const ACTOR_PACKS = ["adversary", "hb-adversary", "t7-adversary"];
const FEATURE_PACKS = ["adversary-traits", "adversary-passives"];
const CLAN_SYMBOL_ROOT = "systems/n5eb/assets/content/clans";
const CLAN_SYMBOL_ALIASES = {
  kozu: "kuzo",
  "variant-senju": "senju"
};
const NON_CLAN_PASSIVE_ICONS = {
  abberation: "icons/creatures/magical/humanoid-silhouette-glowing-pink.webp",
  beast: "icons/creatures/abilities/cougar-pounce-stalk-black.webp",
  celestial: "systems/n5eb/assets/content/items/celestialclan.webp",
  construct: "icons/commodities/tech/cog-brass.webp",
  haruno: "icons/magic/life/heart-cross-strong-green.webp",
  monstrosity: "icons/creatures/abilities/fang-tooth-blood-red.webp",
  mutant: "icons/magic/unholy/silhouette-evil-horned-giant.webp",
  plant: "icons/magic/nature/vines-thorned-entwined-green.webp",
  "sage-creature": "systems/n5eb/assets/content/jutsu-icons/sage-mode.webp",
  undead: "icons/magic/death/skull-energy-light-white.webp"
};
const CORE_FEATURE_ICONS = [
  "icons/skills/melee/blade-tip-chipped-blood-red.webp",
  "icons/skills/melee/strike-sword-gray.webp",
  "icons/skills/melee/unarmed-punch-fist-blue.webp",
  "icons/skills/melee/hand-grip-sword-orange.webp",
  "icons/skills/melee/weapons-crossed-swords-teal.webp",
  "icons/skills/melee/weapon-crossed-staffs-purple.webp",
  "icons/skills/melee/strike-axe-blood-red.webp",
  "icons/skills/melee/strike-hammer-destructive-blue.webp",
  "icons/skills/melee/strike-polearm-light-orange.webp",
  "icons/skills/movement/arrow-upward-yellow.webp",
  "icons/skills/movement/feet-winged-boots-brown.webp",
  "icons/skills/movement/figure-running-gray.webp",
  "icons/skills/movement/figure-running-orange.webp",
  "icons/skills/movement/feet-spurred-boots-brown.webp",
  "icons/skills/ranged/target-bullseye-arrow-blue.webp",
  "icons/skills/ranged/arrow-flying-broadhead-blue.webp",
  "icons/skills/ranged/arrows-flying-salvo-blue.webp",
  "icons/skills/ranged/person-archery-bow-attack-orange.webp",
  "icons/skills/targeting/crosshair-bars-yellow.webp",
  "icons/skills/targeting/target-strike-triple-blue.webp",
  "icons/skills/targeting/target-glowing-yellow.webp",
  "icons/skills/social/diplomacy-handshake-gray.webp",
  "icons/skills/social/intimidation-impressing.webp",
  "icons/skills/social/trading-justice-scale-yellow.webp",
  "icons/magic/control/buff-strength-muscle-damage-orange.webp",
  "icons/magic/control/debuff-chains-ropes-red.webp",
  "icons/magic/control/hypnosis-mesmerism-eye.webp",
  "icons/magic/control/silhouette-hold-beam-blue.webp",
  "icons/magic/defensive/shield-barrier-flaming-diamond-red.webp",
  "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp",
  "icons/magic/defensive/shield-barrier-glowing-blue.webp",
  "icons/magic/defensive/armor-stone-skin.webp",
  "icons/magic/defensive/barrier-shield-dome-deflect-blue.webp",
  "icons/magic/light/explosion-star-small-blue-yellow.webp",
  "icons/magic/light/projectile-beams-salvo-white.webp",
  "icons/magic/light/beam-rays-blue.webp",
  "icons/magic/perception/eye-ringed-glow-angry-red.webp",
  "icons/magic/perception/third-eye-blue-red.webp",
  "icons/magic/perception/orb-eye-scrying.webp",
  "icons/magic/symbols/runes-star-pentagon-orange.webp",
  "icons/magic/symbols/rune-sigil-hook-white-red.webp",
  "icons/magic/symbols/rune-sigil-rough-white-teal.webp",
  "icons/magic/symbols/circle-ouroboros.webp",
  "icons/magic/symbols/star-rising-purple.webp",
  "icons/magic/water/wave-water-blue.webp",
  "icons/magic/water/water-wave-beam.webp",
  "icons/magic/water/projectile-icecicle.webp",
  "icons/magic/air/wind-tornado-cyclone-white.webp",
  "icons/magic/air/wind-stream-blue-gray.webp",
  "icons/magic/fire/flame-burning-fist-strike.webp",
  "icons/magic/fire/flame-burning-eye.webp",
  "icons/magic/fire/projectile-fireball-smoke-orange.webp",
  "icons/magic/earth/projectile-stone-landslide.webp",
  "icons/magic/earth/barrier-stone-explosion-debris.webp",
  "icons/magic/lightning/bolt-strike-blue.webp",
  "icons/magic/lightning/bolt-forked-large-blue-yellow.webp",
  "icons/magic/lightning/projectile-orb-blue.webp",
  "icons/magic/nature/root-vine-entangled-humanoid.webp",
  "icons/magic/nature/vines-thorned-entwined-green.webp",
  "icons/magic/life/cross-beam-green.webp",
  "icons/magic/life/heart-cross-strong-green.webp",
  "icons/magic/death/skull-horned-goat-pentagram-red.webp",
  "icons/magic/death/skull-energy-light-white.webp",
  "icons/equipment/shield/heater-steel-grey.webp",
  "icons/equipment/shield/round-wooden-boss-steel-brown.webp",
  "icons/equipment/shield/wardoor-wooden-boss-brown.webp",
  "icons/equipment/head/mask-carved-bird-grey-pink.webp",
  "icons/equipment/head/mask-horned-brown.webp",
  "icons/equipment/head/hood-cowl-mask-purple.webp",
  "icons/equipment/back/cloak-heavy-black-red.webp",
  "icons/equipment/back/cloak-hooded-blue.webp",
  "icons/equipment/chest/breastplate-banded-steel.webp",
  "icons/equipment/chest/breastplate-cuirass-steel-grey.webp",
  "icons/equipment/hand/glove-tooled-leather-brown.webp",
  "icons/equipment/feet/boots-collared-rounded-brown.webp",
  "icons/creatures/abilities/cougar-pounce-stalk-black.webp",
  "icons/creatures/abilities/cougar-roar-rush-orange.webp",
  "icons/creatures/abilities/fang-tooth-blood-red.webp",
  "icons/creatures/abilities/fang-tooth-poison-green.webp",
  "icons/creatures/abilities/paw-glowing-yellow.webp",
  "icons/creatures/abilities/stinger-spine-horn-blood.webp",
  "icons/creatures/claws/claw-bear-paw-swipe-red.webp",
  "icons/creatures/claws/claw-curved-jagged-gray.webp",
  "icons/creatures/eyes/human-single-blue.webp",
  "icons/creatures/eyes/humanoid-single-purple-blue.webp",
  "icons/creatures/magical/humanoid-silhouette-dashing-blue.webp",
  "icons/creatures/magical/humanoid-silhouette-glowing-pink.webp",
  "icons/creatures/magical/spirit-fire-orange.webp",
  "icons/creatures/magical/spirit-undead-ghost-blue.webp",
  "icons/creatures/mammals/wolf-howl-moon-forest-blue.webp",
  "icons/creatures/mammals/wolf-shadow-black.webp",
  "icons/creatures/reptiles/snake-fangs-bite-green.webp",
  "icons/creatures/webs/web-spider-glowing-purple.webp"
];

const LEGACY_RANKS = {
  erank: "e",
  "e-rank": "e",
  drank: "d",
  "d-rank": "d",
  crank: "c",
  "c-rank": "c",
  brank: "b",
  "b-rank": "b",
  arank: "a",
  "a-rank": "a",
  srank: "s",
  "s-rank": "s"
};
const RANKS = new Set(["e", "d", "c", "b", "a", "s"]);
const CLASSES = new Set(["minion", "standard", "elite", "solo"]);
const ROLES = new Set(["caster", "controller", "defender", "generalist", "lurker", "striker", "supporter"]);
const ROLE_MAP = {
  casternin: { role: "caster", discipline: "ninjutsu" },
  castergen: { role: "caster", discipline: "genjutsu" },
  castertai: { role: "caster", discipline: "taijutsu" },
  strikernin: { role: "striker", discipline: "ninjutsu" },
  strikergen: { role: "striker", discipline: "genjutsu" },
  strikertai: { role: "striker", discipline: "taijutsu" },
  controller: { role: "controller", discipline: "" },
  defender: { role: "defender", discipline: "" },
  generalist: { role: "generalist", discipline: "" },
  lurker: { role: "lurker", discipline: "" },
  supporter: { role: "supporter", discipline: "" }
};

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
  actorLegacyCandidates: 0,
  actorNormalized: 0,
  actorAlreadyNormalized: 0,
  featureItemsScanned: 0,
  featureItemsNormalized: 0,
  featureNamesChanged: 0,
  featureIconsChanged: 0,
  featureRanksChanged: 0,
  featureTypesChanged: 0,
  featureTypeMismatches: [],
  changedFiles: []
};

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

async function main() {
  for ( const pack of ACTOR_PACKS ) await normalizeActorPack(pack);
  for ( const pack of FEATURE_PACKS ) await auditFeaturePack(pack);
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
    const candidate = normalizeActorDocument(document, pack);
    if ( !candidate ) continue;
    const changed = before !== JSON.stringify(document);
    if ( !changed ) {
      audit.actorAlreadyNormalized++;
      continue;
    }

    audit.actorNormalized++;
    audit.changedFiles.push(toPosix(path.relative(SYSTEM_ROOT, file)));
    if ( !argv.dryRun ) await writeFile(file, `${YAML.dump(document, { lineWidth: 120, noRefs: true })}`, "utf8");
  }
}

function normalizeActorDocument(document, pack) {
  document.system ??= {};
  document.system.attributes ??= {};
  if ( document.system.attributes.cp && !document.system.attributes.chakra ) {
    document.system.attributes.chakra = document.system.attributes.cp;
    delete document.system.attributes.cp;
  }

  document.system.details ??= {};
  const details = document.system.details;
  const hasLegacyFields = ["npcType", "rank", "classNPC", "affiliation", "role", "highRole"].some(k => k in details);
  const candidate = pack.includes("adversary") && (hasLegacyFields || details.adversary?.enabled);
  if ( !candidate ) return false;
  if ( hasLegacyFields ) audit.actorLegacyCandidates++;

  const role = normalizeRole(details.adversary?.role ?? details.role);
  details.adversary = {
    enabled: true,
    level: normalizeLevel(details.adversary?.level ?? details.level ?? details.cr),
    rank: normalizeRank(details.adversary?.rank ?? details.rank),
    class: normalizeClass(details.adversary?.class ?? details.classNPC),
    role: role.role,
    discipline: details.adversary?.discipline ?? role.discipline,
    clan: slug(details.adversary?.clan ?? details.clan ?? ""),
    affiliation: slug(details.adversary?.affiliation ?? details.affiliation ?? ""),
    specialRoles: Array.from(new Set(details.adversary?.specialRoles ?? details.highRole ?? [])),
    fixedJutsuCost: details.adversary?.fixedJutsuCost ?? true,
    migrated: true
  };

  for ( const key of ["npcType", "rank", "classNPC", "affiliation", "role", "highRole", "clan"] ) delete details[key];

  document.system.resources ??= {};
  document.system.resources.tenacity ??= { max: 0, spent: 0, softMax: 0 };
  document.system.resources.eliteact ??= { max: 0, spent: 0 };

  return true;
}

async function auditFeaturePack(pack) {
  const root = path.join(PACK_SOURCE_ROOT, pack);
  if ( !fs.existsSync(root) ) return;
  const expected = pack === "adversary-traits" ? "adversaryTrait" : "adversaryPassive";
  for await ( const file of walkFiles(root, ".yml") ) {
    if ( path.basename(file) === "_folder.yml" ) continue;
    const source = await readFile(file, "utf8");
    const document = YAML.load(source);
    if ( document?.type !== "feat" ) continue;
    audit.featureItemsScanned++;
    const actual = document.system?.type?.value ?? "";
    if ( actual !== expected ) {
      audit.featureTypeMismatches.push({
        pack,
        path: toPosix(path.relative(PACK_SOURCE_ROOT, file)),
        name: document.name,
        expected,
        actual
      });
    }

    const normalized = normalizeFeatureDocument(document, pack, file);
    if ( !normalized.changed ) continue;
    audit.featureItemsNormalized++;
    if ( normalized.nameChanged ) audit.featureNamesChanged++;
    if ( normalized.iconChanged ) audit.featureIconsChanged++;
    if ( normalized.rankChanged ) audit.featureRanksChanged++;
    if ( normalized.typeChanged ) audit.featureTypesChanged++;
    audit.changedFiles.push(toPosix(path.relative(SYSTEM_ROOT, file)));
    if ( !argv.dryRun ) await writeFile(file, applyFeatureDocumentChanges(source, normalized), "utf8");
  }
}

function normalizeFeatureDocument(document, pack, file) {
  const type = document.system?.type?.value;
  const expectedType = pack === "adversary-traits" ? "adversaryTrait"
    : pack === "adversary-passives" ? "adversaryPassive" : type;
  if ( !expectedType && !["adversaryTrait", "adversaryPassive"].includes(type) ) {
    return { changed: false, nameChanged: false, iconChanged: false, typeChanged: false };
  }

  const cleanName = stripRankFromName(document.name);
  const icon = pickFeatureIcon(document, pack, file);
  const typeChanged = type !== expectedType;
  const rank = inferFeatureRank(document, pack, file);
  const rankValue = `${document.system?.type?.nestedsubtype ?? ""}`.trim().toLowerCase();
  const rankChanged = Boolean(rank) && (rank !== rankValue);
  return {
    changed: (cleanName !== document.name) || (icon !== document.img) || rankChanged || typeChanged,
    icon,
    iconChanged: icon !== document.img,
    name: cleanName,
    nameChanged: cleanName !== document.name,
    rank,
    rankChanged,
    type: expectedType,
    typeChanged
  };
}

function applyFeatureDocumentChanges(source, normalized) {
  let output = source;
  if ( normalized.nameChanged ) {
    output = output.replace(/^name:.*$/m, dumpTopLevelScalar("name", normalized.name));
  }
  if ( normalized.iconChanged ) {
    if ( /^img:.*$/m.test(output) ) output = output.replace(/^img:.*$/m, dumpTopLevelScalar("img", normalized.icon));
    else output = output.replace(/^_id:.*$/m, match => `${match}\n${dumpTopLevelScalar("img", normalized.icon)}`);
  }
  if ( normalized.rankChanged ) output = replaceSystemNestedSubtypeValue(output, normalized.rank);
  if ( normalized.typeChanged ) output = replaceSystemTypeValue(output, normalized.type);
  return output;
}

function replaceSystemTypeValue(source, value) {
  const valueLine = /(^[ ]{2}type:\r?\n(?:[ ]{4}[^\r\n]*\r?\n)*?^[ ]{4}value:).*$/m;
  if ( valueLine.test(source) ) return source.replace(valueLine, `$1 ${value}`);
  const typeBlock = /^[ ]{2}type:\r?$/m;
  if ( typeBlock.test(source) ) return source.replace(typeBlock, match => `${match}\n    value: ${value}`);
  return source.replace(/^system:\r?$/m, match => `${match}\n  type:\n    value: ${value}`);
}

function replaceSystemNestedSubtypeValue(source, value) {
  const nestedLine = /(^[ ]{2}type:\r?\n(?:[ ]{4}[^\r\n]*\r?\n)*?^[ ]{4}nestedsubtype:).*$/m;
  if ( nestedLine.test(source) ) return source.replace(nestedLine, `$1 ${value}`);
  const subtypeLine = /(^[ ]{2}type:\r?\n(?:[ ]{4}[^\r\n]*\r?\n)*?^[ ]{4}subtype:.*)$/m;
  if ( subtypeLine.test(source) ) return source.replace(subtypeLine, `$1\n    nestedsubtype: ${value}`);
  const typeBlock = /^[ ]{2}type:\r?$/m;
  if ( typeBlock.test(source) ) return source.replace(typeBlock, match => `${match}\n    nestedsubtype: ${value}`);
  return source.replace(/^system:\r?$/m, match => `${match}\n  type:\n    nestedsubtype: ${value}`);
}

function pickFeatureIcon(document, pack, file) {
  const clanPassiveIcon = pickClanPassiveIcon(pack, file);
  if ( clanPassiveIcon ) return clanPassiveIcon;

  const relPath = toPosix(path.relative(PACK_SOURCE_ROOT, file));
  const subtype = document.system?.type?.subtype ?? "";
  const seed = `${pack}:${subtype}:${relPath}:${stripRankFromName(document.name)}:${document._id ?? ""}`;
  return CORE_FEATURE_ICONS[stableHash(seed) % CORE_FEATURE_ICONS.length];
}

function pickClanPassiveIcon(pack, file) {
  if ( pack !== "adversary-passives" ) return null;

  const relPath = toPosix(path.relative(path.join(PACK_SOURCE_ROOT, "adversary-passives", "clan"), file));
  if ( relPath.startsWith("..") || path.isAbsolute(relPath) ) return null;

  const passiveKey = path.basename(file, path.extname(file)).replace(/-passive$/, "");
  const symbolKey = CLAN_SYMBOL_ALIASES[passiveKey] ?? passiveKey;
  const symbolPath = path.join(SYSTEM_ROOT, "assets", "content", "clans", `${symbolKey}.webp`);
  if ( fs.existsSync(symbolPath) ) return `${CLAN_SYMBOL_ROOT}/${symbolKey}.webp`;

  return NON_CLAN_PASSIVE_ICONS[passiveKey] ?? null;
}

function stripRankFromName(name) {
  return `${name ?? ""}`.replace(/\s*\[[EDCBAS]-Rank\]\s*$/i, "").trim();
}

function inferFeatureRank(document, pack, file) {
  if ( pack !== "adversary-traits" ) return normalizeFeatureRank(document.system?.type?.nestedsubtype);

  const existing = normalizeFeatureRank(document.system?.type?.nestedsubtype);
  if ( existing ) return existing;

  for ( const candidate of [document.system?.identifier, path.basename(file, path.extname(file)), document.name] ) {
    const rank = extractRankFromText(candidate);
    if ( rank ) return rank;
  }

  const segments = toPosix(path.relative(path.join(PACK_SOURCE_ROOT, pack), file)).split("/");
  for ( const segment of segments ) {
    const rank = normalizeFeatureRank(segment);
    if ( rank ) return rank;
  }
  return null;
}

function extractRankFromText(value) {
  const match = `${value ?? ""}`.match(/(?:^|[^a-z0-9])([edcbas])[-_\s]?rank(?:[^a-z0-9]|$)/i);
  return match ? match[1].toLowerCase() : null;
}

function normalizeFeatureRank(rank) {
  rank = `${rank ?? ""}`.trim().toLowerCase();
  if ( RANKS.has(rank) ) return rank;
  return LEGACY_RANKS[rank] ?? null;
}

function dumpTopLevelScalar(key, value) {
  return YAML.dump({ [key]: value }, { lineWidth: 120, noRefs: true }).trimEnd();
}

async function writeAudit(auditPath) {
  await mkdir(path.dirname(auditPath), { recursive: true });
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

function printSummary() {
  console.log(`Adversary pack normalization ${argv.dryRun ? "dry run" : "complete"}`);
  console.log(`Actors scanned: ${audit.actorsScanned}`);
  console.log(`Legacy actor candidates: ${audit.actorLegacyCandidates}`);
  console.log(`${argv.dryRun ? "Actors that would be normalized" : "Actors normalized"}: ${audit.actorNormalized}`);
  console.log(`Already normalized actors: ${audit.actorAlreadyNormalized}`);
  console.log(`Feature items scanned: ${audit.featureItemsScanned}`);
  console.log(`${argv.dryRun ? "Feature items that would be normalized" : "Feature items normalized"}: ${audit.featureItemsNormalized}`);
  console.log(`${argv.dryRun ? "Feature names that would change" : "Feature names changed"}: ${audit.featureNamesChanged}`);
  console.log(`${argv.dryRun ? "Feature icons that would change" : "Feature icons changed"}: ${audit.featureIconsChanged}`);
  console.log(`${argv.dryRun ? "Feature ranks that would change" : "Feature ranks changed"}: ${audit.featureRanksChanged}`);
  console.log(`${argv.dryRun ? "Feature types that would change" : "Feature types changed"}: ${audit.featureTypesChanged}`);
  console.log(`Trait/passive type mismatches: ${audit.featureTypeMismatches.length}`);
  console.log(`Changed files: ${audit.changedFiles.length}`);
  if ( argv.audit ) console.log(`Audit report: ${path.resolve(argv.audit)}`);
}

async function* walkFiles(dir, ext) {
  if ( !fs.existsSync(dir) ) return;
  for ( const entry of await fs.promises.readdir(dir, { withFileTypes: true }) ) {
    const file = path.join(dir, entry.name);
    if ( entry.isDirectory() ) yield* walkFiles(file, ext);
    else if ( entry.isFile() && file.endsWith(ext) ) yield file;
  }
}

function normalizeRank(rank) {
  rank = `${rank ?? ""}`.toLowerCase();
  if ( RANKS.has(rank) ) return rank;
  return LEGACY_RANKS[rank] ?? "e";
}

function normalizeClass(cls) {
  cls = `${cls ?? ""}`.toLowerCase();
  return CLASSES.has(cls) ? cls : "standard";
}

function normalizeRole(role) {
  role = `${role ?? ""}`.toLowerCase();
  if ( ROLES.has(role) ) return { role, discipline: "" };
  return ROLE_MAP[role] ?? { role: "striker", discipline: "" };
}

function normalizeLevel(level) {
  level = Number(level);
  if ( !Number.isFinite(level) ) return 1;
  return Math.min(Math.max(Math.trunc(level), 1), 20);
}

function slug(value) {
  return `${value ?? ""}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function stableHash(value) {
  let hash = 0;
  for ( let i = 0; i < value.length; i++ ) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
