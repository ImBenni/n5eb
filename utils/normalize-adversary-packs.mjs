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

const LEGACY_RANKS = {
  erank: "e",
  drank: "d",
  crank: "c",
  brank: "b",
  arank: "a",
  srank: "s"
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
    const document = YAML.load(await readFile(file, "utf8"));
    if ( document?.type !== "feat" ) continue;
    audit.featureItemsScanned++;
    const actual = document.system?.type?.value ?? "";
    if ( actual && (actual !== expected) ) {
      audit.featureTypeMismatches.push({
        pack,
        path: toPosix(path.relative(PACK_SOURCE_ROOT, file)),
        name: document.name,
        expected,
        actual
      });
    }
  }
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
