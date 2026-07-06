import path from "node:path";
import { spawnSync } from "node:child_process";

const SYSTEM_ROOT = path.resolve(path.join(import.meta.dirname, ".."));
const PACKS = ["items", "jutsus", "clan", "subclass"];

function runPowerShell(command) {
  return spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: SYSTEM_ROOT,
    encoding: "utf8",
    windowsHide: true
  });
}

function foundryProcesses() {
  const result = runPowerShell(
    "Get-Process | Where-Object { $_.ProcessName -like '*Foundry*' } | Select-Object -ExpandProperty Id"
  );
  if ( result.status !== 0 ) throw new Error(result.stderr || result.stdout);
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function nodeExecutable() {
  return process.execPath;
}

function rebuildPack(pack) {
  const result = spawnSync(nodeExecutable(), ["./utils/packs.mjs", "package", "pack", pack], {
    cwd: SYSTEM_ROOT,
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true
  });
  if ( result.status !== 0 ) throw new Error(`Failed to rebuild pack: ${pack}`);
}

function main() {
  const processes = foundryProcesses();
  if ( processes.length ) {
    console.error(`Foundry is still running (${processes.join(", ")}). Close Foundry before rebuilding packs.`);
    process.exitCode = 2;
    return;
  }

  for ( const pack of PACKS ) rebuildPack(pack);
  console.log(`Rebuilt packs: ${PACKS.join(", ")}`);
}

main();
