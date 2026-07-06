export const LEGACY_N5EB_SYSTEM_IDS = new Set(["n5eb", "n5e2"]);
export const LEGACY_N5EB_VERSION_CUTOFF = "3.0.0";
export const LEGACY_MIGRATION_REPORT_TITLE = "N5eB Legacy Migration Report";

const KNOWN_MAPPED_LEGACY_PATHS = {
  Actor: [
    /^attributes\.cp(?:\.|$)/,
    /^attributes\.senses\.chakrasight$/,
    /^resources\.chakradie(?:\.|$)/,
    /^resources\.(?:legact|legres)\.value$/,
    /^details\.(?:environment|npcType|rank|classNPC|role|highRole|clan|affiliation|source|spellLevel)(?:\.|$)/
  ],
  Item: [
    /^(?:hitDice|hitDiceUsed|chakraDice|chakraDiceUsed)$/,
    /^advancement(?:\.|$)/,
    /^components(?:\.|$)/,
    /^keywords(?:\.|$)/,
    /^chakraCost$/,
    /^chakraScaling(?:\.|$)/,
    /^spellcasting\.(?:ninjutsu|genjutsu|taijutsu)(?:\.|$)/,
    /^properties(?:\.|$)/
  ]
};

/**
 * Check whether a version predates the first v13-compatible N5eB line.
 * @param {string|undefined|null} version  Version to check.
 * @returns {boolean}
 */
export function isLegacyN5eBVersion(version) {
  if ( !version ) return false;
  return foundry.utils.isNewerVersion(LEGACY_N5EB_VERSION_CUTOFF, `${version}`);
}

/* -------------------------------------------- */

/**
 * Get legacy migration metadata for a document-like source.
 * @param {object} source      Candidate source data.
 * @param {object} [options]
 * @param {object} [options.parent]  Parent document source or document.
 * @returns {object}
 */
export function getLegacyN5eBSourceMetadata(source, { parent }={}) {
  const parentSource = parent?._source ?? parent;
  const sourceStats = source?._stats ?? {};
  const parentStats = parentSource?._stats ?? {};
  const world = globalThis.game?.world;
  const system = globalThis.game?.system;

  const sourceSystemId = sourceStats.systemId ?? parentStats.systemId ?? world?.system ?? system?.id ?? "n5eb";
  const sourceSystemVersion = sourceStats.systemVersion ?? parentStats.systemVersion ?? world?.systemVersion ?? "";
  const worldSystemId = world?.system ?? system?.id ?? sourceSystemId;
  const worldSystemVersion = world?.systemVersion ?? sourceSystemVersion;
  const hasLegacyId = LEGACY_N5EB_SYSTEM_IDS.has(sourceSystemId) || LEGACY_N5EB_SYSTEM_IDS.has(worldSystemId);
  const hasLegacyVersion = isLegacyN5eBVersion(sourceSystemVersion) || isLegacyN5eBVersion(worldSystemVersion);

  return {
    sourceSystemId,
    sourceSystemVersion,
    worldSystemId,
    worldSystemVersion,
    targetSystemId: system?.id ?? "n5eb",
    targetSystemVersion: system?.version ?? "",
    isLegacy: hasLegacyId && hasLegacyVersion
  };
}

/* -------------------------------------------- */

/**
 * Test whether a source should receive legacy N5eB migration safeguards.
 * @param {object} source      Candidate source data.
 * @param {object} [options]   Options forwarded to metadata detection.
 * @returns {boolean}
 */
export function isLegacyN5eBSource(source, options={}) {
  return getLegacyN5eBSourceMetadata(source, options).isLegacy;
}

/* -------------------------------------------- */

/**
 * Stable report identifier for the current world/system migration.
 * @returns {string}
 */
export function getLegacyMigrationReportId() {
  const worldId = globalThis.game?.world?.id ?? "world";
  const targetVersion = globalThis.game?.system?.version ?? "unknown";
  return `n5eb-legacy-${worldId}-${targetVersion}`;
}

/* -------------------------------------------- */

/**
 * Preserve original legacy system data before Foundry model cleanup can drop it.
 * @param {object} source                Candidate document source data.
 * @param {object} [options]
 * @param {string} [options.documentName]  Document class name for reporting.
 * @param {object} [options.parent]        Parent document source or document.
 * @returns {boolean}                    Whether preservation was applied or already present.
 */
export function preserveLegacyN5eBSource(source, { documentName="", parent }={}) {
  if ( !source?.system ) return false;
  const metadata = getLegacyN5eBSourceMetadata(source, { parent });
  if ( !metadata.isLegacy ) return false;

  source.flags ??= {};
  source.flags.n5eb ??= {};
  const existing = source.flags.n5eb.legacyMigration ?? {};
  source.flags.n5eb.legacyMigration = {
    ...existing,
    sourceSystemId: existing.sourceSystemId ?? metadata.sourceSystemId,
    sourceSystemVersion: existing.sourceSystemVersion ?? metadata.sourceSystemVersion,
    worldSystemId: existing.worldSystemId ?? metadata.worldSystemId,
    worldSystemVersion: existing.worldSystemVersion ?? metadata.worldSystemVersion,
    targetSystemId: existing.targetSystemId ?? metadata.targetSystemId,
    targetSystemVersion: existing.targetSystemVersion ?? metadata.targetSystemVersion,
    documentName: existing.documentName ?? documentName,
    reportId: existing.reportId ?? getLegacyMigrationReportId(),
    preservedAt: existing.preservedAt ?? new Date().toISOString(),
    originalSystem: existing.originalSystem ?? foundry.utils.deepClone(source.system)
  };
  source.flags.n5eb.persistSourceMigration = true;
  return true;
}

/* -------------------------------------------- */

/**
 * Collect original system paths that appear preserved but not represented by the current source or known mappers.
 * @param {object} documentData  Migrated document source data.
 * @param {object} updateData    Pending update data.
 * @param {string} documentName  Document class name.
 * @returns {string[]}
 */
export function collectUnmappedLegacyPaths(documentData, updateData={}, documentName="") {
  const original = foundry.utils.getProperty(documentData, "flags.n5eb.legacyMigration.originalSystem");
  if ( foundry.utils.getType(original) !== "Object" ) return [];
  const current = documentData.system ?? {};
  return collectLeafPaths(original)
    .filter(path => !foundry.utils.hasProperty(current, path))
    .filter(path => !hasUpdateForPath(updateData, `system.${path}`))
    .filter(path => !isKnownMappedLegacyPath(documentName, path))
    .sort();
}

/* -------------------------------------------- */

/**
 * Summarize a document for migration reports.
 * @param {object} documentData  Source data.
 * @param {string} documentName  Document class name.
 * @returns {object}
 */
export function summarizeLegacyDocument(documentData, documentName) {
  return {
    documentName,
    id: documentData._id ?? null,
    name: documentData.name ?? "",
    type: documentData.type ?? "",
    uuid: documentData.uuid ?? null,
    sourceSystemId: foundry.utils.getProperty(documentData, "flags.n5eb.legacyMigration.sourceSystemId")
      ?? documentData._stats?.systemId ?? "",
    sourceSystemVersion: foundry.utils.getProperty(documentData, "flags.n5eb.legacyMigration.sourceSystemVersion")
      ?? documentData._stats?.systemVersion ?? ""
  };
}

/* -------------------------------------------- */

/**
 * Collect leaf paths in a nested object.
 * @param {*} value          Value to inspect.
 * @param {string} [prefix]  Current path.
 * @returns {string[]}
 */
function collectLeafPaths(value, prefix="") {
  if ( Array.isArray(value) ) {
    if ( !value.length ) return prefix ? [prefix] : [];
    return value.flatMap((entry, i) => collectLeafPaths(entry, prefix ? `${prefix}.${i}` : `${i}`));
  }
  if ( !value || (typeof value !== "object") ) return prefix ? [prefix] : [];
  const entries = Object.entries(value);
  if ( !entries.length ) return prefix ? [prefix] : [];
  return entries.flatMap(([key, entry]) => collectLeafPaths(entry, prefix ? `${prefix}.${key}` : key));
}

/* -------------------------------------------- */

/**
 * Check whether an update object already targets a path.
 * @param {object} updateData  Pending update data.
 * @param {string} path        Dot path.
 * @returns {boolean}
 */
function hasUpdateForPath(updateData, path) {
  if ( Object.hasOwn(updateData, path) ) return true;
  const parts = path.split(".");
  for ( let i = parts.length; i > 1; i-- ) {
    const equalityPath = `${parts[0]}.==${parts.slice(1, i).join(".")}`;
    if ( Object.hasOwn(updateData, equalityPath) ) return true;
  }
  return foundry.utils.hasProperty(foundry.utils.expandObject(updateData), path);
}

/* -------------------------------------------- */

/**
 * Check whether a path is handled by a known legacy mapper.
 * @param {string} documentName  Document class name.
 * @param {string} path          Original system path.
 * @returns {boolean}
 */
function isKnownMappedLegacyPath(documentName, path) {
  return (KNOWN_MAPPED_LEGACY_PATHS[documentName] ?? []).some(re => re.test(path));
}
