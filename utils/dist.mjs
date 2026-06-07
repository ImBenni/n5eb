import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const { argv } = yargs(hideBin(process.argv))
  .scriptName("dist")
  .version(false)
  .command("$0 <tag> <free-rules>", "Build the package for distribution.", yargs => {
    yargs.positional("tag", {
      describe: "The release version tag.",
      type: "string"
    });
    yargs.positional("free-rules", {
      describe: "The path to the free rules content.",
      type: "string"
    });
    yargs.option("out", {
      alias: "o",
      describe: "The path to the output directory.",
      type: "string",
      default: "./dist",
      requiresArg: true
    });
    yargs.option("repo", {
      alias: "r",
      describe: "The dnd5e repository.",
      type: "string",
      default: "git@github.com:foundryvtt/dnd5e.git",
      requiresArg: true
    });
    yargs.option("url", {
      describe: "A public URL where releases are posted.",
      type: "string",
      default: "https://github.com/foundryvtt/dnd5e",
      requiresArg: true
    });
  })
  .help();

const { freeRules, out } = argv;
const paths = { dist: out, free: freeRules };

const SRD_PACKS = new Set([
  "heroes", "monsters", "srd-items", "tradegoods", "spells", "srd-backgrounds", "classes", "subclasses",
  "classfeatures", "races", "monsterfeatures", "srd-rules", "tables",
  "content24", "classes24", "origins24", "feats24", "spells24", "equipment24", "tables24", "actors24",
  "monsterfeatures24"
]);

/* -------------------------------------------- */

/**
 * Perform build steps.
 * @returns {Promise<void>}
 */
async function build() {
  await passthrough("npm", ["run", "build"], { cwd: paths.dist });
  fs.renameSync(path.join(paths.dist, "dnd5e-compiled.mjs"), path.join(paths.dist, "dnd5e.mjs"));
}

/* -------------------------------------------- */

/**
 * Pull a fresh clone of the repo at the required release version.
 * @returns {Promise<void>}
 */
function checkout() {
  return passthrough("git", ["clone", "-b", argv.tag, "--depth", "1", argv.repo, paths.dist]);
}

/* -------------------------------------------- */

/**
 * Compile a new system manifest.
 */
function compileManifest() {
  console.info("Making manifest changes...");

  // Load both manifests.
  const systemManifest = JSON.parse(fs.readFileSync(path.join(paths.dist, "system.json"), "utf8"));

  systemManifest.flags.n5eb.sourceBooks = {
    "Naruto 5e": "Naruto 5e",
    "Team 7": "Team 7",
    Homebrew: "Homebrew"
  };
  stripSRDPacks(systemManifest);

  // Remove flags.
  delete systemManifest.flags.hotReload;

  // Make sure versions are correct.
  const [, version] = argv.tag.split("-");
  const download = `${argv.url}/releases/download/${argv.tag}/dnd5e-${argv.tag}.zip`;
  if ( systemManifest.version !== version ) {
    throw new Error(`System manifest version did not match build version '${version}'.`);
  }
  if ( systemManifest.download !== download ) {
    throw new Error(`System download path did not match build download path '${download}'.`);
  }

  // Write updated manifest.
  const manifest = `${JSON.stringify(systemManifest, null, 2)}\n`;
  fs.writeFileSync(path.join(paths.dist, "system.json"), manifest, { mode: 0o644 });
}

/* -------------------------------------------- */

/**
 * Remove SRD packs from a distribution manifest.
 * @param {object} manifest  Manifest data to mutate.
 */
function stripSRDPacks(manifest) {
  console.info("Stripping SRD compendium packs...");
  manifest.packs = (manifest.packs ?? []).filter(pack => !SRD_PACKS.has(pack.name));
  manifest.packFolders = stripPackFolders(manifest.packFolders ?? []);
}

/* -------------------------------------------- */

/**
 * Remove hidden SRD packs and empty folders from a pack folder tree.
 * @param {object[]} folders  Pack folders to filter.
 * @returns {object[]}        Filtered folder tree.
 */
function stripPackFolders(folders) {
  return folders.reduce((filtered, folder) => {
    const next = { ...folder };
    if ( Array.isArray(next.packs) ) next.packs = next.packs.filter(pack => !SRD_PACKS.has(pack));
    if ( Array.isArray(next.folders) ) next.folders = stripPackFolders(next.folders);
    if ( (next.packs?.length ?? 0) || (next.folders?.length ?? 0) ) filtered.push(next);
    return filtered;
  }, []);
}

/* -------------------------------------------- */

/**
 * Copy compendium content and adjust it.
 */
function copyCompendiumContent() {
  console.info("Copying compendium content...");
  const source = path.join(paths.free, "packs", "_source");
  for ( const file of fs.readdirSync(source, { recursive: true, withFileTypes: true }) ) {
    if ( !file.isFile() ) continue;
    const src = path.join(file.parentPath, file.name);
    const dest = path.join(paths.dist, path.relative(paths.free, src));
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    let data = fs.readFileSync(src, "utf8");
    data = data.replaceAll("modules/dnd-free-rules/icons/", "systems/n5eb/icons/");
    console.info(`Writing ${dest}...`);
    fs.writeFileSync(dest, data, { mode: 0o644 });
  }
}

/* -------------------------------------------- */

/**
 * Copy free rules images.
 */
function copyImages() {
  console.log("Copying images...");
  fs.cpSync(path.join(paths.free, "icons"), path.join(paths.dist, "icons"), { recursive: true });
}

/* -------------------------------------------- */

/**
 * Install repository dependencies.
 * @returns {Promise<void>}
 */
function installDeps() {
  return passthrough("npm", ["ci", "--ignore-scripts"], { cwd: paths.dist });
}

/* -------------------------------------------- */

/**
 * Spawn a child command, passing its output through to the main process.
 * @param {string} cmd              The command to execute.
 * @param {string[]} [args]         Command-line arguments.
 * @param {SpawnOptions} [options]  Options forwarded to the spawn invocation.
 * @returns {Promise<void>}         A promise that resolves when the command has completed.
 */
function passthrough(cmd, args=[], options={}) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const proc = spawn(cmd, args, { stdio: "inherit", ...options });
  const fail = () => {
    reject();
    process.exit(1);
  };
  proc.on("close", code => {
    if ( code === 0 ) resolve();
    else fail();
  });
  proc.on("error", fail);
  return promise;
}

/* -------------------------------------------- */

/**
 * Prepare the output directory.
 */
function prepareDist() {
  console.info("Cleaning existing dist...");
  fs.rmSync(paths.dist, { force: true, recursive: true });
  fs.mkdirSync(paths.dist, { recursive: true });
}

/* -------------------------------------------- */

/**
 * Produce the release artifact.
 * @returns {Promise<void>}
 */
async function zip() {
  console.log("Building release artifact...");
  const manifest = JSON.parse(fs.readFileSync(path.join(paths.dist, "system.json"), "utf8"));
  const config = JSON.parse(fs.readFileSync(path.join(paths.dist, "foundryvtt.json"), "utf8"));
  const includes = [
    "system.json",
    ...(manifest.esmodules ?? []),
    ...(manifest.esmodules?.map(s => `${s}.map`) ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.packs?.map(p => p.path) ?? []),
    ...(manifest.languages?.map(l => l.path) ?? []),
    ...(config.includes ?? [])
  ];
  const artifact = `dnd5e-${argv.tag}.zip`;
  await passthrough("zip", [artifact, "-r", ...includes], { cwd: paths.dist });
  console.log(`Release artifact written to '${path.join(paths.dist, artifact)}'.`);
}

/* -------------------------------------------- */

(async function() {
  prepareDist();
  await checkout();
  await installDeps();
  compileManifest();
  copyImages();
  copyCompendiumContent();
  await build();
  await zip();
})();
