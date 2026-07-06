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
const SYSTEM_JSON = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8"));

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-automation")
  .option("include-srd", {
    describe: "Include hidden SRD packs in the automation audit.",
    type: "boolean",
    default: false
  })
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

const AUTOMATION_CUES = {
  attack: /\b(attack roll|melee .* attack|ranged .* attack|jutsu attack)\b/i,
  chakra: /\bchakra\b/i,
  condition: /\b(condition|blinded|burned|charmed|chilled|confused|corroded|dazed|deafened|frightened|grappled|lacerated|poisoned|prone|restrained|sealed|shocked|slowed|stunned|weakened)\b/i,
  damage: /\b(damage|temporary hit points?)\b|\b\d+d\d+\b/i,
  healing: /\b(heal|healing|regain .* hit points?|restore .* hit points?)\b/i,
  maintenance: /\b(concentration|maintain|maintenance)\b/i,
  scaling: /\b(higher ranks?|upcast|above [edcba s]-rank|cast .* above)\b/i,
  save: /\b(saving throw|save dc|must make .* save)\b/i
};

const ENGINE_CUES = {
  clash: /\bclash\b/i,
  crafting: /\b(craft|crafting|downtime|enhancement seal)\b/i,
  knownLimits: /\b(jutsu known|highest[- ]rank[- ]known|counts? against .* known)\b/i
};

const ENGINE_SUPPORT_MARKERS = {
  clash: {
    "module/documents/activity/mixin.mjs": ["rollClash", "applyClashLoss"],
    "module/documents/actor/actor.mjs": ["rollClash", "applyClashLoss"]
  },
  crafting: {
    "module/applications/actor/character-sheet.mjs": [
      "applyDowntimeCraftingTarget",
      "claimDowntimeCraftingResult",
      "getDowntimeCraftingContribution",
      "N5EB.DOWNTIME.Crafting.SealTargetNote"
    ],
    "module/data/actor/character.mjs": ["identifier", "result", "claimedAt"],
    "module/data/item/downtime.mjs": ["identifier"],
    "module/config.mjs": ["DND5E.sealRanks", "craftingDC", "downtime"]
  },
  knownLimits: {
    "module/data/item/class.mjs": ["getJutsuKnownValue", "getJutsuKnownScaleValue", "highest-rank-known"],
    "module/data/actor/templates/attributes.mjs": ["WarnKnownExceeded", "WarnMaxRankExceeded", "countsKnown"],
    "templates/actors/tabs/creature-spells.hbs": ["jutsuKnown"]
  }
};

const REPORT_STATUSES = ["fullyAutomated", "partiallyAutomated", "textOnly", "blockedByEngine"];
const UUID_PATTERN = /Compendium\.n5eb\.([A-Za-z0-9_-]+)\.(?:(Actor|Item|JournalEntry|RollTable)\.)?([A-Za-z0-9]{8,})/g;
const VALID_SOURCE_BOOKS = new Set(["Naruto 5e", "Team 7", "Homebrew"]);
const LOCAL_IMAGE_PATTERN = /(?:^|[\s"'(])((?:systems\/n5eb\/|assets\/|ui\/|tokens\/|fonts\/|json\/)[^"'<>\n\r)]+?\.(?:webp|png|jpe?g|gif|svg)\b)/gi;
const HTML_IMAGE_PATTERN = /\b(?:src|href)=["']([^"']+\.(?:webp|png|jpe?g|gif|svg)(?:[?#][^"']*)?)["']/gi;

const packMetadata = new Map((SYSTEM_JSON.packs ?? []).map(pack => [pack.name, pack]));
const auditedPacks = (SYSTEM_JSON.packs ?? [])
  .filter(pack => argv.includeSrd || !pack.flags?.n5eb?.hiddenFromN5eB)
  .map(pack => pack.name);
const supportedEngineCues = getSupportedEngineCues();

const sourceRecords = loadSourceRecords();
const sourceIds = buildSourceIdIndex(sourceRecords.records);
const report = buildReport(sourceRecords);

if ( argv.out ) {
  fs.mkdirSync(path.dirname(path.resolve(argv.out)), { recursive: true });
  fs.writeFileSync(argv.out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}

if ( argv.json ) console.log(JSON.stringify(report, null, 2));
else printReport(report);

function loadSourceRecords() {
  const records = [];
  const parseErrors = [];
  if ( !fs.existsSync(PACK_SOURCE_ROOT) ) return { records, parseErrors };

  for ( const file of findSourceFiles(PACK_SOURCE_ROOT) ) {
    const pack = path.relative(PACK_SOURCE_ROOT, file).split(path.sep)[0];
    try {
      const doc = YAML.load(fs.readFileSync(file, "utf8"));
      if ( doc ) records.push({ pack, file, doc });
    } catch(err) {
      parseErrors.push({ file: path.relative(SYSTEM_ROOT, file), error: err.message });
    }
  }
  return { records, parseErrors };
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

function buildSourceIdIndex(records) {
  const ids = new Map();
  for ( const { pack, doc } of records ) {
    if ( doc._key?.startsWith("!folders") || !doc._id ) continue;
    if ( !ids.has(pack) ) ids.set(pack, new Set());
    ids.get(pack).add(doc._id);
  }
  return ids;
}

function buildReport({ records, parseErrors }) {
  const byPack = Object.fromEntries(auditedPacks.map(pack => [pack, createPackSummary()]));
  const findings = [];
  const brokenReferences = [];
  const hiddenSRDReferences = [];
  const sourceIssues = [];
  const brokenImages = [];
  let sourceDocumentsChecked = 0;

  for ( const record of records ) {
    if ( !auditedPacks.includes(record.pack) ) continue;
    const packSummary = byPack[record.pack] ??= createPackSummary();
    const docs = getAuditableDocuments(record);
    for ( const doc of docs ) {
      const finding = analyzeDocument(doc, record);
      findings.push(finding);
      packSummary.total++;
      packSummary[finding.status]++;
      for ( const cue of finding.cues ) packSummary.cues[cue] = (packSummary.cues[cue] ?? 0) + 1;
      for ( const gap of finding.gaps ) packSummary.gaps[gap] = (packSummary.gaps[gap] ?? 0) + 1;
      for ( const blocker of finding.blockers ) packSummary.blockers[blocker] = (packSummary.blockers[blocker] ?? 0) + 1;
    }

    const refs = auditReferences(record);
    brokenReferences.push(...refs.broken);
    hiddenSRDReferences.push(...refs.hiddenSRD);
    packSummary.brokenReferences += refs.broken.length;
    packSummary.hiddenSRDReferences += refs.hiddenSRD.length;

    const sourceAudit = auditSources(record);
    sourceDocumentsChecked += sourceAudit.checked;
    sourceIssues.push(...sourceAudit.issues);
    brokenImages.push(...auditImages(record));
  }

  const totals = createPackSummary();
  for ( const summary of Object.values(byPack) ) {
    totals.total += summary.total;
    totals.brokenReferences += summary.brokenReferences;
    totals.hiddenSRDReferences += summary.hiddenSRDReferences;
    for ( const status of REPORT_STATUSES ) totals[status] += summary[status];
  }

  return {
    generatedAt: new Date().toISOString(),
    includeSRD: argv.includeSrd,
    packsScanned: auditedPacks.length,
    sourceFilesParsed: records.length,
    parseErrors,
    metadata: {
      validSourceBooks: Array.from(VALID_SOURCE_BOOKS),
      supportedEngineCues: Array.from(supportedEngineCues).sort(),
      sourceDocumentsChecked,
      sourceIssues,
      brokenImages
    },
    totals,
    byPack,
    findings,
    brokenReferences,
    hiddenSRDReferences
  };
}

function createPackSummary() {
  return {
    total: 0,
    fullyAutomated: 0,
    partiallyAutomated: 0,
    textOnly: 0,
    blockedByEngine: 0,
    brokenReferences: 0,
    hiddenSRDReferences: 0,
    cues: {},
    gaps: {},
    blockers: {}
  };
}

function getAuditableDocuments({ doc }) {
  if ( doc._key?.startsWith("!folders") ) return [];
  if ( doc._key?.startsWith("!actors") ) {
    return (doc.items ?? []).filter(item => item?.type).map(item => ({
      ...item,
      _auditActor: doc.name
    }));
  }
  if ( doc._key?.startsWith("!items") && doc.type ) return [doc];
  return [];
}

function analyzeDocument(doc, record) {
  const system = doc.system ?? {};
  const activities = getObjectValues(system.activities);
  const activityText = JSON.stringify(activities).toLowerCase();
  const effects = Array.isArray(doc.effects) ? doc.effects : [];
  const advancements = getObjectValues(system.advancement);
  const text = `${doc.name ?? ""}\n${getDescription(system)}\n${JSON.stringify(system.jutsu ?? {})}`.toLowerCase();

  const cues = Object.entries(AUTOMATION_CUES)
    .filter(([, pattern]) => pattern.test(text))
    .map(([key]) => key);
  const blockers = Object.entries(ENGINE_CUES)
    .filter(([key, pattern]) => pattern.test(text) && !supportedEngineCues.has(key))
    .map(([key]) => key);
  const gaps = findGaps({ system, activities, activityText, effects, advancements, cues });
  const hasAutomation = hasAutomationData({ system, activities, effects, advancements });
  const status = classifyFinding({ hasAutomation, gaps, blockers });

  return {
    status,
    pack: record.pack,
    file: path.relative(SYSTEM_ROOT, record.file),
    actor: doc._auditActor ?? null,
    id: doc._id ?? null,
    name: doc.name ?? "(Unnamed)",
    type: doc.type ?? null,
    cues,
    gaps,
    blockers,
    automation: {
      activities: activities.length,
      effects: effects.length,
      advancements: advancements.length,
      legacyAction: Boolean(system.actionType),
      chakraCost: Boolean(system.chakra?.cost || system.jutsu?.chakraCost || system.consume?.amount)
    }
  };
}

function getObjectValues(value) {
  if ( !value || (typeof value !== "object") ) return [];
  if ( Array.isArray(value) ) return value;
  return Object.values(value);
}

function getDescription(system) {
  const description = system.description;
  if ( typeof description === "string" ) return stripHTML(description);
  if ( !description || (typeof description !== "object") ) return "";
  return Object.values(description).filter(value => typeof value === "string").map(stripHTML).join("\n");
}

function stripHTML(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function findGaps({ system, activityText, effects, advancements, cues }) {
  const gaps = [];
  if ( cues.includes("attack") && !hasAttackAutomation(system, activityText) ) gaps.push("attack");
  if ( cues.includes("chakra") && !hasChakraAutomation(system) ) gaps.push("chakra");
  if ( cues.includes("condition") && !hasConditionAutomation(activityText, effects) ) gaps.push("condition");
  if ( cues.includes("damage") && !hasDamageAutomation(system, activityText) ) gaps.push("damage");
  if ( cues.includes("healing") && !hasHealingAutomation(system, activityText) ) gaps.push("healing");
  if ( cues.includes("maintenance") && !hasMaintenanceAutomation(system, activityText) ) gaps.push("maintenance");
  if ( cues.includes("scaling") && !hasScalingAutomation(system, activityText) ) gaps.push("scaling");
  if ( cues.includes("save") && !hasSaveAutomation(system, activityText) ) gaps.push("save");
  if ( /\b(gain|learn|proficiency|mastery)\b/i.test(JSON.stringify(system)) && !advancements.length && !effects.length ) {
    gaps.push("advancement");
  }
  return gaps;
}

function hasAutomationData({ system, activities, effects, advancements }) {
  return Boolean(
    activities.length
    || effects.length
    || advancements.length
    || system.actionType
    || system.chakra?.cost
    || system.jutsu?.chakraCost
    || system.consume?.amount
  );
}

function hasAttackAutomation(system, activityText) {
  return ["mwak", "rwak", "msak", "rsak"].includes(system.actionType) || activityText.includes("attack");
}

function hasChakraAutomation(system) {
  return Boolean(system.chakra?.cost || system.jutsu?.chakraCost || system.consume?.amount);
}

function hasConditionAutomation(activityText, effects) {
  return Boolean(effects.length || activityText.includes("effect") || activityText.includes("appliedeffects"));
}

function hasDamageAutomation(system, activityText) {
  return Boolean(system.damage?.parts?.length || activityText.includes("damage"));
}

function hasHealingAutomation(system, activityText) {
  return system.actionType === "heal" || activityText.includes("healing") || activityText.includes("heal");
}

function hasMaintenanceAutomation(system, activityText) {
  return Boolean(system.properties?.includes?.("concentration") || system.duration?.concentration || activityText.includes("concentration"));
}

function hasScalingAutomation(system, activityText) {
  return Boolean(
    (system.scaling?.mode && (system.scaling.mode !== "none"))
    || (system.chakra?.scaling?.mode && (system.chakra.scaling.mode !== "none"))
    || activityText.includes("scaling")
  );
}

function hasSaveAutomation(system, activityText) {
  return Boolean(system.save?.ability || system.actionType === "save" || activityText.includes("save"));
}

function classifyFinding({ hasAutomation, gaps, blockers }) {
  if ( blockers.length ) return "blockedByEngine";
  if ( hasAutomation && !gaps.length ) return "fullyAutomated";
  if ( hasAutomation ) return "partiallyAutomated";
  return "textOnly";
}

function getSupportedEngineCues() {
  const supported = new Set();
  for ( const [cue, files] of Object.entries(ENGINE_SUPPORT_MARKERS) ) {
    const ok = Object.entries(files).every(([file, markers]) => {
      const sourcePath = path.join(SYSTEM_ROOT, file);
      if ( !fs.existsSync(sourcePath) ) return false;
      const source = fs.readFileSync(sourcePath, "utf8");
      return markers.every(marker => source.includes(marker));
    });
    if ( ok ) supported.add(cue);
  }
  return supported;
}

function auditReferences({ pack, file, doc }) {
  const text = JSON.stringify(doc);
  const broken = [];
  const hiddenSRD = [];
  for ( const match of text.matchAll(UUID_PATTERN) ) {
    const [, targetPack, , targetId] = match;
    const targetMetadata = packMetadata.get(targetPack);
    const entry = {
      sourcePack: pack,
      file: path.relative(SYSTEM_ROOT, file),
      targetPack,
      targetId,
      uuid: match[0]
    };
    if ( !targetMetadata ) {
      broken.push({ ...entry, reason: "unknown-pack" });
      continue;
    }
    if ( targetMetadata.flags?.n5eb?.hiddenFromN5eB ) hiddenSRD.push(entry);
    if ( sourceIds.has(targetPack) && !sourceIds.get(targetPack).has(targetId) ) {
      broken.push({ ...entry, reason: "missing-document" });
    }
  }
  return { broken, hiddenSRD };
}

function auditSources(record) {
  const expected = packMetadata.get(record.pack)?.flags?.n5eb?.sourceBook;
  const issues = [];
  let checked = 0;
  if ( !expected ) return { checked, issues };

  for ( const entry of getSourceDocuments(record.doc) ) {
    checked++;
    for ( const source of getSourceFields(entry.doc) ) {
      if ( source.value?.book !== expected ) {
        issues.push({
          pack: record.pack,
          file: path.relative(SYSTEM_ROOT, record.file),
          document: entry.name,
          path: source.path,
          expected,
          actual: source.value?.book ?? ""
        });
      }
      if ( source.value?.custom ) {
        issues.push({
          pack: record.pack,
          file: path.relative(SYSTEM_ROOT, record.file),
          document: entry.name,
          path: `${source.path}.custom`,
          expected: "",
          actual: source.value.custom
        });
      }
    }
  }
  return { checked, issues };
}

function getSourceDocuments(doc) {
  if ( !doc || (typeof doc !== "object") || doc._key?.startsWith("!folders") ) return [];
  const documents = [];
  if ( doc.system ) documents.push({ name: doc.name ?? doc._id ?? "(Unnamed)", doc });
  if ( Array.isArray(doc.items) ) {
    for ( const item of doc.items ) {
      if ( item?.system ) documents.push({ name: `${doc.name ?? "(Actor)"} > ${item.name ?? item._id ?? "(Item)"}`, doc: item });
    }
  }
  return documents;
}

function getSourceFields(doc) {
  const fields = [];
  if ( doc.system?.source ) fields.push({ path: "system.source", value: doc.system.source });
  if ( doc.system?.details?.source ) fields.push({ path: "system.details.source", value: doc.system.details.source });
  if ( doc.system && !fields.length ) fields.push({ path: "system.source", value: undefined });
  return fields;
}

function auditImages(record) {
  const issues = [];
  for ( const ref of collectImageReferences(record.doc) ) {
    const resolved = resolveSystemLocalPath(ref);
    if ( !resolved ) continue;
    if ( fs.existsSync(resolved.absolute) ) continue;
    issues.push({
      pack: record.pack,
      file: path.relative(SYSTEM_ROOT, record.file),
      path: resolved.relative,
      ref
    });
  }
  return issues;
}

function collectImageReferences(value) {
  const refs = new Set();
  const visit = entry => {
    if ( typeof entry === "string" ) {
      for ( const match of entry.matchAll(HTML_IMAGE_PATTERN) ) refs.add(match[1]);
      for ( const match of entry.matchAll(LOCAL_IMAGE_PATTERN) ) refs.add(match[1]);
      return;
    }
    if ( Array.isArray(entry) ) {
      entry.forEach(visit);
      return;
    }
    if ( entry && (typeof entry === "object") ) Object.values(entry).forEach(visit);
  };
  visit(value);
  return refs;
}

function resolveSystemLocalPath(ref) {
  let clean = decodeHTML(ref).replaceAll("\\", "/").split(/[?#]/)[0];
  if ( clean.startsWith("systems/n5eb/") ) clean = clean.slice("systems/n5eb/".length);
  else if ( !/^(?:assets|ui|tokens|fonts|json)\//.test(clean) ) return null;
  if ( /^assets\/(?:text\.png|particles\/)/.test(clean) ) return null;

  const decoded = safeDecodeURI(clean);
  return {
    relative: decoded,
    absolute: path.join(SYSTEM_ROOT, ...decoded.split("/"))
  };
}

function decodeHTML(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", "\"").replaceAll("&#39;", "'");
}

function safeDecodeURI(value) {
  try {
    return decodeURI(value);
  } catch{
    return value;
  }
}

function printReport(data) {
  console.log("N5eB Automation Audit");
  console.log(`Generated: ${data.generatedAt}`);
  console.log(`Packs scanned: ${data.packsScanned}`);
  console.log(`Source files parsed: ${data.sourceFilesParsed}`);
  console.log(`Parse errors: ${data.parseErrors.length}`);
  console.log(`Source documents checked: ${data.metadata.sourceDocumentsChecked}`);
  console.log(`Source issues: ${data.metadata.sourceIssues.length}`);
  console.log(`Broken local images: ${data.metadata.brokenImages.length}`);
  console.log("");
  console.log("Totals");
  console.table([data.totals]);

  const rows = Object.entries(data.byPack)
    .map(([pack, summary]) => ({ pack, ...summary }))
    .filter(row => row.total || row.brokenReferences || row.hiddenSRDReferences)
    .sort((a, b) => b.total - a.total);
  console.log("By pack");
  console.table(rows.map(({ pack, total, fullyAutomated, partiallyAutomated, textOnly, blockedByEngine, brokenReferences, hiddenSRDReferences }) => ({
    pack, total, fullyAutomated, partiallyAutomated, textOnly, blockedByEngine, brokenReferences, hiddenSRDReferences
  })));

  const topGaps = summarizeFindingValues(data.findings, "gaps");
  const topBlockers = summarizeFindingValues(data.findings, "blockers");
  console.log("Top gaps");
  console.table(topGaps);
  console.log("Top blockers");
  console.table(topBlockers);

  if ( data.brokenReferences.length ) {
    console.log("Broken references (first 25)");
    console.table(data.brokenReferences.slice(0, 25));
  }
  if ( data.metadata.sourceIssues.length ) {
    console.log("Source issues (first 25)");
    console.table(data.metadata.sourceIssues.slice(0, 25));
  }
  if ( data.metadata.brokenImages.length ) {
    console.log("Broken local images (first 25)");
    console.table(data.metadata.brokenImages.slice(0, 25));
  }
}

function summarizeFindingValues(findings, key) {
  const counts = new Map();
  for ( const finding of findings ) {
    for ( const value of finding[key] ) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}
