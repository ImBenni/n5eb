import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LANGUAGE = path.join(ROOT, "lang", "en.json");
const SOURCES = ["dnd5e.mjs", "system.json", "module", "templates", "json"];
const EXTENSIONS = new Set([".mjs", ".js", ".hbs", ".json"]);
const KEY_PATTERN = String.raw`(?:N5EB|DND5E|TYPES|DOCUMENT\.DND5E|MIGRATION)\.[A-Za-z0-9_.-]+`;

const PATTERNS = [
  {
    kind: "i18n-call",
    regex: new RegExp(String.raw`\b(?:game\.)?i18n\.(?:localize|format)\(\s*["'](${KEY_PATTERN})["']`, "g")
  },
  {
    kind: "localize-helper",
    regex: new RegExp(String.raw`\{\{[#~]?\s*localize\s+["'](${KEY_PATTERN})["']`, "g")
  },
  {
    kind: "property",
    regex: new RegExp(
      String.raw`\b(?:label|hint|name|title|tooltip|placeholder|legend|ariaLabel|buttonLabel|group):\s*`
        + String.raw`["'](${KEY_PATTERN})["']`,
      "g"
    )
  },
  {
    kind: "localized-notification",
    regex: new RegExp(
      String.raw`ui\.notifications\.\w+\(\s*["'](${KEY_PATTERN})["'][\s\S]{0,160}?localize:\s*true`,
      "g"
    )
  },
  {
    kind: "template-attr",
    regex: new RegExp(String.raw`\b(?:data-tooltip|aria-label|title|placeholder)=["'](${KEY_PATTERN})["']`, "g")
  }
];

const language = JSON.parse(fs.readFileSync(LANGUAGE, "utf8"));
const languageKeys = flattenLanguage(language);
const files = collectSourceFiles();
const usages = collectLocalizationUsages(files);
const missing = findMissingKeys(usages, languageKeys);

console.log(`Localization audit scanned ${files.length} files.`);
console.log(`Checked ${usages.size} literal localization keys.`);

if ( missing.length ) {
  console.error(`Missing localization keys: ${missing.length}`);
  for ( const issue of missing ) {
    console.error(`\n${issue.key}`);
    for ( const usage of issue.usages ) console.error(`  ${usage.ref} (${usage.kind})`);
    if ( issue.count > issue.usages.length ) console.error(`  ...and ${issue.count - issue.usages.length} more`);
  }
  process.exitCode = 1;
} else {
  console.log("No missing literal localization keys found.");
}

/* -------------------------------------------- */

/**
 * Collect all source files that can contain literal localization keys.
 * @returns {string[]}
 */
function collectSourceFiles() {
  const files = [];
  for ( const source of SOURCES ) {
    const sourcePath = path.join(ROOT, source);
    if ( fs.existsSync(sourcePath) ) walkSource(sourcePath, files);
  }
  return files;
}

/* -------------------------------------------- */

/**
 * Recursively walk a source path.
 * @param {string} sourcePath  Path to walk.
 * @param {string[]} files     Output file list.
 */
function walkSource(sourcePath, files) {
  const stat = fs.statSync(sourcePath);
  if ( stat.isDirectory() ) {
    for ( const entry of fs.readdirSync(sourcePath) ) walkSource(path.join(sourcePath, entry), files);
    return;
  }
  if ( EXTENSIONS.has(path.extname(sourcePath)) ) files.push(sourcePath);
}

/* -------------------------------------------- */

/**
 * Collect literal localization key usages from source files.
 * @param {string[]} files  Source files.
 * @returns {Map<string, object[]>}
 */
function collectLocalizationUsages(files) {
  const usages = new Map();
  for ( const file of files ) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replaceAll(path.sep, "/");
    const lineStarts = getLineStarts(text);
    for ( const { kind, regex } of PATTERNS ) {
      for ( const match of text.matchAll(regex) ) {
        const key = match[1].replace(/[),;'"`\]}]+$/g, "");
        const ref = `${rel}:${lineForIndex(lineStarts, match.index)}`;
        if ( !usages.has(key) ) usages.set(key, []);
        usages.get(key).push({ ref, kind });
      }
    }
  }
  return usages;
}

/* -------------------------------------------- */

/**
 * Find all used localization keys that are missing from the language file.
 * @param {Map<string, object[]>} usages  Localization usages.
 * @param {Set<string>} keys              Existing language keys.
 * @returns {object[]}
 */
function findMissingKeys(usages, keys) {
  return [...usages.entries()]
    .filter(([key]) => !keys.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, refs]) => ({ key, usages: refs.slice(0, 8), count: refs.length }));
}

/* -------------------------------------------- */

/**
 * Flatten nested and flat language keys into one lookup set.
 * @param {object} languageData  Parsed language JSON.
 * @param {string} [prefix]      Current key prefix.
 * @param {Set<string>} [keys]   Output key set.
 * @returns {Set<string>}
 */
function flattenLanguage(languageData, prefix="", keys=new Set()) {
  for ( const [key, value] of Object.entries(languageData) ) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if ( value && (typeof value === "object") && !Array.isArray(value) ) flattenLanguage(value, fullKey, keys);
    else keys.add(fullKey);
  }
  return keys;
}

/* -------------------------------------------- */

/**
 * Get line start indexes for a text blob.
 * @param {string} text  File text.
 * @returns {number[]}
 */
function getLineStarts(text) {
  const starts = [0];
  for ( let i = 0; i < text.length; i++ ) {
    if ( text.charCodeAt(i) === 10 ) starts.push(i + 1);
  }
  return starts;
}

/* -------------------------------------------- */

/**
 * Get the 1-based line number for a string index.
 * @param {number[]} lineStarts  Line start indexes.
 * @param {number} index         String index.
 * @returns {number}
 */
function lineForIndex(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  while ( low <= high ) {
    const mid = Math.floor((low + high) / 2);
    if ( lineStarts[mid] <= index ) low = mid + 1;
    else high = mid - 1;
  }
  return high + 1;
}
