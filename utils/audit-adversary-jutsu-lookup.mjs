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
const SYSTEM_JSON = path.join(SYSTEM_ROOT, "system.json");

const { argv } = yargs(hideBin(process.argv))
  .scriptName("audit-adversary-jutsu-lookup")
  .option("search", {
    describe: "Case-insensitive regression search to confirm specific jutsu are in the lookup source set.",
    type: "string",
    default: "Storm Release"
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

const packConfig = loadSystemPacks();
const report = buildReport(packConfig, loadSourceDocuments(packConfig.declaredPackNames));

if ( argv.out ) {
  fs.mkdirSync(path.dirname(path.resolve(argv.out)), { recursive: true });
  fs.writeFileSync(path.resolve(argv.out), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
}

if ( argv.json ) console.log(JSON.stringify(report, null, 2));
else printReport(report);

if ( report.parseErrors.length || report.missedJutsu.length || report.searchMatches.length === 0 ) process.exitCode = 1;

function loadSystemPacks() {
  const system = JSON.parse(fs.readFileSync(SYSTEM_JSON, "utf8"));
  const declaredPackNames = new Set();
  const itemPacks = new Map();
  for ( const pack of system.packs ?? [] ) {
    declaredPackNames.add(pack.name);
    const isN5eItemPack = (pack.type === "Item") && ((pack.system === "n5eb") || (pack.package === "n5eb"));
    if ( !isN5eItemPack ) continue;
    itemPacks.set(pack.name, {
      name: pack.name,
      label: pack.label,
      path: pack.path,
      sourceBook: pack.flags?.n5eb?.sourceBook ?? ""
    });
  }
  return { declaredPackNames, itemPacks };
}

function loadSourceDocuments(declaredPackNames) {
  const documents = [];
  const parseErrors = [];
  for ( const pack of fs.readdirSync(PACK_SOURCE_ROOT, { withFileTypes: true }) ) {
    if ( !pack.isDirectory() ) continue;
    if ( !declaredPackNames.has(pack.name) ) continue;
    const packRoot = path.join(PACK_SOURCE_ROOT, pack.name);
    for ( const file of findSourceFiles(packRoot) ) {
      try {
        const doc = YAML.load(fs.readFileSync(file, "utf8"));
        if ( doc?._key === "!folders" ) continue;
        if ( doc ) documents.push({ pack: pack.name, file, doc });
      } catch(err) {
        parseErrors.push({ pack: pack.name, file: relative(file), error: err.message });
      }
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

function buildReport({ itemPacks }, { documents, parseErrors }) {
  const scannedPackNames = new Set(itemPacks.keys());
  const jutsu = documents.filter(({ doc }) => doc.type === "spell").map(row => formatJutsu(row, itemPacks));
  const included = jutsu.filter(row => scannedPackNames.has(row.pack));
  const missedJutsu = jutsu.filter(row => !scannedPackNames.has(row.pack));
  const search = `${argv.search ?? ""}`.trim();
  const searchKey = search.toLocaleLowerCase();
  const searchMatches = search ? included.filter(row => row.search.includes(searchKey)) : [];
  const byPack = Array.from(itemPacks.values()).map(pack => {
    const packJutsu = included.filter(row => row.pack === pack.name);
    return {
      pack: pack.name,
      label: pack.label,
      sourceBook: pack.sourceBook,
      jutsu: packJutsu.length
    };
  }).filter(row => row.jutsu > 0).toSorted((a, b) => a.pack.localeCompare(b.pack));

  return {
    itemPacksScanned: itemPacks.size,
    packJutsuCount: included.length,
    allStandaloneJutsuSources: jutsu.length,
    byPack,
    search,
    searchMatches,
    missedJutsu,
    parseErrors
  };
}

function formatJutsu({ pack, file, doc }, itemPacks) {
  const rank = doc.system?.rank ?? inferRankFromPath(file);
  const jutsuType = doc.system?.jutsu?.type ?? "";
  const identifier = doc.system?.identifier ?? "";
  const sourceBook = itemPacks.get(pack)?.sourceBook ?? "";
  return {
    pack,
    packLabel: itemPacks.get(pack)?.label ?? "",
    sourceBook,
    name: doc.name ?? path.basename(file, ".yml"),
    identifier,
    rank,
    jutsuType,
    file: relative(file),
    search: [doc.name, identifier, rank, jutsuType, sourceBook, relative(file)].join(" ").toLocaleLowerCase()
  };
}

function inferRankFromPath(file) {
  const match = file.match(/[\\/](e|d|c|b|a|s)-rank[\\/]/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function printReport(report) {
  console.log("Adversary Builder Jutsu Lookup Audit");
  console.log(`Item packs scanned: ${report.itemPacksScanned}`);
  console.log(`Standalone jutsu in scanned packs: ${report.packJutsuCount}`);
  console.log(`Standalone jutsu in all pack sources: ${report.allStandaloneJutsuSources}`);
  console.log(`Search '${report.search}': ${report.searchMatches.length} match(es)`);
  for ( const row of report.searchMatches.slice(0, 20) ) {
    console.log(`  - ${row.name} (${row.rank || "no rank"}) in ${row.pack}: ${row.file}`);
  }
  if ( report.searchMatches.length > 20 ) console.log(`  ...${report.searchMatches.length - 20} more`);
  if ( report.missedJutsu.length ) {
    console.log("");
    console.log("Missed standalone jutsu sources:");
    for ( const row of report.missedJutsu ) console.log(`  - ${row.file}`);
  }
  if ( report.parseErrors.length ) {
    console.log("");
    console.log("Parse errors:");
    for ( const row of report.parseErrors ) console.log(`  - ${row.file}: ${row.error}`);
  }
}

function relative(file) {
  return path.relative(SYSTEM_ROOT, file).replaceAll(path.sep, "/");
}
