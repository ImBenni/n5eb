#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_ROOT = path.resolve(__dirname, "..");
const ASSETS_ROOT = path.join(SYSTEM_ROOT, "assets");
const CONTENT_ROOT = path.join(ASSETS_ROOT, "content");
const ASSET_PATH_MAP = path.join(SYSTEM_ROOT, "json", "asset-path-map.json");
const DEFAULT_AUDIT = path.join(SYSTEM_ROOT, "json", "asset-optimization-audit.json");

const RASTER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const TEXT_EXTENSIONS = new Set([
  ".css", ".hbs", ".html", ".js", ".json", ".less", ".md", ".mjs", ".scss", ".txt", ".yaml", ".yml"
]);
const ASSET_REFERENCE_RE =
  /(?:(?:systems\/n5eb\/)?assets|worlds\/[^"'<>]*?\/assets\/(?:items|actors|pages))[^"'<>]*?\.(?:png|jpe?g|webp)/gi;
const CONTENT_REFERENCE_RE = /systems\/n5eb\/assets\/content[^"'<>]*?\.webp/gi;

const ORPHAN_REFERENCE_ALIASES = {
  "worlds/shinobi-world/assets/items/image-4hpuCYafQ10U47kw.png": "systems/n5eb/assets/content/items/scroll.webp",
  "worlds/shinobi-world-beta/assets/items/Animated Object Statistics-BnlEV7D8tqRIqgJC.png":
    "systems/n5eb/assets/content/jutsu-icons/non-elemental.webp",
  "worlds/shinobi-world-beta/assets/actors/T7 Old Friend 1-GW7xXicj5kYzvEXw.png":
    "systems/n5eb/assets/content/npcs/old-friend.webp",
  "worlds/shinobi-world-beta/assets/actors/T7 Old Friend 2-Jq3rx4lICRX4Vp8Y.png":
    "systems/n5eb/assets/content/npcs/old-friend-token.webp"
};

const SOURCE_ROOTS = [
  ["assets/Icons & Images/Cheat Sheet", "cheat-sheets"],
  ["assets/Icons & Images/Clans", "clans"],
  ["assets/Icons & Images/Eyes", "eyes"],
  ["assets/Icons & Images/Icons", "jutsu-icons"],
  ["assets/Icons & Images/Items", "items"],
  ["assets/Icons & Images/Npc", "npcs"],
  ["assets/Icons & Images/Other", "other"],
  ["assets/actors", "actors"],
  ["assets/items", "items"],
  ["assets/pages", "pages"]
].map(([source, category]) => ({ source: path.join(SYSTEM_ROOT, source), category }));

const CLEANUP_ROOTS = [
  "assets/Icons & Images",
  "assets/actors",
  "assets/items",
  "assets/pages"
].map(source => path.join(SYSTEM_ROOT, source));

const REWRITE_TARGETS = [
  "system.json",
  "module",
  "templates",
  "less",
  "packs/_source",
  "lang"
].map(target => path.join(SYSTEM_ROOT, target));

const argv = yargs(hideBin(process.argv))
  .option("dry-run", {
    type: "boolean",
    default: false,
    describe: "Plan conversions and rewrites without writing files or removing old assets."
  })
  .option("audit", {
    type: "string",
    default: DEFAULT_AUDIT,
    describe: "Path to write the optimization audit JSON."
  })
  .strict()
  .parseSync();

/**
 * Convert a Windows path to a Foundry-friendly POSIX path.
 * @param {string} value  Filesystem path.
 * @returns {string}      POSIX path.
 */
function toPosix(value) {
  return value.split(path.sep).join("/");
}

/**
 * Check whether a path exists.
 * @param {string} target  Filesystem path.
 * @returns {Promise<boolean>}
 */
async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch{
    return false;
  }
}

/**
 * Read a JSON file if it exists.
 * @param {string} target    File path.
 * @param {*} fallback       Fallback value.
 * @returns {Promise<*>}     Parsed JSON or fallback.
 */
async function readJson(target, fallback) {
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch{
    return fallback;
  }
}

/**
 * Produce a lowercase kebab-case slug for an asset path segment.
 * @param {string} value  Original path segment.
 * @returns {string}      Slug segment.
 */
function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "") || "asset";
}

/**
 * Short stable hash for resolving destination filename collisions.
 * @param {string} value  Input value.
 * @returns {string}      8-character hash.
 */
function hash8(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 8);
}

/**
 * Decode a URL path segment-by-segment, preserving undecodable data.
 * @param {string} value  URL or path.
 * @returns {string}      Decoded URL or path.
 */
function decodePath(value) {
  return value.split("/").map(part => {
    try {
      return decodeURIComponent(part);
    } catch{
      return part;
    }
  }).join("/");
}

/**
 * Normalize an asset reference into a raw canonical web path.
 * @param {string} value  Asset reference.
 * @returns {string}      Canonical path.
 */
function normalizeAssetReference(value) {
  const normalized = value
    .replaceAll("&amp;", "&")
    .replace(/%5C/gi, "/")
    .replace(/%2F/gi, "/")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ");
  return decodePath(normalized);
}

/**
 * URL-encode each path segment while preserving slash separators.
 * @param {string} value  Web path.
 * @returns {string}      Encoded web path.
 */
function encodeWebPath(value) {
  return value.split("/").map(part => encodeURIComponent(part)).join("/");
}

/**
 * Produce common URL variants for an asset path.
 * @param {string} reference  Canonical reference.
 * @returns {string[]}        Variants that should map to the same destination.
 */
function referenceVariants(reference) {
  const variants = new Set();
  const raw = normalizeAssetReference(reference);
  const encoded = encodeWebPath(raw);
  const backslash = raw.replaceAll("/", "\\");
  const mixedBackslash = raw.replace("systems/n5eb/assets/", "systems/n5eb/assets\\").replaceAll("/", "\\");
  for ( const candidate of [raw, encoded, backslash, mixedBackslash] ) {
    variants.add(candidate);
    variants.add(candidate.replaceAll("&", "&amp;"));
  }
  return [...variants];
}

/**
 * Produce old path variants that may exist in packs, HTML descriptions, or world data.
 * @param {string} oldWebPath  Canonical old web path.
 * @returns {string[]}         Variants that should map to the same destination.
 */
function oldPathVariants(oldWebPath) {
  const variants = new Set(referenceVariants(oldWebPath));
  const relative = oldWebPath.replace(/^systems\/n5eb\//, "");
  for ( const variant of referenceVariants(relative) ) variants.add(variant);

  if ( /^assets\/(?:items|actors|pages)\//.test(relative) ) {
    for ( const world of ["shinobi-world", "shinobi-world-beta"] ) {
      for ( const variant of referenceVariants(`worlds/${world}/${relative}`) ) variants.add(variant);
    }
  }

  return [...variants];
}

/**
 * Add derived aliases for existing path-map entries.
 * @param {object} pathMap  Asset path map. *Will be mutated.*
 */
function addDerivedAliases(pathMap) {
  for ( const [source, destination] of Object.entries({ ...pathMap }) ) {
    const canonical = normalizeAssetReference(source);
    if ( !canonical.startsWith("systems/n5eb/assets/") ) continue;

    const relative = canonical.replace(/^systems\/n5eb\//, "");
    for ( const variant of referenceVariants(relative) ) pathMap[variant] = destination;

    if ( /^assets\/(?:items|actors|pages)\//.test(relative) ) {
      for ( const world of ["shinobi-world", "shinobi-world-beta"] ) {
        for ( const variant of referenceVariants(`worlds/${world}/${relative}`) ) pathMap[variant] = destination;
      }
    }
  }

  for ( const [source, destination] of Object.entries(ORPHAN_REFERENCE_ALIASES) ) {
    for ( const variant of referenceVariants(source) ) pathMap[variant] = destination;
  }
}

/**
 * Recursively collect files from a directory.
 * @param {string} root  Directory.
 * @returns {AsyncGenerator<string>}
 * @yields {string} File path.
 */
async function* walkFiles(root) {
  if ( !(await exists(root)) ) return;
  for ( const entry of await fs.readdir(root, { withFileTypes: true }) ) {
    const target = path.join(root, entry.name);
    if ( entry.isDirectory() ) {
      yield* walkFiles(target);
    } else if ( entry.isFile() ) {
      yield target;
    }
  }
}

/**
 * Collect raster assets from the configured old custom asset folders.
 * @returns {Promise<object[]>}  Asset records.
 */
async function collectAssets() {
  const assets = [];
  for ( const { source, category } of SOURCE_ROOTS ) {
    for await ( const file of walkFiles(source) ) {
      if ( !RASTER_EXTENSIONS.has(path.extname(file).toLowerCase()) ) continue;
      const oldAssetPath = toPosix(path.relative(SYSTEM_ROOT, file));
      const oldWebPath = `systems/n5eb/${oldAssetPath}`;
      const relative = path.relative(source, file);
      const ext = path.extname(relative);
      const relativeDir = path.dirname(relative);
      const subdirs = relativeDir === "." ? [] : relativeDir.split(path.sep).map(slugify);
      const stem = slugify(path.basename(relative, ext));
      const destinationRelative = path.posix.join("assets/content", category, ...subdirs, `${stem}.webp`);
      assets.push({
        category,
        source: file,
        oldAssetPath,
        oldWebPath,
        destinationRelative,
        destinationWebPath: `systems/n5eb/${destinationRelative}`
      });
    }
  }

  assets.sort((a, b) => a.oldWebPath.localeCompare(b.oldWebPath));
  const used = new Map();
  for ( const asset of assets ) {
    const existing = used.get(asset.destinationRelative);
    if ( !existing ) {
      used.set(asset.destinationRelative, asset);
      continue;
    }

    const parsed = path.posix.parse(asset.destinationRelative);
    asset.collisionWith = existing.oldWebPath;
    asset.destinationRelative = path.posix.join(parsed.dir, `${parsed.name}-${hash8(asset.oldAssetPath)}.webp`);
    asset.destinationWebPath = `systems/n5eb/${asset.destinationRelative}`;
    used.set(asset.destinationRelative, asset);
  }

  return assets;
}

/**
 * Choose WebP output settings for an asset.
 * @param {object} asset      Asset record.
 * @param {object} metadata   Sharp metadata.
 * @returns {object}          Sharp WebP options.
 */
function webpOptions(asset, metadata) {
  const longestEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  if ( metadata.hasAlpha && longestEdge && (longestEdge <= 512) ) return { lossless: true, effort: 6 };
  if ( ["cheat-sheets", "pages"].includes(asset.category) ) return { quality: 90, effort: 6 };
  if ( ["actors", "npcs"].includes(asset.category) ) return { quality: 84, effort: 6 };
  return { quality: 82, effort: 6 };
}

/**
 * Convert or copy a single asset to the content layout.
 * @param {object} asset  Asset record.
 * @returns {Promise<object>}  Conversion audit data.
 */
async function writeAsset(asset) {
  const destination = path.join(SYSTEM_ROOT, asset.destinationRelative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const before = (await fs.stat(asset.source)).size;
  const ext = path.extname(asset.source).toLowerCase();

  if ( ext === ".webp" ) {
    await fs.copyFile(asset.source, destination);
    const after = (await fs.stat(destination)).size;
    return { mode: "copied-webp", before, after };
  }

  const image = sharp(asset.source, { animated: true });
  const metadata = await image.metadata();
  await image.rotate().webp(webpOptions(asset, metadata)).toFile(destination);
  const after = (await fs.stat(destination)).size;
  return {
    mode: "converted",
    before,
    after,
    dimensions: metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : undefined
  };
}

/**
 * Get candidate text files for path rewriting.
 * @returns {Promise<string[]>}  Text files.
 */
async function collectRewriteFiles() {
  const files = [];
  for ( const target of REWRITE_TARGETS ) {
    if ( !(await exists(target)) ) continue;
    const stat = await fs.stat(target);
    if ( stat.isFile() ) {
      if ( TEXT_EXTENSIONS.has(path.extname(target).toLowerCase()) ) files.push(target);
      continue;
    }

    for await ( const file of walkFiles(target) ) {
      if ( TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()) ) files.push(file);
    }
  }
  return files;
}

/**
 * Rewrite old asset references in a string.
 * @param {string} text                  Original text.
 * @param {Map<string, string>} pathMap  Canonical old path to new path.
 * @returns {{text: string, count: number, unresolved: string[]}}
 */
function rewriteText(text, pathMap) {
  const unresolved = new Set();
  let count = 0;
  const rewritten = text.replace(ASSET_REFERENCE_RE, match => {
    const canonical = normalizeAssetReference(match);
    const replacement = pathMap.get(match) ?? pathMap.get(canonical);
    if ( replacement ) {
      count += 1;
      return replacement;
    }
    if ( canonical.includes("assets/Icons & Images/")
      || canonical.includes("systems/n5eb/assets/items/")
      || canonical.includes("systems/n5eb/assets/actors/")
      || canonical.includes("systems/n5eb/assets/pages/") ) {
      unresolved.add(match);
    }
    return match;
  });
  return { text: rewritten, count, unresolved: [...unresolved] };
}

/**
 * Rewrite old asset references in configured source files.
 * @param {Map<string, string>} pathMap  Canonical old path to new path.
 * @param {boolean} dryRun               Whether to skip writes.
 * @returns {Promise<object>}            Rewrite audit data.
 */
async function rewriteFiles(pathMap, dryRun) {
  const changed = [];
  const unresolved = new Set();
  let replacements = 0;

  for ( const file of await collectRewriteFiles() ) {
    const original = await fs.readFile(file, "utf8");
    const result = rewriteText(original, pathMap);
    if ( result.count === 0 ) {
      for ( const value of result.unresolved ) unresolved.add(value);
      continue;
    }

    replacements += result.count;
    changed.push({ file: toPosix(path.relative(SYSTEM_ROOT, file)), replacements: result.count });
    for ( const value of result.unresolved ) unresolved.add(value);
    if ( !dryRun ) await fs.writeFile(file, result.text, "utf8");
  }

  return { changed, replacements, unresolved: [...unresolved] };
}

/**
 * Validate that rewritten content asset references resolve to files.
 * @returns {Promise<string[]>}  Missing content asset references.
 */
async function validateContentReferences() {
  const missing = new Set();
  for ( const file of await collectRewriteFiles() ) {
    const text = await fs.readFile(file, "utf8");
    for ( const match of text.matchAll(CONTENT_REFERENCE_RE) ) {
      const assetPath = normalizeAssetReference(match[0]).replace(/^systems\/n5eb\//, "");
      if ( !(await exists(path.join(SYSTEM_ROOT, assetPath))) ) missing.add(match[0]);
    }
  }
  return [...missing].sort();
}

/**
 * Remove old source asset folders after all destinations have been written.
 * @returns {Promise<string[]>}  Removed roots.
 */
async function cleanupOldAssetFolders() {
  const removed = [];
  const assetRoot = path.resolve(ASSETS_ROOT);
  const contentRoot = path.resolve(CONTENT_ROOT);

  for ( const root of CLEANUP_ROOTS ) {
    const resolved = path.resolve(root);
    if ( !resolved.startsWith(`${assetRoot}${path.sep}`) ) {
      throw new Error(`Refusing to remove path outside assets: ${resolved}`);
    }
    if ( (resolved === contentRoot) || resolved.startsWith(`${contentRoot}${path.sep}`) ) {
      throw new Error(`Refusing to remove content path: ${resolved}`);
    }
    if ( !(await exists(resolved)) ) continue;
    await fs.rm(resolved, { recursive: true, force: true });
    removed.push(toPosix(path.relative(SYSTEM_ROOT, resolved)));
  }

  return removed;
}

/**
 * Write JSON with stable formatting.
 * @param {string} target  File path.
 * @param {*} data         JSON data.
 * @returns {Promise<void>}
 */
async function writeJson(target, data) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * Main command.
 */
async function main() {
  const dryRun = Boolean(argv.dryRun || argv["dry-run"] || (process.env.npm_config_dry_run === "true"));
  const assets = await collectAssets();
  const existingPathMap = await readJson(ASSET_PATH_MAP, {});
  const generatedPathMap = {};
  const conversionAudit = [];
  let beforeBytes = 0;
  let afterBytes = 0;
  let converted = 0;
  let copiedWebp = 0;

  for ( const asset of assets ) {
    for ( const variant of oldPathVariants(asset.oldWebPath) ) generatedPathMap[variant] = asset.destinationWebPath;
  }

  if ( !dryRun ) {
    for ( const asset of assets ) {
      const result = await writeAsset(asset);
      beforeBytes += result.before;
      afterBytes += result.after;
      converted += result.mode === "converted" ? 1 : 0;
      copiedWebp += result.mode === "copied-webp" ? 1 : 0;
      conversionAudit.push({
        source: asset.oldWebPath,
        destination: asset.destinationWebPath,
        mode: result.mode,
        before: result.before,
        after: result.after,
        dimensions: result.dimensions,
        collisionWith: asset.collisionWith
      });
    }
  } else {
    for ( const asset of assets ) {
      const before = (await fs.stat(asset.source)).size;
      beforeBytes += before;
      converted += path.extname(asset.source).toLowerCase() === ".webp" ? 0 : 1;
      copiedWebp += path.extname(asset.source).toLowerCase() === ".webp" ? 1 : 0;
      conversionAudit.push({
        source: asset.oldWebPath,
        destination: asset.destinationWebPath,
        mode: path.extname(asset.source).toLowerCase() === ".webp" ? "copy-webp-planned" : "convert-planned",
        before,
        collisionWith: asset.collisionWith
      });
    }
  }

  const pathMap = { ...existingPathMap, ...generatedPathMap };
  addDerivedAliases(pathMap);
  const canonicalPathMap = new Map(
    Object.entries(pathMap).map(([key, value]) => [normalizeAssetReference(key), value])
  );
  const rewriteAudit = await rewriteFiles(canonicalPathMap, dryRun);
  let removedRoots = [];

  const preserveExistingAudit = !dryRun && (assets.length === 0) && (await exists(argv.audit));
  if ( !dryRun ) {
    await writeJson(ASSET_PATH_MAP, pathMap);
    removedRoots = await cleanupOldAssetFolders();
  }

  const missingContentReferences = dryRun ? [] : await validateContentReferences();
  const collisions = conversionAudit
    .filter(entry => entry.collisionWith)
    .map(entry => ({ source: entry.source, collisionWith: entry.collisionWith, destination: entry.destination }));
  const audit = {
    dryRun,
    generatedAt: new Date().toISOString(),
    sources: assets.length,
    converted,
    copiedWebp,
    beforeBytes,
    afterBytes: dryRun ? undefined : afterBytes,
    savedBytes: dryRun ? undefined : beforeBytes - afterBytes,
    pathMapEntries: Object.keys(pathMap).length,
    rewrites: {
      files: rewriteAudit.changed.length,
      replacements: rewriteAudit.replacements,
      changed: rewriteAudit.changed,
      unresolved: rewriteAudit.unresolved
    },
    collisions,
    removedRoots,
    missingContentReferences,
    conversions: conversionAudit
  };

  if ( !dryRun && !preserveExistingAudit ) await writeJson(argv.audit, audit);

  const summary = [
    `N5eB asset optimization ${dryRun ? "dry run" : "complete"}.`,
    `Sources: ${assets.length}`,
    `Convert/copy: ${converted}/${copiedWebp}`,
    `Rewrite files/refs: ${rewriteAudit.changed.length}/${rewriteAudit.replacements}`,
    `Collisions resolved: ${collisions.length}`,
    `Unresolved old refs: ${rewriteAudit.unresolved.length}`,
    dryRun ? undefined : `Missing content refs: ${missingContentReferences.length}`,
    dryRun ? undefined : `Saved: ${beforeBytes - afterBytes} bytes`,
    preserveExistingAudit ? "Existing conversion audit preserved." : undefined
  ].filter(Boolean).join("\n");

  console.log(summary);

  if ( rewriteAudit.unresolved.length ) {
    console.warn("Unresolved old asset references:");
    for ( const reference of rewriteAudit.unresolved ) console.warn(`- ${reference}`);
  }
  if ( rewriteAudit.unresolved.length || missingContentReferences.length ) {
    process.exitCode = 1;
  }
}

if ( fsSync.existsSync(ASSETS_ROOT) ) {
  await main();
} else {
  throw new Error(`Assets root not found: ${ASSETS_ROOT}`);
}
