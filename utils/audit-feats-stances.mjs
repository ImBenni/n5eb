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
const FEAT_PACKS = ["feats", "t7-feats", "hb-feats"];
const VALID_FEATURE_TYPES = new Set([
  "background", "class", "monster", "race", "clanfeat", "classfeat", "latentAbility", "adversaryTrait",
  "adversaryPassive", "enchantment", "feat", "supernaturalGift", "vehicle", "summon"
]);
const VALID_SUBTYPES = {
  classfeat: new Set(["archetype", "caster", "martial"]),
  feat: new Set(["", "general", "origin", "stance", "fightingStyle", "epicBoon"])
};

const REQUIRED_CODE_MARKERS = {
  "module/config.mjs": [
    "classfeat: {",
    "N5EB.Feature.ClassFeat.Label",
    "stance: \"N5EB.Feature.Feat.Stance\"",
    "preLocalize(\"featureTypes.classfeat.subtypes\""
  ],
  "templates/items/details/details-feat.hbs": [
    "{{#if featureRankOptions}}",
    "selectOptions featureRankOptions"
  ],
  "module/data/item/feat.mjs": [
    "getFeatureRankOptions",
    "context.featureRankOptions"
  ],
  "lang/en.json": [
    "\"N5EB.Feature.ClassFeat.Label\"",
    "\"N5EB.Feature.Feat.Stance\""
  ]
};

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-feats-stances")
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

const report = buildReport(loadSourceDocuments());

if ( argv.out ) {
  fs.mkdirSync(path.dirname(path.resolve(argv.out)), { recursive: true });
  fs.writeFileSync(path.resolve(argv.out), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}

if ( argv.json ) console.log(JSON.stringify(report, null, 2));
else printReport(report);

if ( hasFailures(report) ) process.exitCode = 1;

function buildReport({ documents, parseErrors }) {
  const report = {
    parseErrors,
    source: {
      featDocuments: documents.length,
      baseFeatDocuments: documents.filter(row => row.pack === "feats").length,
      team7FeatDocuments: documents.filter(row => row.pack === "t7-feats").length,
      homebrewFeatDocuments: documents.filter(row => row.pack === "hb-feats").length,
      stanceDocuments: 0,
      classFeatDocuments: 0,
      invalidDocuments: [],
      invalidStances: [],
      stanceManualEffects: [],
      stanceTrackedEffects: 0,
      stanceManualEffectNotes: []
    },
    code: {
      missingMarkers: []
    }
  };

  for ( const row of documents ) auditDocument(row, report);
  auditCodeMarkers(report);
  return report;
}

function loadSourceDocuments() {
  const documents = [];
  const parseErrors = [];
  for ( const pack of FEAT_PACKS ) {
    const packRoot = path.join(PACK_SOURCE_ROOT, pack);
    for ( const file of findSourceFiles(packRoot) ) {
      try {
        const doc = YAML.load(fs.readFileSync(file, "utf8"));
        if ( !doc || doc._key === "!folders" ) continue;
        documents.push({
          file,
          relative: relative(file),
          pack,
          isStance: path.relative(packRoot, file).split(path.sep).includes("stances"),
          doc
        });
      } catch(err) {
        parseErrors.push({ file: relative(file), error: err.message });
      }
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

function auditDocument(row, report) {
  const { doc } = row;
  const problems = [];
  if ( doc.type !== "feat" ) problems.push(`document type is '${doc.type ?? ""}', expected 'feat'`);
  if ( !doc._id ) problems.push("missing _id");
  if ( !doc.system?.identifier ) problems.push("missing system.identifier");
  if ( !stripHtml(doc.system?.description?.value).trim() ) problems.push("missing description");

  const featureType = doc.system?.type?.value ?? "";
  const subtype = doc.system?.type?.subtype ?? "";
  if ( !featureType ) problems.push("missing system.type.value");
  else if ( !VALID_FEATURE_TYPES.has(featureType) ) problems.push(`unknown feature type '${featureType}'`);
  if ( VALID_SUBTYPES[featureType] && !VALID_SUBTYPES[featureType].has(subtype) ) {
    problems.push(`unknown ${featureType} subtype '${subtype}'`);
  }
  if ( featureType === "classfeat" ) report.source.classFeatDocuments += 1;

  if ( row.isStance ) {
    report.source.stanceDocuments += 1;
    const stanceProblems = [];
    if ( featureType !== "feat" ) stanceProblems.push(`stance feature type is '${featureType}', expected 'feat'`);
    if ( subtype !== "stance" ) stanceProblems.push(`stance subtype is '${subtype}', expected 'stance'`);
    if ( !doc.system?.activation?.type ) stanceProblems.push("missing activation type");
    if ( !doc.system?.source?.rules && !doc.system?.source?.book ) stanceProblems.push("missing source rules/book");
    if ( stanceProblems.length ) {
      report.source.invalidStances.push({
        file: row.relative,
        name: doc.name ?? "",
        problems: stanceProblems
      });
    }
    if ( !(doc.effects?.length > 0) ) {
      report.source.stanceManualEffects.push({
        file: row.relative,
        name: doc.name ?? "",
        note: "No active effect is bundled; this stance is currently rules-text/manual unless its activities automate it."
      });
    } else {
      const stanceEffects = doc.effects.filter(effect => effect.flags?.n5eb?.stance?.tracked);
      report.source.stanceTrackedEffects += stanceEffects.length ? 1 : 0;
      const manual = stanceEffects.flatMap(effect => effect.flags?.n5eb?.stance?.manual ?? []);
      const automatic = stanceEffects.flatMap(effect => effect.flags?.n5eb?.stance?.automatic ?? []);
      if ( manual.length ) {
        report.source.stanceManualEffectNotes.push({
          file: row.relative,
          name: doc.name ?? "",
          automatic: automatic.length,
          manual
        });
      }
    }
  }

  if ( problems.length ) {
    report.source.invalidDocuments.push({
      file: row.relative,
      name: doc.name ?? "",
      problems
    });
  }
}

function auditCodeMarkers(report) {
  for ( const [relativeFile, markers] of Object.entries(REQUIRED_CODE_MARKERS) ) {
    const absolute = path.join(SYSTEM_ROOT, relativeFile);
    const text = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
    for ( const marker of markers ) {
      if ( !text.includes(marker) ) report.code.missingMarkers.push({ file: relativeFile, marker });
    }
  }
}

function stripHtml(value="") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}

function relative(file) {
  return path.relative(SYSTEM_ROOT, file).replaceAll(path.sep, "/");
}

function hasFailures(report) {
  return report.parseErrors.length
    || report.source.invalidDocuments.length
    || report.source.invalidStances.length
    || report.code.missingMarkers.length;
}

function printReport(report) {
  console.log("N5eB Feat & Stance Audit");
  console.log("========================");
  console.log(`Feat documents: ${report.source.featDocuments}`);
  console.log(`  Base N5e: ${report.source.baseFeatDocuments}`);
  console.log(`  Team 7: ${report.source.team7FeatDocuments}`);
  console.log(`  Homebrew: ${report.source.homebrewFeatDocuments}`);
  console.log(`Class feat documents: ${report.source.classFeatDocuments}`);
  console.log(`Stance documents: ${report.source.stanceDocuments}`);
  console.log(`Manual/rules-text stances: ${report.source.stanceManualEffects.length}`);
  console.log(`Tracked stance effects: ${report.source.stanceTrackedEffects}`);
  console.log(`Tracked stance effects with manual notes: ${report.source.stanceManualEffectNotes.length}`);
  console.log("");

  printSection("Parse errors", report.parseErrors, row => `${row.file}: ${row.error}`);
  printSection("Invalid feat documents", report.source.invalidDocuments, row => {
    return `${row.file} (${row.name}): ${row.problems.join("; ")}`;
  });
  printSection("Invalid stance documents", report.source.invalidStances, row => {
    return `${row.file} (${row.name}): ${row.problems.join("; ")}`;
  });
  printSection("Missing code markers", report.code.missingMarkers, row => `${row.file}: ${row.marker}`);

  if ( report.source.stanceManualEffects.length ) {
    console.log("Manual stance notes");
    console.log("-------------------");
    for ( const row of report.source.stanceManualEffects ) console.log(`- ${row.file} (${row.name})`);
    console.log("");
  }

  if ( report.source.stanceManualEffectNotes.length ) {
    console.log("Tracked stance manual boundaries");
    console.log("--------------------------------");
    for ( const row of report.source.stanceManualEffectNotes ) {
      console.log(`- ${row.file} (${row.name}): ${row.automatic} automatic, ${row.manual.length} manual`);
    }
    console.log("");
  }

  console.log(`Result: ${hasFailures(report) ? "FAIL" : "PASS"}`);
}

function printSection(title, rows, format) {
  if ( !rows.length ) return;
  console.log(title);
  console.log("-".repeat(title.length));
  for ( const row of rows ) console.log(`- ${format(row)}`);
  console.log("");
}
