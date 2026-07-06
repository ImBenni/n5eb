#!/usr/bin/env node
/* eslint-disable jsdoc/require-jsdoc, keyword-spacing, max-len */

import childProcess from "node:child_process";
import fs from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ClassicLevel } from "classic-level";
import YAML from "js-yaml";
import sharp from "sharp";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_ROOT = path.resolve(__dirname, "..");
const CONTENT_ROOT = path.join(SYSTEM_ROOT, "assets", "content");
const PACK_SOURCE_ROOT = path.join(SYSTEM_ROOT, "packs", "_source");
const TARGET_PACK = "hb-adversary";
const TARGET_PACK_ROOT = path.join(PACK_SOURCE_ROOT, TARGET_PACK);
const ASSET_PATH_MAP = path.join(SYSTEM_ROOT, "json", "asset-path-map.json");
const DEFAULT_AUDIT = path.join(SYSTEM_ROOT, "json", "homebrew-drop-import-audit.json");
const FORGE_PREFIX_RE = /^https?:\/\/assets\.forge-vtt\.com\/[^/]+\//i;

const RASTER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
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
];

const argv = yargs(hideBin(process.argv))
  .option("assets", {
    type: "string",
    default: "D:/Downloads/assets.rar",
    describe: "RAR archive containing the old-layout asset folders."
  })
  .option("characters", {
    type: "string",
    default: "D:/Downloads/homebrew-characters.rar",
    describe: "RAR archive containing the Foundry LevelDB homebrew character pack."
  })
  .option("audit", {
    type: "string",
    default: DEFAULT_AUDIT,
    describe: "Path to write the import audit JSON."
  })
  .option("dry-run", {
    type: "boolean",
    default: false,
    describe: "Analyze and report without writing assets, pack sources, or the asset path map."
  })
  .option("keep-temp", {
    type: "boolean",
    default: false,
    describe: "Keep the temporary extraction folder after the run."
  })
  .strict()
  .parseSync();

const dryRun = argv.dryRun;
const audit = {
  dryRun,
  generatedAt: new Date().toISOString(),
  assetsArchive: path.resolve(argv.assets),
  charactersArchive: path.resolve(argv.characters),
  tempRoot: null,
  assets: {
    archiveImages: 0,
    mappedImages: 0,
    destinationCollisions: 0,
    written: 0,
    converted: 0,
    copiedWebp: 0,
    overwrittenExisting: 0,
    skippedPerceptualDuplicate: 0,
    byCategory: {},
    duplicateSamples: [],
    collisionSamples: []
  },
  pathMap: {
    entriesBefore: 0,
    entriesAfter: 0,
    entriesAddedOrChanged: 0
  },
  actors: {
    dbRecords: 0,
    topLevelActors: 0,
    imported: 0,
    skippedExisting: 0,
    foldersInArchive: 0,
    foldersImported: 0,
    foldersReused: 0,
    actorEffects: 0,
    actorItems: 0,
    itemEffects: 0,
    missingArtActors: 0,
    missingAssetReferences: 0,
    importedSamples: [],
    skippedSamples: [],
    missingArtSamples: []
  }
};

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

async function main() {
  await assertFile(argv.assets);
  await assertFile(argv.characters);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "n5eb-homebrew-drop-"));
  audit.tempRoot = tempRoot;

  try {
    const assetsExtractRoot = path.join(tempRoot, "assets");
    const charactersExtractRoot = path.join(tempRoot, "characters");
    await mkdir(assetsExtractRoot, { recursive: true });
    await mkdir(charactersExtractRoot, { recursive: true });
    await extractArchive(path.resolve(argv.assets), assetsExtractRoot);
    await extractArchive(path.resolve(argv.characters), charactersExtractRoot);

    const pathMap = await readJson(ASSET_PATH_MAP, {});
    audit.pathMap.entriesBefore = Object.keys(pathMap).length;

    const existingImages = await collectExistingImageSignatures();
    const assetRecords = await collectArchiveAssets(assetsExtractRoot);
    const chosenAssets = chooseDestinationAssets(assetRecords);
    await processAssets(chosenAssets, pathMap, existingImages);

    const dbRoot = await findLevelDbRoot(charactersExtractRoot);
    const actorImport = await loadActorImport(dbRoot);
    await importActors(actorImport, pathMap);

    audit.pathMap.entriesAfter = Object.keys(pathMap).length;
    if ( !dryRun ) await writeFile(ASSET_PATH_MAP, `${JSON.stringify(pathMap, null, 2)}\n`, "utf8");
    await writeFile(path.resolve(argv.audit), `${JSON.stringify(audit, null, 2)}\n`, "utf8");

    printSummary();
  } finally {
    if ( argv.keepTemp || process.exitCode ) {
      console.log(`Temp folder kept: ${tempRoot}`);
    } else {
      await removeTempRoot(tempRoot);
    }
  }
}

async function removeTempRoot(tempRoot) {
  sharp.cache(false);
  for ( let attempt = 1; attempt <= 5; attempt++ ) {
    try {
      await rm(tempRoot, { recursive: true, force: true });
      return;
    } catch( err ) {
      if ( attempt === 5 ) {
        console.warn(`Unable to remove temp folder ${tempRoot}: ${err.message}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 250 * attempt));
    }
  }
}

async function assertFile(file) {
  const resolved = path.resolve(file);
  const info = await stat(resolved);
  if ( !info.isFile() ) throw new Error(`Expected file: ${resolved}`);
}

async function extractArchive(archive, destination) {
  await new Promise((resolve, reject) => {
    const child = childProcess.spawn("tar", ["-xf", archive, "-C", destination], {
      cwd: SYSTEM_ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if ( code ) reject(new Error(`tar failed for ${archive}: ${stderr.trim()}`));
      else resolve();
    });
  });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch{
    return fallback;
  }
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch{
    return false;
  }
}

async function* walkFiles(root) {
  if ( !(await exists(root)) ) return;
  for ( const entry of await fs.promises.readdir(root, { withFileTypes: true }) ) {
    const target = path.join(root, entry.name);
    if ( entry.isDirectory() ) yield* walkFiles(target);
    else if ( entry.isFile() ) yield target;
  }
}

async function collectArchiveAssets(archiveRoot) {
  const assets = [];
  for ( const [sourceRoot, category] of SOURCE_ROOTS ) {
    const source = path.join(archiveRoot, ...sourceRoot.split("/"));
    for await ( const file of walkFiles(source) ) {
      if ( !RASTER_EXTENSIONS.has(path.extname(file).toLowerCase()) ) continue;
      const oldAssetPath = toPosix(path.relative(archiveRoot, file));
      const oldWebPath = `systems/n5eb/${oldAssetPath}`;
      const relative = path.relative(source, file);
      const parsed = path.parse(relative);
      const relativeDir = path.dirname(relative);
      const subdirs = relativeDir === "." ? [] : relativeDir.split(path.sep).map(slugify);
      const destinationRelative = path.posix.join("assets/content", category, ...subdirs, `${slugify(parsed.name)}.webp`);
      assets.push({
        category,
        source: file,
        oldAssetPath,
        oldWebPath,
        destinationRelative,
        destinationWebPath: `systems/n5eb/${destinationRelative}`,
        comparableName: comparableAssetName(parsed.name)
      });
      audit.assets.archiveImages++;
      audit.assets.byCategory[category] = (audit.assets.byCategory[category] ?? 0) + 1;
    }
  }

  assets.sort((a, b) => a.oldWebPath.localeCompare(b.oldWebPath));
  return assets;
}

function chooseDestinationAssets(assetRecords) {
  const grouped = new Map();
  for ( const asset of assetRecords ) {
    if ( !grouped.has(asset.destinationRelative) ) grouped.set(asset.destinationRelative, []);
    grouped.get(asset.destinationRelative).push(asset);
  }

  const chosen = [];
  for ( const [destinationRelative, group] of grouped ) {
    if ( group.length > 1 ) {
      audit.assets.destinationCollisions++;
      if ( audit.assets.collisionSamples.length < 20 ) {
        audit.assets.collisionSamples.push({
          destination: destinationRelative,
          sources: group.map(asset => asset.oldWebPath)
        });
      }
    }
    chosen.push({ ...group.at(-1), aliases: group.map(asset => asset.oldWebPath) });
  }
  return chosen;
}

async function collectExistingImageSignatures() {
  const signatures = new Map();
  for await ( const file of walkFiles(CONTENT_ROOT) ) {
    if ( !RASTER_EXTENSIONS.has(path.extname(file).toLowerCase()) ) continue;
    try {
      const signature = await imageSignature(file);
      const key = signatureKey(signature);
      if ( !signatures.has(key) ) signatures.set(key, []);
      signatures.get(key).push({
        file,
        webPath: `systems/n5eb/${toPosix(path.relative(SYSTEM_ROOT, file))}`,
        comparableName: comparableAssetName(path.basename(file, path.extname(file)))
      });
    } catch{
      // Ignore unreadable existing assets; they should not block the import.
    }
  }
  return signatures;
}

async function processAssets(assets, pathMap, existingImages) {
  for ( const asset of assets ) {
    const destination = path.join(SYSTEM_ROOT, ...asset.destinationRelative.split("/"));
    const destinationExists = await exists(destination);
    let destinationWebPath = asset.destinationWebPath;
    let shouldWrite = true;

    if ( !destinationExists ) {
      const signature = await imageSignature(asset.source);
      const duplicate = await findVisualDuplicate(asset.source, asset.comparableName, existingImages.get(signatureKey(signature)) ?? []);
      if ( duplicate ) {
        shouldWrite = false;
        destinationWebPath = duplicate.webPath;
        audit.assets.skippedPerceptualDuplicate++;
        if ( audit.assets.duplicateSamples.length < 20 ) {
          audit.assets.duplicateSamples.push({ source: asset.oldWebPath, destination: duplicate.webPath });
        }
      }
    }

    audit.assets.mappedImages++;
    addAssetAliases(pathMap, asset.oldWebPath, destinationWebPath);
    for ( const alias of asset.aliases ?? [] ) addAssetAliases(pathMap, alias, destinationWebPath);

    if ( !shouldWrite ) continue;
    if ( destinationExists ) audit.assets.overwrittenExisting++;

    if ( dryRun ) continue;
    const result = await writeAsset(asset, destination);
    audit.assets.written++;
    if ( result.mode === "converted" ) audit.assets.converted++;
    if ( result.mode === "copied-webp" ) audit.assets.copiedWebp++;
  }
}

async function findVisualDuplicate(source, sourceName, candidates) {
  for ( const candidate of candidates ) {
    if ( !assetNamesLikelyMatch(sourceName, candidate.comparableName) ) continue;
    const difference = await imageDifference(source, candidate.file);
    if ( difference.mae <= 3 ) return candidate;
  }
  return null;
}

async function imageDifference(source, target) {
  const left = await sharp(source).rotate().resize(128, 128, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const right = await sharp(target).rotate().resize(128, 128, { fit: "fill" }).removeAlpha().raw().toBuffer();
  let sum = 0;
  const length = Math.min(left.length, right.length);
  for ( let i = 0; i < length; i++ ) sum += Math.abs(left[i] - right[i]);
  return { mae: sum / length };
}

async function writeAsset(asset, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const ext = path.extname(asset.source).toLowerCase();
  if ( ext === ".webp" ) {
    await copyFile(asset.source, destination);
    return { mode: "copied-webp" };
  }

  const image = sharp(asset.source, { animated: true });
  const metadata = await image.metadata();
  await image.rotate().webp(webpOptions(asset, metadata)).toFile(destination);
  return { mode: "converted" };
}

function webpOptions(asset, metadata) {
  const longestEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  if ( metadata.hasAlpha && longestEdge && (longestEdge <= 512) ) return { lossless: true, effort: 6 };
  if ( ["cheat-sheets", "pages"].includes(asset.category) ) return { quality: 90, effort: 6 };
  if ( ["actors", "npcs"].includes(asset.category) ) return { quality: 84, effort: 6 };
  return { quality: 82, effort: 6 };
}

async function imageSignature(file) {
  const metadata = await sharp(file).metadata();
  const { data } = await sharp(file).rotate().resize(16, 16, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for ( const value of data ) sum += value;
  const average = sum / data.length;
  let hash = "";
  for ( let i = 0; i < data.length; i += 4 ) {
    let nibble = 0;
    for ( let j = 0; j < 4; j++ ) nibble = (nibble << 1) | ((data[i + j] ?? 0) >= average ? 1 : 0);
    hash += nibble.toString(16);
  }
  return { width: metadata.width, height: metadata.height, hash };
}

function signatureKey(signature) {
  return `${signature.width}x${signature.height}:${signature.hash}`;
}

function addAssetAliases(pathMap, source, destination) {
  for ( const alias of referenceVariants(source) ) {
    if ( pathMap[alias] !== destination ) audit.pathMap.entriesAddedOrChanged++;
    pathMap[alias] = destination;
  }
}

function referenceVariants(reference) {
  const normalized = normalizeReference(reference);
  const variants = new Set([normalized, encodeWebPath(normalized), normalized.replaceAll("/", "\\")]);
  const relative = normalized.replace(/^systems\/n5eb\//, "");
  variants.add(relative);
  variants.add(encodeWebPath(relative));
  for ( const variant of [...variants] ) {
    variants.add(variant.replaceAll("&", "&amp;"));
    variants.add(`https://assets.forge-vtt.com/65b38f9ab0af82132ed2bf61/${variant}`);
  }
  return [...variants];
}

function normalizeReference(reference) {
  let value = `${reference}`
    .replaceAll("&amp;", "&")
    .replace(/%5C/gi, "/")
    .replace(/%2F/gi, "/")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ");
  value = decodePath(value);
  value = value.replace(FORGE_PREFIX_RE, "");
  const systemIndex = value.indexOf("systems/n5eb/");
  if ( systemIndex >= 0 ) value = value.slice(systemIndex);
  return value;
}

function decodePath(value) {
  return value.split("/").map(part => {
    try {
      return decodeURIComponent(part);
    } catch{
      return part;
    }
  }).join("/");
}

function encodeWebPath(value) {
  return value.split("/").map(part => encodeURIComponent(part)).join("/");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function slugify(value) {
  return `${value}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "") || "asset";
}

function comparableAssetName(value) {
  return slugify(value)
    .replace(/(?:^|-)clan(?:-|$)/g, "-")
    .replace(/(?:^|-)symbol(?:-|$)/g, "-")
    .replace(/(?:^|-)icon(?:-|$)/g, "-")
    .replace(/(?:^|-)fullview(?:-|$)/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function assetNamesLikelyMatch(left, right) {
  if ( !left || !right ) return false;
  if ( left === right ) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 4 && longer.includes(shorter);
}

async function findLevelDbRoot(root) {
  for await ( const file of walkFiles(root) ) {
    if ( path.basename(file) !== "CURRENT" ) continue;
    const candidate = path.dirname(file);
    const entries = await fs.promises.readdir(candidate);
    if ( entries.some(entry => entry.startsWith("MANIFEST-")) ) return candidate;
  }
  throw new Error(`Unable to locate LevelDB root under ${root}`);
}

async function loadActorImport(dbRoot) {
  const db = new ClassicLevel(dbRoot, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  const folders = new Map();
  const actors = new Map();
  const actorItems = new Map();
  const actorEffects = new Map();
  const itemEffects = new Map();

  try {
    for await ( const [key, value] of db.iterator() ) {
      audit.actors.dbRecords++;
      const parts = key.split("!");
      const collection = parts[1];
      const idPath = parts[2] ?? "";
      if ( collection === "folders" ) {
        folders.set(value._id, structuredClone(value));
        continue;
      }
      if ( collection === "actors" ) {
        actors.set(value._id, structuredClone(value));
        continue;
      }

      const ids = idPath.split(".");
      if ( collection === "actors.items" ) {
        const [actorId] = ids;
        if ( !actorItems.has(actorId) ) actorItems.set(actorId, []);
        actorItems.get(actorId).push(structuredClone(value));
        audit.actors.actorItems++;
      } else if ( collection === "actors.effects" ) {
        const [actorId] = ids;
        if ( !actorEffects.has(actorId) ) actorEffects.set(actorId, []);
        actorEffects.get(actorId).push(structuredClone(value));
        audit.actors.actorEffects++;
      } else if ( collection === "actors.items.effects" ) {
        const [actorId, itemId] = ids;
        const itemKey = `${actorId}.${itemId}`;
        if ( !itemEffects.has(itemKey) ) itemEffects.set(itemKey, []);
        itemEffects.get(itemKey).push(structuredClone(value));
        audit.actors.itemEffects++;
      }
    }
  } finally {
    await db.close();
  }

  audit.actors.topLevelActors = actors.size;
  audit.actors.foldersInArchive = folders.size;
  return { folders, actors, actorItems, actorEffects, itemEffects };
}

async function importActors({ folders, actors, actorItems, actorEffects, itemEffects }, pathMap) {
  const existing = await loadExistingPackIndex(TARGET_PACK_ROOT);
  const folderPaths = buildFolderPaths(folders, existing.foldersById);
  const foldersToWrite = [...folders.values()].filter(folder => !existing.foldersById.has(folder._id));
  audit.actors.foldersReused = folders.size - foldersToWrite.length;

  for ( const folder of foldersToWrite ) {
    const output = path.join(TARGET_PACK_ROOT, folderPaths.get(folder._id), "_folder.yml");
    const document = cleanDocument(structuredClone(folder));
    document._key = `!folders!${document._id}`;
    if ( !dryRun ) await writeYaml(output, document);
    audit.actors.foldersImported++;
  }

  for ( const actor of [...actors.values()].sort((a, b) => `${a.name}`.localeCompare(`${b.name}`)) ) {
    const duplicateKey = `${actor.type ?? ""}|${(actor.name ?? "").toLowerCase()}`;
    if ( existing.actorIds.has(actor._id) ) {
      audit.actors.skippedExisting++;
      if ( audit.actors.skippedSamples.length < 20 ) {
        audit.actors.skippedSamples.push({ id: actor._id, name: actor.name });
      }
      continue;
    }

    const document = cleanDocument(structuredClone(actor));
    document.items = (actorItems.get(actor._id) ?? []).map(item => {
      const itemDocument = cleanDocument(structuredClone(item));
      itemDocument.effects = (itemEffects.get(`${actor._id}.${item._id}`) ?? []).map(effect => {
        const effectDocument = cleanDocument(structuredClone(effect));
        effectDocument._key = `!actors.items.effects!${actor._id}.${item._id}.${effectDocument._id}`;
        return effectDocument;
      });
      itemDocument._key = `!actors.items!${actor._id}.${itemDocument._id}`;
      return itemDocument;
    });
    document.effects = (actorEffects.get(actor._id) ?? []).map(effect => {
      const effectDocument = cleanDocument(structuredClone(effect));
      effectDocument._key = `!actors.effects!${actor._id}.${effectDocument._id}`;
      return effectDocument;
    });
    document._key = `!actors!${document._id}`;

    const missingBefore = audit.actors.missingAssetReferences;
    rewriteDocumentAssetReferences(document, pathMap);
    const missingForActor = audit.actors.missingAssetReferences - missingBefore;
    if ( missingForActor ) {
      audit.actors.missingArtActors++;
      if ( audit.actors.missingArtSamples.length < 40 ) {
        audit.actors.missingArtSamples.push({ id: document._id, name: document.name, missingReferences: missingForActor });
      }
    }

    const folderPath = document.folder ? folderPaths.get(document.folder) : "";
    const output = uniqueActorOutputPath(path.join(TARGET_PACK_ROOT, folderPath ?? ""), slugify(document.name), document._id, existing.outputPaths);
    if ( !dryRun ) await writeYaml(output, document);
    existing.actorIds.add(document._id);
    existing.actorNames.add(duplicateKey);
    existing.outputPaths.add(path.resolve(output).toLowerCase());
    audit.actors.imported++;
    if ( audit.actors.importedSamples.length < 20 ) audit.actors.importedSamples.push({ id: document._id, name: document.name, file: toPosix(path.relative(SYSTEM_ROOT, output)) });
  }
}

async function loadExistingPackIndex(root) {
  const actorIds = new Set();
  const actorNames = new Set();
  const foldersById = new Map();
  const folderPathsById = new Map();
  const outputPaths = new Set();

  for await ( const file of walkFiles(root) ) {
    if ( ![".yml", ".yaml"].includes(path.extname(file)) ) continue;
    outputPaths.add(path.resolve(file).toLowerCase());
    const document = YAML.load(await readFile(file, "utf8"));
    if ( !document?._id ) continue;
    if ( document._key?.startsWith("!folders!") || path.basename(file) === "_folder.yml" ) {
      foldersById.set(document._id, document);
      folderPathsById.set(document._id, toPosix(path.relative(root, path.dirname(file))));
    } else if ( document._key?.startsWith("!actors!") || document.type === "npc" ) {
      actorIds.add(document._id);
      actorNames.add(`${document.type ?? ""}|${(document.name ?? "").toLowerCase()}`);
    }
  }

  return { actorIds, actorNames, foldersById, folderPathsById, outputPaths };
}

function buildFolderPaths(importFolders, existingFolders) {
  const paths = new Map();
  const resolve = folderId => {
    if ( paths.has(folderId) ) return paths.get(folderId);
    const folder = importFolders.get(folderId);
    if ( !folder ) return "";
    const parentPath = folder.folder ? resolve(folder.folder) : "";
    const current = parentPath ? path.posix.join(parentPath, slugify(folder.name)) : slugify(folder.name);
    paths.set(folderId, current);
    return current;
  };

  for ( const folder of importFolders.values() ) {
    if ( existingFolders.has(folder._id) ) {
      const existingPath = findExistingFolderPath(folder._id);
      if ( existingPath !== null ) paths.set(folder._id, existingPath);
    }
  }
  for ( const folder of importFolders.values() ) resolve(folder._id);
  return paths;
}

function findExistingFolderPath(folderId) {
  const stack = [TARGET_PACK_ROOT];
  while ( stack.length ) {
    const dir = stack.pop();
    for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
      const target = path.join(dir, entry.name);
      if ( entry.isDirectory() ) {
        stack.push(target);
      } else if ( entry.name === "_folder.yml" ) {
        try {
          const doc = YAML.load(fs.readFileSync(target, "utf8"));
          if ( doc?._id === folderId ) return toPosix(path.relative(TARGET_PACK_ROOT, path.dirname(target)));
        } catch{
          // Keep searching.
        }
      }
    }
  }
  return null;
}

function uniqueActorOutputPath(directory, stem, id, usedPaths) {
  const first = path.join(directory, `${stem}.yml`);
  if ( !usedPaths.has(path.resolve(first).toLowerCase()) ) return first;
  return path.join(directory, `${stem}-${id}.yml`);
}

function cleanDocument(data) {
  delete data._stats?.compendiumSource;
  delete data.flags?.core?.sourceId;
  delete data.flags?.importSource;
  delete data.flags?.exportSource;
  if ( data.ownership ) data.ownership = { default: 0 };
  if ( data._stats?.lastModifiedBy ) data._stats.lastModifiedBy = "dnd5ebuilder0000";
  if ( data.name ) data.name = cleanString(data.name);
  if ( data.label ) data.label = cleanString(data.label);
  if ( data.system?.description?.value ) data.system.description.value = cleanString(data.system.description.value);
  if ( !data.flags ) data.flags = {};
  data.flags.n5eb ??= {};
  data.flags.n5eb.homebrewDropImport = {
    sourceArchive: path.basename(argv.characters),
    importedAt: audit.generatedAt
  };
  Object.entries(data.flags).forEach(([key, value]) => {
    if ( value && (typeof value === "object") && !Object.keys(value).length ) delete data.flags[key];
    if ( value === null ) delete data.flags[key];
  });
  return data;
}

function cleanString(value) {
  return `${value}`.replace(/\u2060/gu, "").replace(/[‘’]/gu, "'").replace(/[“”]/gu, "\"");
}

function rewriteDocumentAssetReferences(document, pathMap) {
  rewriteValue(document, [], pathMap);
  if ( document.img === "icons/svg/mystery-man.svg" ) document.img = "";
  if ( document.prototypeToken?.texture?.src === "icons/svg/mystery-man.svg" ) document.prototypeToken.texture.src = "";
}

function rewriteValue(value, keyPath, pathMap) {
  if ( typeof value === "string" ) return rewriteString(value, keyPath, pathMap);
  if ( Array.isArray(value) ) {
    for ( let i = 0; i < value.length; i++ ) value[i] = rewriteValue(value[i], [...keyPath, `${i}`], pathMap);
    return value;
  }
  if ( value && (typeof value === "object") ) {
    for ( const [key, child] of Object.entries(value) ) value[key] = rewriteValue(child, [...keyPath, key], pathMap);
  }
  return value;
}

function rewriteString(value, keyPath, pathMap) {
  const normalized = normalizeReference(value);
  const direct = lookupAsset(pathMap, value) ?? lookupAsset(pathMap, normalized);
  if ( direct ) return direct;
  if ( isOldN5eAssetReference(normalized) ) {
    audit.actors.missingAssetReferences++;
    if ( keyPath.at(-1) === "img" || keyPath.join(".").endsWith("texture.src") ) return "";
  }
  return value.replace(/(?:https?:\/\/assets\.forge-vtt\.com\/[^"'<> ]+\/)?systems\/n5eb\/assets\/[^"'<>]*?\.(?:png|jpe?g|webp)/gi, match => {
    const replacement = lookupAsset(pathMap, match) ?? lookupAsset(pathMap, normalizeReference(match));
    if ( replacement ) return replacement;
    audit.actors.missingAssetReferences++;
    return "";
  });
}

function lookupAsset(pathMap, reference) {
  for ( const variant of referenceVariants(reference) ) {
    if ( pathMap[variant] ) return pathMap[variant];
  }
  return null;
}

function isOldN5eAssetReference(value) {
  return /^systems\/n5eb\/assets\/(?!(?:content)\/).+?\.(?:png|jpe?g|webp)$/i.test(value);
}

async function writeYaml(file, document) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${YAML.dump(document, { lineWidth: 120, noRefs: true })}\n`, "utf8");
}

function printSummary() {
  console.log(`Homebrew drop import ${dryRun ? "dry run" : "complete"}`);
  console.log(`Assets: ${audit.assets.archiveImages} archive images, ${audit.assets.mappedImages} mapped, ${audit.assets.written} written, ${audit.assets.overwrittenExisting} overwrite candidates, ${audit.assets.skippedPerceptualDuplicate} perceptual duplicates skipped.`);
  console.log(`Actors: ${audit.actors.topLevelActors} top-level, ${audit.actors.imported} imported, ${audit.actors.skippedExisting} skipped existing, ${audit.actors.foldersImported} folders imported, ${audit.actors.missingArtActors} actors with missing art cleared.`);
  console.log(`Audit: ${path.resolve(argv.audit)}`);
}
