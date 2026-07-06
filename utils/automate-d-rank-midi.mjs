/* eslint-disable jsdoc/require-jsdoc, max-len */

import crypto from "node:crypto";
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
const CONDITIONS_ROOT = path.join(PACK_SOURCE_ROOT, "conditions");

const TARGETED_ACTIONS = new Set(["mwak", "rwak", "msak", "rsak", "save"]);
const CONDITION_ALIASES = {
  bleeding: "bleeding",
  bleed: "bleeding",
  bruised: "bruised",
  burned: "burned",
  burning: "burned",
  chilled: "chilled",
  cold: "chilled",
  corroded: "corroded",
  dazed: "dazed",
  dazzled: "dazzled",
  deafened: "deafened",
  demoralized: "demoralized",
  fear: "demoralized",
  feared: "demoralized",
  frightened: "demoralized",
  envenomed: "envenomed",
  poisoned: "envenomed",
  poison: "envenomed",
  grappled: "grappled",
  incapacitated: "incapacitated",
  invisible: "invisible",
  lacerated: "lacerated",
  petrified: "petrified",
  prone: "prone",
  restrained: "restrained",
  sealed: "sealed",
  shocked: "shocked",
  slowed: "slowed",
  staggered: "staggered",
  stunned: "stunned",
  unconscious: "unconscious",
  weakened: "weakened",
  berserk: "berserk",
  charmed: "charmed",
  concussed: "concussed",
  confused: "confused",
  blinded: "blinded"
};

const BLOCKING_CONTEXT = /\b(?:at higher ranks?|if cast at|cast at [cba-s]-rank|your body|you fall|functionally unconscious|seal then conceals itself|resistan(?:ce|t)|immun(?:e|ity)|advantage against|disadvantage against|remove|removes|removed|cure|cures|cured|cleanse|cleanses|cleansed|end(?:s|ed)?(?:\s+the|\s+this)?\s+condition|condition\s+end(?:s|ed)?|reduce|reduced|ignores?|already|currently|affected by|inflicted by this jutsu|suffers? the damage of|cannot be|can't be|may choose|choose one|selected condition)\b/i;

const { argv } = yargs(hideBin(process.argv))
  .scriptName("automate-d-rank-midi")
  .option("write", {
    describe: "Write automation updates to pack source files. Omit for dry-run.",
    type: "boolean",
    default: false
  })
  .option("out", {
    describe: "Optional JSON report path.",
    type: "string",
    requiresArg: true
  })
  .option("verbose", {
    describe: "Print changed and skipped records.",
    type: "boolean",
    default: false
  })
  .help();

const conditionTemplates = loadConditionTemplates();
const report = buildReport();

if ( argv.out ) {
  const outPath = path.resolve(SYSTEM_ROOT, argv.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}

printReport(report);

function buildReport() {
  const records = [];
  const changed = [];
  const skipped = [];
  const errors = [];

  for ( const file of findSourceFiles(PACK_SOURCE_ROOT) ) {
    let doc;
    try {
      doc = YAML.load(fs.readFileSync(file, "utf8"));
    } catch(err) {
      errors.push({ file: relativeSystemPath(file), error: err.message });
      continue;
    }
    if ( !isDRankJutsu(file, doc) ) continue;

    const matches = detectConditionApplications(doc);
    const record = {
      file: relativeSystemPath(file),
      pack: packName(file),
      id: doc._id ?? null,
      name: doc.name ?? "(Unnamed)",
      actionType: doc.system?.actionType ?? "",
      existingEffects: doc.effects?.length ?? 0,
      matches
    };
    records.push(record);

    const skipReason = getSkipReason(doc, matches);
    if ( skipReason ) {
      if ( matches.length ) skipped.push({ ...record, reason: skipReason });
      continue;
    }

    const additions = [];
    for ( const match of matches ) {
      const effect = createConditionEffect(match.condition, doc, file, match);
      if ( !effect ) {
        skipped.push({ ...record, reason: `missing-condition-template:${match.condition}` });
        continue;
      }
      additions.push(effect);
    }
    if ( !additions.length ) continue;

    changed.push({
      ...record,
      addedEffects: additions.map(effect => ({
        id: effect._id,
        name: effect.name,
        statuses: effect.statuses ?? [],
        rank: effect.flags?.n5eb?.condition?.rank ?? 1,
        duration: effect.duration ?? null
      }))
    });

    if ( argv.write ) {
      doc.effects ??= [];
      doc.effects.push(...additions);
      fs.writeFileSync(file, YAML.dump(doc), { mode: 0o664 });
    }
  }

  const summary = {
    mode: argv.write ? "write" : "dry-run",
    dRankJutsus: records.length,
    withConditionMatches: records.filter(record => record.matches.length).length,
    changedFiles: changed.length,
    addedEffects: changed.reduce((total, record) => total + record.addedEffects.length, 0),
    skipped: skipped.length,
    errors: errors.length
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    changed,
    skipped,
    errors
  };
}

function loadConditionTemplates() {
  const templates = new Map();
  for ( const file of findSourceFiles(CONDITIONS_ROOT) ) {
    if ( path.basename(file) === "_folder.yml" ) continue;
    const doc = YAML.load(fs.readFileSync(file, "utf8"));
    const id = doc.system?.identifier;
    const effect = doc.effects?.[0];
    if ( !id || !effect ) continue;
    templates.set(id, {
      item: doc,
      effect,
      original: effect.flags?.n5eb?.legacyImport?.originalConditionEffect ?? {}
    });
  }
  return templates;
}

function findSourceFiles(root) {
  const files = [];
  for ( const entry of fs.readdirSync(root, { withFileTypes: true }) ) {
    const entryPath = path.join(root, entry.name);
    if ( entry.isDirectory() ) files.push(...findSourceFiles(entryPath));
    else if ( [".yml", ".yaml"].includes(path.extname(entry.name)) ) files.push(entryPath);
  }
  return files;
}

function isDRankJutsu(file, doc) {
  if ( !doc || (doc._key?.startsWith("!folders")) ) return false;
  if ( (doc.type !== "spell") || (doc.system?.rank !== "d") ) return false;
  const rel = relativeSourcePath(file);
  if ( !rel.includes("/d-rank/") ) return false;
  const pack = rel.split("/")[0];
  return pack.includes("jutsus") || rel.includes("/clan-hijutsu/");
}

function detectConditionApplications(doc) {
  const text = stripHTML(doc.system?.description?.value ?? "");
  const sentences = text.split(/(?<=[.!?])\s+|(?:\s*;\s*)/g).map(s => s.trim()).filter(Boolean);
  const matches = new Map();

  for ( const sentence of sentences ) {
    for ( const [alias, condition] of Object.entries(CONDITION_ALIASES) ) {
      if ( !conditionTemplates.has(condition) ) continue;
      if ( !containsConditionTerm(sentence, alias) ) continue;
      if ( BLOCKING_CONTEXT.test(sentence) ) continue;
      if ( !isApplicationSentence(sentence, alias) ) continue;
      const rank = extractRank(sentence, alias);
      const duration = inferDuration(doc, sentence, condition);
      const key = `${condition}:${rank}:${JSON.stringify(duration)}`;
      if ( !matches.has(key) ) {
        matches.set(key, {
          condition,
          alias,
          rank,
          duration,
          sentence
        });
      }
    }
  }

  return Array.from(matches.values());
}

function containsConditionTerm(sentence, alias) {
  return conditionTermRegex(alias).test(sentence);
}

function isApplicationSentence(sentence, alias) {
  const term = conditionTermRegex(alias).source;
  const application = [
    String.raw`\b(?:gain|gains|gaining|gained|inflict|inflicts|inflicted|suffer|suffers|suffering|suffered|receive|receives|received|apply|applies|applied)\b.{0,90}${term}(?:\s+condition)?`,
    String.raw`\b(?:is|are|be|being|become|becomes|becoming|gets|get|got)\b.{0,70}${term}(?:\s+condition)?`,
    String.raw`\bknocked\s+${term}\b`
  ];
  return application.some(pattern => new RegExp(pattern, "i").test(sentence));
}

function conditionTermRegex(alias) {
  if ( alias === "fear" ) return /\bfear(?:ed)?\b|\bfear-demoralized\b/i;
  if ( alias === "poison" ) return /\bpoison(?:ed)?\b/i;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`\b${escaped}\b`, "i");
}

function extractRank(sentence, alias) {
  const term = conditionTermRegex(alias).source;
  const numbered = sentence.match(new RegExp(String.raw`\b(\d+)\s+ranks?\s+of\s+(?:the\s+)?${term}`, "i"));
  if ( numbered ) return Number(numbered[1]);
  const worded = sentence.match(new RegExp(String.raw`\b(one|two|three|four|five)\s+ranks?\s+of\s+(?:the\s+)?${term}`, "i"));
  if ( worded ) return { one: 1, two: 2, three: 3, four: 4, five: 5 }[worded[1].toLowerCase()] ?? 1;
  return 1;
}

function inferDuration(doc, sentence, condition) {
  const template = conditionTemplates.get(condition)?.effect?.duration;
  if ( /\buntil the end of (?:its|their|the target'?s|your|that creature'?s) next turn\b/i.test(sentence) ) {
    return durationData({ rounds: 1 });
  }
  if ( /\bfor (?:1|one) minute\b/i.test(sentence) ) return durationData({ rounds: 10 });
  if ( /\bfor (?:1|one) round\b/i.test(sentence) ) return durationData({ rounds: 1 });
  if ( /\bfor the duration\b/i.test(sentence) ) {
    const value = Number(doc.system?.duration?.value);
    const units = doc.system?.duration?.units;
    if ( Number.isFinite(value) && (value > 0) ) {
      if ( units === "round" ) return durationData({ rounds: value });
      if ( units === "minute" ) return durationData({ rounds: value * 10 });
      if ( units === "hour" ) return durationData({ seconds: value * 3600 });
    }
  }
  return template ? cloneDuration(template) : undefined;
}

function durationData({ rounds=null, seconds=null }={}) {
  return {
    rounds,
    startTime: null,
    seconds,
    combat: null,
    turns: null,
    startRound: null,
    startTurn: null
  };
}

function cloneDuration(duration) {
  return duration ? JSON.parse(JSON.stringify(duration)) : undefined;
}

function getSkipReason(doc, matches) {
  if ( !matches.length ) return null;
  if ( doc.effects?.length ) return "existing-effects";
  if ( !TARGETED_ACTIONS.has(doc.system?.actionType) ) return "not-targeted-action";
  if ( (matches.length > 1) && /\b(?:firing modes?|choose which mode|mode to use)\b/i.test(stripHTML(doc.system?.description?.value ?? "")) ) {
    return "multiple-modes";
  }
  if ( matches.length > 2 ) return "too-many-condition-matches";
  return null;
}

function createConditionEffect(condition, doc, file, match) {
  const template = conditionTemplates.get(condition);
  if ( !template ) return null;

  const baseEffect = template.effect;
  const original = template.original;
  const flags = clone(original.flags ?? baseEffect.flags ?? {});
  flags.core ??= {};
  flags.core.overlay ??= false;
  flags.n5eb ??= {};
  flags.n5eb.condition = {
    ...(baseEffect.flags?.n5eb?.condition ?? {}),
    id: condition,
    rank: match.rank,
    maxRank: baseEffect.flags?.n5eb?.condition?.maxRank ?? 1,
    category: baseEffect.flags?.n5eb?.condition?.category ?? "",
    source: baseEffect.flags?.n5eb?.condition?.source ?? "main-book"
  };
  delete flags.n5eb.legacyImport;

  const effectId = deterministicId(doc._id ?? doc.name, condition, match.rank);
  return {
    name: conditionEffectName(template, match.rank),
    origin: `Compendium.n5eb.${packName(file)}.Item.${doc._id}`,
    duration: match.duration,
    disabled: false,
    flags,
    img: baseEffect.img ?? original.img ?? template.item.img,
    _id: effectId,
    type: baseEffect.type ?? "base",
    system: clone(baseEffect.system ?? {}),
    changes: clone(original.changes ?? baseEffect.changes ?? []),
    description: baseEffect.description ?? template.item.system?.description?.value ?? "",
    tint: baseEffect.tint ?? "#ffffff",
    transfer: false,
    statuses: clone(baseEffect.statuses ?? [condition]),
    sort: baseEffect.sort ?? 0,
    _stats: {
      compendiumSource: `Compendium.n5eb.conditions.Item.${template.item._id}.ActiveEffect.${baseEffect._id}`,
      duplicateSource: null,
      coreVersion: baseEffect._stats?.coreVersion ?? "14.360",
      systemId: "n5eb",
      systemVersion: baseEffect._stats?.systemVersion ?? "3.0.12",
      createdTime: null,
      modifiedTime: null,
      lastModifiedBy: null
    },
    _key: `!items.effects!${doc._id}.${effectId}`
  };
}

function conditionEffectName(template, rank) {
  const name = template.effect.name ?? template.item.name;
  return rank > 1 ? `${name} ${rank}` : name;
}

function deterministicId(...parts) {
  const digest = crypto.createHash("sha256").update(parts.join("|")).digest("base64url");
  return digest.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stripHTML(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<\/p>\s*<p>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function packName(file) {
  return relativeSourcePath(file).split("/")[0];
}

function relativeSystemPath(file) {
  return path.relative(SYSTEM_ROOT, file).replaceAll("\\", "/");
}

function relativeSourcePath(file) {
  return path.relative(PACK_SOURCE_ROOT, file).replaceAll("\\", "/");
}

function printReport(data) {
  console.log(`D-rank Midi automation ${data.summary.mode}`);
  console.table([data.summary]);
  if ( argv.verbose && data.changed.length ) {
    console.log("Changed");
    console.table(data.changed.map(record => ({
      file: record.file,
      name: record.name,
      actionType: record.actionType,
      added: record.addedEffects.map(e => e.name).join(", ")
    })));
  }
  if ( argv.verbose && data.skipped.length ) {
    console.log("Skipped");
    console.table(data.skipped.map(record => ({
      file: record.file,
      name: record.name,
      reason: record.reason,
      matches: record.matches.map(match => match.condition).join(", ")
    })).slice(0, 100));
  }
}
