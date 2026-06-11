import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(DIST, "n5eb");
const ARTIFACT = path.join(DIST, "n5eb.zip");

const manifest = readJson("system.json");
const foundry = readJson("foundryvtt.json");

const entries = new Map();

addFile("system.json");
addCompiledModule();
for ( const style of manifest.styles ?? [] ) {
  addFile(style);
  addFile(`${style}.map`, { optional: true });
}
for ( const pack of manifest.packs ?? [] ) addPath(pack.path);
for ( const language of manifest.languages ?? [] ) addFile(language.path);
for ( const include of foundry.includes ?? [] ) addPath(include, { optional: true });

await main();

/* -------------------------------------------- */

/**
 * Stage and compress the N5eB release artifact.
 * @returns {Promise<void>}
 */
async function main() {
  prepare();
  copyEntries();
  await compress();
  verify();
  console.log(`Release artifact written to ${path.relative(ROOT, ARTIFACT)}`);
}

/* -------------------------------------------- */

/**
 * Add the compiled module under the manifest entrypoint name.
 */
function addCompiledModule() {
  const compiled = "dnd5e-compiled.mjs";
  const compiledMap = "dnd5e-compiled.mjs.map";
  if ( !fs.existsSync(path.join(ROOT, compiled)) ) {
    throw new Error(`Missing compiled module '${compiled}'. Run npm run build:code first.`);
  }
  entries.set("dnd5e.mjs", { source: compiled, destination: "dnd5e.mjs" });
  addFile(compiledMap, { optional: true });
}

/* -------------------------------------------- */

/**
 * Add a single file to the release staging list.
 * @param {string} relativePath  Path relative to the system root.
 * @param {object} [options]     Options controlling missing files.
 * @param {boolean} [options.optional=false]  Whether the file may be absent.
 */
function addFile(relativePath, { optional=false }={}) {
  const source = path.join(ROOT, relativePath);
  if ( !fs.existsSync(source) ) {
    if ( optional ) return;
    throw new Error(`Missing release file '${relativePath}'.`);
  }
  entries.set(relativePath.replaceAll("\\", "/"), { source: relativePath, destination: relativePath });
}

/* -------------------------------------------- */

/**
 * Add a file or directory to the release staging list.
 * @param {string} relativePath  Path relative to the system root.
 * @param {object} [options]     Options controlling missing paths.
 * @param {boolean} [options.optional=false]  Whether the path may be absent.
 */
function addPath(relativePath, { optional=false }={}) {
  const clean = relativePath.replaceAll("\\", "/").replace(/\/$/, "");
  const source = path.join(ROOT, clean);
  if ( !fs.existsSync(source) ) {
    if ( optional ) return;
    throw new Error(`Missing release path '${clean}'.`);
  }
  entries.set(clean, { source: clean, destination: clean });
}

/* -------------------------------------------- */

/**
 * Copy staged entries into the temporary release directory.
 */
function copyEntries() {
  for ( const entry of entries.values() ) {
    const source = path.join(ROOT, entry.source);
    const destination = path.join(STAGE, entry.destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, {
      recursive: true,
      filter: sourcePath => {
        const parts = sourcePath.split(path.sep);
        return !parts.includes("_source") && path.basename(sourcePath) !== "LOCK";
      }
    });
  }
}

/* -------------------------------------------- */

/**
 * Compress staged release contents into n5eb.zip.
 * @returns {Promise<void>}
 */
async function compress() {
  fs.rmSync(ARTIFACT, { force: true });
  const command = [
    "$ErrorActionPreference = 'Stop';",
    "Compress-Archive -Path (Join-Path $env:N5EB_STAGE '*') -DestinationPath $env:N5EB_ARTIFACT -Force;"
  ].join(" ");
  await passthrough("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    env: { ...process.env, N5EB_STAGE: STAGE, N5EB_ARTIFACT: ARTIFACT }
  });
}

/* -------------------------------------------- */

/**
 * Prepare the release staging directory.
 */
function prepare() {
  fs.rmSync(STAGE, { force: true, recursive: true });
  fs.mkdirSync(STAGE, { recursive: true });
  fs.mkdirSync(DIST, { recursive: true });
}

/* -------------------------------------------- */

/**
 * Read and parse a JSON file from the system root.
 * @param {string} relativePath  Path relative to the system root.
 * @returns {object}
 */
function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

/* -------------------------------------------- */

/**
 * Verify the staged release manifest and artifact.
 */
function verify() {
  if ( !fs.existsSync(ARTIFACT) ) throw new Error("Package verification failed: n5eb.zip was not created.");
  if ( !fs.existsSync(path.join(STAGE, "system.json")) ) {
    throw new Error("Package verification failed: staged system.json is missing.");
  }
  const stagedManifest = readJson(path.relative(ROOT, path.join(STAGE, "system.json")));
  if ( stagedManifest.version !== "3.0.0" ) {
    throw new Error(`Package verification failed: expected version 3.0.0, found ${stagedManifest.version}.`);
  }
}

/* -------------------------------------------- */

/**
 * Spawn a command and pass its output through to this process.
 * @param {string} cmd  Command to execute.
 * @param {string[]} [args=[]]  Command arguments.
 * @param {object} [options={}]  Spawn options.
 * @returns {Promise<void>}
 */
function passthrough(cmd, args=[], options={}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...options });
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}.`)));
    child.on("error", reject);
  });
}
