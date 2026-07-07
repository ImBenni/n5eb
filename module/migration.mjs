import * as Conditions from "./conditions.mjs";
import { DEFAULT_CLASSMOD_ARTS_COLOR } from "./classmod-arts.mjs";
import {
  collectUnmappedLegacyPaths, getLegacyMigrationReportId, getLegacyN5eBSourceMetadata, isLegacyN5eBSource,
  isLegacyN5eBVersion, LEGACY_MIGRATION_REPORT_TITLE, summarizeLegacyDocument
} from "./legacy-migration.mjs";
import * as Seals from "./seals.mjs";
import { formatIdentifier, log } from "./utils.mjs";

const LEGACY_CURRENCY_CONVERSIONS = {
  pp: 0.1,
  gp: 1,
  ep: 2,
  sp: 10,
  cp: 100
};

const LEGACY_CURRENCY_KEYS = Object.keys(LEGACY_CURRENCY_CONVERSIONS);
const LEGACY_PACK_UUID_RE = new RegExp(
  "Compendium\\.n5eb\\.(?:n5eb-actors|n5eb-classes|n5eb-origins|n5eb-equipment|"
    + "n5eb-jutsu|n5eb-features|n5eb-rules)\\.(?:Actor|Item|JournalEntry)\\.[A-Za-z0-9]{16}",
  "g"
);
const N5EB_EQUIPMENT_PACK_ALIAS_UUID_RE =
  /Compendium\.n5eb\.(?:items|n5eb-equipment)\.Item\.(?:n5ebCaptPack0010|n5ebExplPack0010|n5ebTravPack0010)/g;
const N5EB_ASSET_REFERENCE_RE =
  /(?:(?:systems\/n5eb\/)?assets|worlds\/[^"'<>]*?\/assets\/(?:items|actors|pages))[^"'<>]*?\.(?:png|jpe?g|webp)/gi;
const N5EB_BOOK_PARITY_FIX_VERSION = "5.3.10";

const N5EB_AFFINITY_KEYS = new Set(["fire", "water", "wind", "earth", "lightning", "medical"]);

const LEGACY_DELETION_KEY_CLEANUP_SETTING = "legacyDeletionKeyCleanupVersion";
const LEGACY_REPORT_LIMIT = 500;
const LEGACY_UNMAPPED_PATH_SCAN_LIMIT = 2000;
const MIGRATION_PROGRESS_YIELD_INTERVAL = 25;
const LEGACY_MIGRATION_I18N = {
  BackupAck: "I have made or confirmed a backup of this world before migrating.",
  Cancelled: "N5eB legacy migration paused. A GM must confirm the backup acknowledgement before migration continues.",
  Confirm: "Confirm and Migrate",
  PromptActors: "World actors: {count}",
  PromptBody: "{world} appears to use legacy N5eB data from version {version}. This migration will preserve original actor and item system data before converting it. Make a Foundry/world backup before continuing.",
  PromptItems: "World items: {count}",
  PromptPacks: "World compendium packs: {count}",
  PromptTitle: "N5eB Legacy Migration",
  RequiresConfirmation: "N5eB legacy migration requires GM backup confirmation. Use game.dnd5e.migrations.runLegacyMigration({ confirmed: true }) after confirming a backup."
};

/* -------------------------------------------- */

/**
 * Get the target version that should be stored once system migration has completed.
 * @returns {string}
 */
export function getTargetMigrationVersion() {
  return game.system.flags?.needsMigrationVersion ?? game.system.version;
}

/* -------------------------------------------- */

/**
 * Remove persisted legacy forced-deletion keys that Foundry v14 warns about while loading world data.
 * @param {object} [options]
 * @param {string} [options.version]  Target cleanup version.
 * @param {boolean} [options.force]   Force cleanup even if already marked complete.
 * @returns {Promise<object>}         Summary of updated documents.
 */
export async function cleanLegacyDeletionKeys({ version=getTargetMigrationVersion(), force=false }={}) {
  if ( !game.user.isGM ) return { skipped: true, reason: "not-gm" };

  const current = game.settings.get("n5eb", LEGACY_DELETION_KEY_CLEANUP_SETTING);
  if ( !force && current && !foundry.utils.isNewerVersion(version, current) ) {
    return { skipped: true, version: current };
  }

  if ( !foundry.data?.operators?.ForcedReplacement?.create ) {
    return { skipped: true, reason: "missing-forced-replacement" };
  }

  const summary = {
    actors: 0,
    actorItems: 0,
    actorEffects: 0,
    actorItemEffects: 0,
    items: 0,
    itemEffects: 0,
    errors: []
  };

  const run = async (label, fn) => {
    try {
      await fn();
    } catch(err) {
      err.message = `Failed legacy deletion key cleanup for ${label}: ${err.message}`;
      console.error(err);
      summary.errors.push({ label, message: err.message });
    }
  };

  for ( const actor of game.actors ) {
    await run(`Actor ${actor.name}`, async () => {
      if ( await _cleanLegacyDeletionKeysForDocument(actor) ) summary.actors++;
      summary.actorEffects += await _cleanLegacyDeletionKeysForEmbedded(actor, "ActiveEffect", actor.effects);
      summary.actorItems += await _cleanLegacyDeletionKeysForEmbedded(actor, "Item", actor.items);
      for ( const item of actor.items ) {
        summary.actorItemEffects += await _cleanLegacyDeletionKeysForEmbedded(item, "ActiveEffect", item.effects);
      }
    });
  }

  for ( const item of game.items ) {
    await run(`Item ${item.name}`, async () => {
      if ( await _cleanLegacyDeletionKeysForDocument(item) ) summary.items++;
      summary.itemEffects += await _cleanLegacyDeletionKeysForEmbedded(item, "ActiveEffect", item.effects);
    });
  }

  if ( summary.errors.length ) return summary;

  await game.settings.set("n5eb", LEGACY_DELETION_KEY_CLEANUP_SETTING, version);
  const total = summary.actors + summary.actorItems + summary.actorEffects
    + summary.actorItemEffects + summary.items + summary.itemEffects;
  if ( total ) log(`Cleaned legacy deletion keys from ${total} N5eB world documents.`);
  return summary;
}

/* -------------------------------------------- */

/**
 * Preview whether the current world needs the guarded legacy N5eB migration path.
 * @returns {object}
 */
export function previewLegacyMigration() {
  const currentVersion = _getCurrentMigrationVersion();
  const worldSource = {
    _stats: {
      systemId: game.world.system ?? game.system.id,
      systemVersion: currentVersion || game.world.systemVersion
    }
  };
  const worldMetadata = getLegacyN5eBSourceMetadata(worldSource);
  const packs = game.packs.filter(_shouldMigrateCompendium);
  const worldPacks = packs.filter(p => p.metadata.packageType === "world");

  const counts = {
    actors: game.actors.size,
    items: game.items.size,
    scenes: game.scenes.size,
    macros: game.macros.size,
    messages: game.messages.size,
    tables: game.tables.size,
    actorDeltas: game.scenes.reduce((total, scene) => {
      return total + scene.tokens.filter(t => !t.actorLink && t.actor).length;
    }, 0),
    worldPacks: worldPacks.length,
    worldPackDocuments: worldPacks.reduce((total, pack) => total + pack.index.size, 0),
    legacyActors: _countLegacyDocuments(game.actors),
    legacyItems: _countLegacyDocuments(game.items),
    legacyActorDeltas: _countLegacyActorDeltas(),
    invalidActors: game.actors.invalidDocumentIds?.size ?? 0,
    invalidItems: game.items.invalidDocumentIds?.size ?? 0
  };
  counts.totalDocuments = counts.actors + counts.items + counts.scenes + counts.macros + counts.messages + counts.tables
    + counts.actorDeltas + counts.worldPackDocuments;
  counts.legacyDocuments = counts.legacyActors + counts.legacyItems + counts.legacyActorDeltas;

  const required = worldMetadata.isLegacy || counts.legacyDocuments > 0
    || (Boolean(currentVersion) && isLegacyN5eBVersion(currentVersion));
  return {
    required,
    reportId: getLegacyMigrationReportId(),
    generatedAt: new Date().toISOString(),
    world: {
      id: game.world.id,
      title: game.world.title,
      system: game.world.system,
      systemVersion: game.world.systemVersion,
      migrationVersion: currentVersion
    },
    target: {
      system: game.system.id,
      version: getTargetMigrationVersion()
    },
    counts,
    migratedWorldPacks: worldPacks.map(pack => pack.collection)
  };
}

/* -------------------------------------------- */

/**
 * Prompt the GM to confirm a guarded legacy migration.
 * @param {object} [preview]  Preview data from {@link previewLegacyMigration}.
 * @returns {Promise<object|undefined>}
 */
export async function promptLegacyMigration(preview=previewLegacyMigration()) {
  if ( !preview.required || !game.user.isGM ) return preview;
  const promptVersion = foundry.utils.escapeHTML(
    preview.world.migrationVersion || preview.world.systemVersion || "unknown"
  );
  const promptWorld = foundry.utils.escapeHTML(game.world.title);
  const promptBody = _legacyMigrationText("PromptBody", {
    world: promptWorld,
    version: promptVersion
  });
  const content = `
    <form class="n5eb legacy-migration">
      <p>${promptBody}</p>
      <ul>
        <li>${_legacyMigrationText("PromptActors", { count: preview.counts.actors })}</li>
        <li>${_legacyMigrationText("PromptItems", { count: preview.counts.items })}</li>
        <li>${_legacyMigrationText("PromptPacks", { count: preview.counts.worldPacks })}</li>
      </ul>
      <label class="checkbox">
        <input type="checkbox" name="backup">
        <span>${_legacyMigrationText("BackupAck")}</span>
      </label>
    </form>`;
  const confirmed = await foundry.applications.api.Dialog.prompt({
    window: { title: _legacyMigrationText("PromptTitle") },
    content,
    ok: {
      label: _legacyMigrationText("Confirm"),
      callback: (event, button) => button.form.elements.backup.checked
    },
    rejectClose: false
  });
  if ( !confirmed ) {
    ui.notifications.warn(_legacyMigrationText("Cancelled"), { permanent: true });
    return preview;
  }
  await game.settings.set("n5eb", "legacyMigrationConfirmed", true);
  return runLegacyMigration({ confirmed: true, preview });
}

/* -------------------------------------------- */

/**
 * Localize legacy migration prompt text, falling back to English when translations are unavailable during startup.
 * @param {string} key       Legacy migration localization key suffix.
 * @param {object} [data]    Formatting data.
 * @returns {string}
 * @private
 */
function _legacyMigrationText(key, data={}) {
  const localizationKey = `N5EB.LegacyMigration.${key}`;
  const localized = game.i18n.localize(localizationKey);
  const template = (localized && (localized !== localizationKey))
    ? localized
    : (LEGACY_MIGRATION_I18N[key] ?? localizationKey);
  return template.replaceAll(/\{([^}]+)\}/g, (match, property) => {
    return Object.hasOwn(data, property) ? data[property] : match;
  });
}

/* -------------------------------------------- */

/**
 * Run the guarded legacy migration after explicit GM confirmation.
 * @param {object} [options={}]
 * @param {boolean} [options.confirmed=false]  Explicit confirmation from the caller.
 * @param {object} [options.preview]           Previously generated preview.
 * @returns {Promise<object>}
 */
export async function runLegacyMigration({ confirmed=false, preview }={}) {
  if ( !game.user.isGM ) throw new Error("Only a GM can run N5eB legacy migration.");
  const settingConfirmed = game.settings.get("n5eb", "legacyMigrationConfirmed");
  if ( !confirmed && !settingConfirmed ) {
    ui.notifications.error(_legacyMigrationText("RequiresConfirmation"), { permanent: true });
    return previewLegacyMigration();
  }
  await game.settings.set("n5eb", "legacyMigrationConfirmed", true);
  preview ??= previewLegacyMigration();
  const report = _createLegacyMigrationReport(preview);
  await migrateWorld({ bypassVersionCheck: true, legacyReport: report });
  return game.settings.get("n5eb", "legacyMigrationReport");
}

/* -------------------------------------------- */

/**
 * Create an empty legacy migration report.
 * @param {object} preview  Preview data.
 * @returns {object}
 * @private
 */
function _createLegacyMigrationReport(preview) {
  return {
    reportId: preview.reportId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    world: preview.world,
    target: preview.target,
    counts: {
      ...preview.counts,
      migratedDocuments: 0,
      preservedLegacySnapshots: 0,
      unmappedPaths: 0,
      errors: 0,
      warnings: 0
    },
    migratedWorldPacks: preview.migratedWorldPacks,
    preservedLegacySnapshots: [],
    unmappedPaths: [],
    errors: [],
    warnings: [],
    finalMigrationVersion: null,
    success: false
  };
}

/* -------------------------------------------- */

/**
 * Get the best available world migration source version.
 * @returns {string}
 * @private
 */
function _getCurrentMigrationVersion() {
  return game.settings.get("n5eb", "systemMigrationVersion") || game.world.flags.n5eb?.version
    || game.world.systemVersion || "";
}

/* -------------------------------------------- */

/**
 * Count documents whose source still looks like legacy N5eB data.
 * @param {Collection} collection  Document collection.
 * @returns {number}
 * @private
 */
function _countLegacyDocuments(collection) {
  return collection.reduce((total, document) => total + (isLegacyN5eBSource(_getDocumentSource(document)) ? 1 : 0), 0);
}

/* -------------------------------------------- */

/**
 * Count unlinked token actor deltas that still look like legacy N5eB data.
 * @returns {number}
 * @private
 */
function _countLegacyActorDeltas() {
  return game.scenes.reduce((total, scene) => total + scene.tokens.reduce((subtotal, token) => {
    if ( token.actorLink || !token.actor ) return subtotal;
    return subtotal + (isLegacyN5eBSource(_getDocumentSource(token.actor)) ? 1 : 0);
  }, 0), 0);
}

/* -------------------------------------------- */

/**
 * Get raw source for a document-like object.
 * @param {Document|object} document  Document or source.
 * @returns {object}
 * @private
 */
function _getDocumentSource(document) {
  return document?._source ?? document?.toObject?.() ?? document;
}

/* -------------------------------------------- */

/**
 * Record the migration result for one document in a legacy report.
 * @param {object} report            Legacy report object.
 * @param {object} documentData      Document source data.
 * @param {string} documentName      Document class name.
 * @param {object} [updateData={}]   Update data generated for this document.
 * @param {object} [options={}]
 * @param {string} [options.pack]    Compendium pack collection.
 * @param {string} [options.parent]  Parent document label for embedded documents.
 * @private
 */
function _recordLegacyReportDocument(report, documentData, documentName, updateData={}, { pack="", parent="" }={}) {
  if ( !report || !documentData ) return;
  if ( !foundry.utils.isEmpty(updateData) ) report.counts.migratedDocuments++;

  const documentKey = [
    pack || "world", parent || "", documentName, documentData.uuid || documentData._id || documentData.name || ""
  ].join(".");
  const legacyMigration = foundry.utils.getProperty(documentData, "flags.n5eb.legacyMigration");
  if ( legacyMigration?.originalSystem ) {
    report._seenPreserved ??= new Set();
    if ( !report._seenPreserved.has(documentKey) ) {
      report._seenPreserved.add(documentKey);
      report.counts.preservedLegacySnapshots++;
      if ( report.preservedLegacySnapshots.length < LEGACY_REPORT_LIMIT ) {
        report.preservedLegacySnapshots.push({
          ...summarizeLegacyDocument(documentData, documentName),
          pack,
          parent,
          preservedPath: "flags.n5eb.legacyMigration.originalSystem"
        });
      }
    }
  }

  const reportDocumentName = documentName === "ActorDelta" ? "Actor" : documentName;
  if ( report.counts.unmappedPaths >= LEGACY_REPORT_LIMIT ) return;
  const unmappedPaths = collectUnmappedLegacyPaths(documentData, updateData, reportDocumentName, {
    scanLimit: LEGACY_UNMAPPED_PATH_SCAN_LIMIT
  });
  for ( const path of unmappedPaths ) {
    report._seenUnmapped ??= new Set();
    const pathKey = `${documentKey}.${path}`;
    if ( report._seenUnmapped.has(pathKey) ) continue;
    report._seenUnmapped.add(pathKey);
    report.counts.unmappedPaths++;
    if ( report.unmappedPaths.length < LEGACY_REPORT_LIMIT ) {
      report.unmappedPaths.push({
        documentName,
        id: documentData._id ?? "",
        name: documentData.name ?? "",
        type: documentData.type ?? "",
        pack,
        parent,
        path: `system.${path}`
      });
    }
  }
}

/* -------------------------------------------- */

/**
 * Record a migration error in a legacy report.
 * @param {object} report        Legacy report object.
 * @param {Error} err            Error thrown while migrating.
 * @param {string} documentName  Document class name.
 * @param {string} name          Document name or identifier.
 * @private
 */
function _recordLegacyReportError(report, err, documentName, name) {
  if ( !report ) return;
  report.counts.errors++;
  if ( report.errors.length >= LEGACY_REPORT_LIMIT ) return;
  report.errors.push({
    documentName,
    name: `${name ?? ""}`,
    message: err.message,
    stack: err.stack ?? ""
  });
}

/* -------------------------------------------- */

/**
 * Finalize, persist, and write the visible Journal report for a legacy migration.
 * @param {object} report             Legacy report object.
 * @param {object} [options={}]
 * @param {boolean} [options.hasErrors=false]  Whether the migration encountered errors.
 * @returns {Promise<void>}
 * @private
 */
async function _finalizeLegacyMigrationReport(report, { hasErrors=false }={}) {
  if ( !report ) return;
  report.completedAt = new Date().toISOString();
  report.finalMigrationVersion = getTargetMigrationVersion();
  report.success = !hasErrors;
  delete report._seenPreserved;
  delete report._seenUnmapped;

  await game.settings.set("n5eb", "legacyMigrationReport", report);

  try {
    await _upsertLegacyMigrationJournal(report);
  } catch(err) {
    console.warn(`Failed to write ${LEGACY_MIGRATION_REPORT_TITLE}`, err);
    report.counts.warnings++;
    if ( report.warnings.length < LEGACY_REPORT_LIMIT ) {
      report.warnings.push({
        message: `Could not create or update the Journal report: ${err.message}`,
        stack: err.stack ?? ""
      });
    }
    await game.settings.set("n5eb", "legacyMigrationReport", report);
  }
}

/* -------------------------------------------- */

/**
 * Create or update the visible Journal entry for a legacy migration report.
 * @param {object} report  Legacy report object.
 * @returns {Promise<JournalEntry>}
 * @private
 */
async function _upsertLegacyMigrationJournal(report) {
  const content = _renderLegacyMigrationReport(report);
  const pageData = {
    name: "Report",
    type: "text",
    text: {
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1,
      content
    }
  };
  const journal = game.journal.find(entry =>
    (entry.getFlag("n5eb", "legacyMigrationReport") === report.reportId)
    || (entry.name === LEGACY_MIGRATION_REPORT_TITLE)
  );

  if ( !journal ) {
    return JournalEntry.create({
      name: LEGACY_MIGRATION_REPORT_TITLE,
      flags: { n5eb: { legacyMigrationReport: report.reportId } },
      pages: [pageData]
    });
  }

  await journal.update({ "flags.n5eb.legacyMigrationReport": report.reportId });
  const page = journal.pages.find(p => p.name === "Report");
  if ( page ) await page.update({ text: pageData.text });
  else await journal.createEmbeddedDocuments("JournalEntryPage", [pageData]);
  return journal;
}

/* -------------------------------------------- */

/**
 * Render the legacy migration report as Journal HTML.
 * @param {object} report  Legacy report object.
 * @returns {string}
 * @private
 */
function _renderLegacyMigrationReport(report) {
  const esc = value => foundry.utils.escapeHTML(`${value ?? ""}`);
  const countRows = Object.entries(report.counts).map(([key, value]) =>
    `<tr><th>${esc(_titleCaseKey(key))}</th><td>${esc(value)}</td></tr>`
  ).join("");
  const packs = report.migratedWorldPacks.length
    ? report.migratedWorldPacks.map(pack => `<li>${esc(pack)}</li>`).join("")
    : "<li>None</li>";
  const snapshots = report.preservedLegacySnapshots.slice(0, 50).map(snapshot =>
    `<li>${esc(snapshot.pack ? `${snapshot.pack}: ` : "")}${esc(snapshot.documentName)}`
    + ` ${esc(snapshot.name || snapshot.id)}`
    + ` (${esc(snapshot.preservedPath)})</li>`
  ).join("") || "<li>None</li>";
  const unmapped = report.unmappedPaths.slice(0, 100).map(entry =>
    `<li>${esc(entry.pack ? `${entry.pack}: ` : "")}${esc(entry.documentName)}`
    + ` ${esc(entry.name || entry.id)}: <code>${esc(entry.path)}</code></li>`
  ).join("") || "<li>None</li>";
  const errors = report.errors.slice(0, 50).map(error =>
    `<li>${esc(error.documentName)} ${esc(error.name)}: ${esc(error.message)}</li>`
  ).join("") || "<li>None</li>";
  const warnings = report.warnings.slice(0, 50).map(warning =>
    `<li>${esc(warning.message)}</li>`
  ).join("") || "<li>None</li>";

  return `
    <h1>${esc(LEGACY_MIGRATION_REPORT_TITLE)}</h1>
    <p><strong>World:</strong> ${esc(report.world.title)} (${esc(report.world.id)})</p>
    <p><strong>Source:</strong> ${esc(report.world.system || "unknown")}
      ${esc(report.world.migrationVersion || report.world.systemVersion || "unknown")}</p>
    <p><strong>Target:</strong> ${esc(report.target.system)} ${esc(report.finalMigrationVersion)}</p>
    <p><strong>Status:</strong> ${report.success ? "Completed" : "Completed with errors"}</p>
    <p><strong>Started:</strong> ${esc(report.startedAt)}<br><strong>Completed:</strong> ${esc(report.completedAt)}</p>
    <h2>Counts</h2>
    <table><tbody>${countRows}</tbody></table>
    <h2>Migrated World Packs</h2>
    <ul>${packs}</ul>
    <h2>Preserved Legacy Snapshots</h2>
    <p>Original legacy system data is stored at
      <code>flags.n5eb.legacyMigration.originalSystem</code> on migrated actor and item documents.</p>
    <ul>${snapshots}</ul>
    <h2>Unmapped Preserved Paths</h2>
    <ul>${unmapped}</ul>
    <h2>Warnings</h2>
    <ul>${warnings}</ul>
    <h2>Errors</h2>
    <ul>${errors}</ul>`;
}

/* -------------------------------------------- */

/**
 * Convert a camelCase report key to a display label.
 * @param {string} key  Report key.
 * @returns {string}
 * @private
 */
function _titleCaseKey(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
}

/* -------------------------------------------- */

const N5EB_DAMAGE_TYPE_MIGRATIONS = {
  radiant: "lightning",
  thunder: "force",
  none: null
};

const N5EB_CLAN_FEATURE_SUBTYPE_MIGRATIONS = {
  adaption: "adaptation"
};

const N5EB_OFFICIAL_CLAN_SOURCE_BOOKS = new Set([
  "Naruto 5e",
  "Tsunade's Studies Compendium"
]);

const N5EB_BACKGROUND_SOURCE_BOOK_MIGRATIONS = {
  "Naruto 5e - Full Document": "Naruto 5e",
  "Naruto 5e Full Document": "Naruto 5e",
  "Sakura's Notes of Shinobi Legacy": "Team 7",
  "Team 7 ~ Sakura's Notes of Shinobi Legacy": "Team 7",
  "Team 7: Sakura's Notes of Shinobi Legacy": "Team 7"
};

const N5EB_BACKGROUND_TEXT_REPLACEMENTS = [
  [/\bBulter\b/g, "Butler"],
  [/\bbulter\b/g, "butler"],
  [/\bThreat Assesment\b/g, "Threat Assessment"],
  [/\bThreat assesment\b/g, "Threat assessment"],
  [/\bthreat assesment\b/g, "threat assessment"],
  [/\bthreat-assesment\b/g, "threat-assessment"]
];

const N5EB_T7_DASOMIA_REPLACEMENTS = [
  [/\bDosamia\b/g, "Dasomia"],
  [/\bDesomia\b/g, "Dasomia"],
  [/\bdosamia\b/g, "dasomia"],
  [/\bdesomia\b/g, "dasomia"]
];

const N5EB_KIT_BASE_ITEM_MIGRATIONS = {
  alchemist: "alchemistKit",
  antidote: "antidoteKit",
  armorsmith: "armorsmithKit",
  climbers: "climbersKit",
  "climber-s-kit": "climbersKit",
  cooking: "cookingKit",
  cook: "cookingKit",
  demolitions: "demolitionsKit",
  disguise: "disguiseKit",
  disg: "disguiseKit",
  "first-aid": "firstAidKit",
  firstaid: "firstAidKit",
  fishing: "fishingKit",
  forensics: "forensicsKit",
  forgery: "forgeryKit",
  forg: "forgeryKit",
  hackers: "hackersKit",
  herb: "medicineKit",
  medicine: "medicineKit",
  poison: "poisonKit",
  pois: "poisonKit",
  security: "securityKit",
  smith: "weaponsmithKit",
  thief: "securityKit",
  trappers: "trappersKit",
  weaponsmith: "weaponsmithKit"
};

const N5EB_KIT_IDENTIFIER_BASE_ITEMS = {
  "alchemist-kit": "alchemistKit",
  "antidote-kit": "antidoteKit",
  "armorsmith-kit": "armorsmithKit",
  "climber-s-kit": "climbersKit",
  "climbers-kit": "climbersKit",
  "cooking-kit": "cookingKit",
  "demolitions-kit": "demolitionsKit",
  "disguise-kit": "disguiseKit",
  "first-aid-kit": "firstAidKit",
  "fishing-kit": "fishingKit",
  "forensics-kit": "forensicsKit",
  "forgery-kit": "forgeryKit",
  "hackers-kit": "hackersKit",
  "medicine-kit": "medicineKit",
  "poison-kit": "poisonKit",
  "security-kit": "securityKit",
  "trappers-kit": "trappersKit",
  "weaponsmith-kit": "weaponsmithKit"
};

const N5EB_KIT_BASE_ITEMS = new Set(Object.values(N5EB_KIT_IDENTIFIER_BASE_ITEMS));
const N5EB_KIT_QUALITY_RE = /^(?:standard|enhanced|greater|superior|supreme)-/;
const N5EB_OBSOLETE_TOOL_KEYS = new Set([
  "game",
  "music",
  "vehicle",
  "bagpipes",
  "card",
  "chess",
  "dice",
  "drum",
  "dulcimer",
  "flute",
  "horn",
  "lute",
  "lyre",
  "panflute",
  "shawm",
  "viol",
  "brewer",
  "calligrapher",
  "carpenter",
  "cartographer",
  "cobbler",
  "glassblower",
  "jeweler",
  "leatherworker",
  "mason",
  "navg",
  "painter",
  "potter",
  "tinker",
  "weaver",
  "woodcarver",
  "air",
  "land",
  "space",
  "water"
]);

const N5EB_EQUIPMENT_PACK_ALIASES = {
  n5ebCaptPack0010: {
    canonicalUuid: "Compendium.n5eb.items.Item.w9c99eBUF9c3P03a",
    identifier: "captain-s-pack",
    oldIdentifiers: ["captains-pack"],
    oldIds: ["n5ebCaptPack0010"]
  },
  n5ebExplPack0010: {
    canonicalUuid: "Compendium.n5eb.items.Item.3pAJEFEnaOt9DOK7",
    identifier: "explorer-s-pack",
    oldIdentifiers: ["explorers-pack"],
    oldIds: ["n5ebExplPack0010"]
  },
  n5ebTravPack0010: {
    canonicalUuid: "Compendium.n5eb.items.Item.qo0Gcg4dEicHHBMm",
    identifier: "traveler-s-pack",
    oldIdentifiers: ["travelers-pack"],
    oldIds: ["n5ebTravPack0010"]
  }
};

const N5EB_CONTAINER_ITEM_MIGRATIONS = {
  "shinobi-backpack": { capacity: { weight: { value: 10, units: "bulk" } }, currency: 0 },
  "shinobi-waist-bag": { capacity: { weight: { value: 5, units: "bulk" } }, currency: 0 },
  "shinobi-belt-pouch": { capacity: { weight: { value: 3, units: "bulk" } }, currency: 0 },
  "shinobi-leg-pouch": { capacity: { weight: { value: 2, units: "bulk" } }, currency: 0 },
  "captains-pack": {
    capacity: { weight: { value: 5, units: "bulk" } },
    currency: 0,
    properties: ["weightlessContents"]
  },
  "explorers-pack": {
    capacity: { weight: { value: 5, units: "bulk" } },
    currency: 0,
    properties: ["weightlessContents"]
  },
  "travelers-pack": {
    capacity: { weight: { value: 5, units: "bulk" } },
    currency: 0,
    properties: ["weightlessContents"]
  },
  wallet: { capacity: { weight: { value: 0, units: "bulk" } }, currency: 0 },
  "wallet-100-ryo": { capacity: { weight: { value: 0, units: "bulk" } }, currency: 100 },
  thermos: { capacity: { count: 1 }, currency: 0 },
  "ration-case": { capacity: { count: 1 }, currency: 0 }
};

const N5EB_CONTAINER_STALE_SYSTEM_KEYS = [
  "activities", "armor", "cover", "crewed", "hp", "proficient", "speed", "strength", "type", "uses"
];

/**
 * Perform a system migration for the entire World, applying migrations for Actors, Items, and Compendium packs.
 * @param {object} [options={}]
 * @param {boolean} [options.bypassVersionCheck=false]  Bypass certain migration restrictions gated behind system
 *                                                      version stored in item stats.
 * @param {object} [options.legacyReport]  Report object for guarded legacy migrations.
 * @returns {Promise}      A Promise which resolves once the migration is completed
 */
export async function migrateWorld({ bypassVersionCheck=false, legacyReport }={}) {
  const version = getTargetMigrationVersion();
  const progress = ui.notifications.info("MIGRATION.5eBegin", {
    console: false, format: { version }, permanent: true, progress: true
  });
  const { packs, packDocuments } = game.packs.reduce((obj, pack) => {
    if ( _shouldMigrateCompendium(pack) ) {
      obj.packs.push(pack);
      obj.packDocuments += pack.index.size;
    }
    return obj;
  }, { packs: [], packDocuments: 0 });
  const totalDocuments = Math.max(1, game.actors.size + game.items.size + game.macros.size + game.messages.size
    + game.tables.size + game.scenes.size
    + game.scenes.reduce((total, s) => total + s.tokens.size, 0) + packDocuments);
  let migrated = 0;
  let progressUpdatesSinceYield = 0;
  const incrementProgress = async () => {
    migrated++;
    progressUpdatesSinceYield++;
    progress.update({ pct: Math.min(migrated / totalDocuments, 0.99) });
    if ( progressUpdatesSinceYield < MIGRATION_PROGRESS_YIELD_INTERVAL ) return;
    progressUpdatesSinceYield = 0;
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  const migrationData = await getMigrationData();
  await migrateSettings();
  let hasErrors = false;
  const logError = (err, type, name) => {
    err.message = `Failed dnd5e system migration for ${type} ${name}: ${err.message}`;
    console.error(err);
    _recordLegacyReportError(legacyReport, err, type, name);
    hasErrors = true;
  };

  // Migrate World Actors
  const actors = game.actors.map(a => [a, true])
    .concat(Array.from(game.actors.invalidDocumentIds).map(id => [game.actors.getInvalid(id), false]));
  for ( const [actor, valid] of actors ) {
    let source;
    let updateData = {};
    try {
      const flags = { bypassVersionCheck, persistSourceMigration: false, legacyReport };
      source = valid ? actor.toObject() : game.data.actors.find(a => a._id === actor.id);
      const version = actor._stats.systemVersion;
      updateData = migrateActorData(actor, source, migrationData, flags, { actorUuid: actor.uuid });
      if ( !foundry.utils.isEmpty(updateData) ) {
        log(`Migrating Actor document ${actor.name}`);
        if ( flags.persistSourceMigration ) {
          updateData = foundry.utils.mergeObject(source, updateData, {inplace: false});
        }
        await actor.update(updateData, {
          enforceTypes: false, diff: valid && !flags.persistSourceMigration,
          recursive: !flags.persistSourceMigration, render: false
        });
      }
      _recordLegacyReportDocument(legacyReport, source, "Actor", updateData);
      if ( actor.effects && actor.items && foundry.utils.isNewerVersion("3.0.3", version) ) {
        const deleteIds = _duplicatedEffects(actor);
        if ( deleteIds.size ) await actor.deleteEmbeddedDocuments("ActiveEffect", Array.from(deleteIds), {
          render: false
        });
      }
    } catch(err) {
      logError(err, "Actor", actor.name);
    }
    await incrementProgress();
  }

  // Migrate World Items
  const items = game.items.map(i => [i, true])
    .concat(Array.from(game.items.invalidDocumentIds).map(id => [game.items.getInvalid(id), false]));
  const mergeOptions = game.release.generation > 13
    ? { inplace: false, applyOperators: true }
    : { inplace: false, performDeletions: true };
  for ( const [item, valid] of items ) {
    let source;
    let updateData = {};
    try {
      const flags = { bypassVersionCheck, persistSourceMigration: false, legacyReport };
      source = valid ? item.toObject() : game.data.items.find(i => i._id === item.id);
      updateData = migrateItemData(item, source, migrationData, flags);
      if ( !foundry.utils.isEmpty(updateData) ) {
        log(`Migrating Item document ${item.name}`);
        if ( flags.persistSourceMigration ) {
          if ( "effects" in updateData ) updateData.effects = source.effects.map(effect => foundry.utils.mergeObject(
            effect, updateData.effects.find(e => e._id === effect._id) ?? {}, mergeOptions
          ));
          updateData = foundry.utils.mergeObject(source, updateData, mergeOptions);
        }
        await item.update(updateData, {
          enforceTypes: false, diff: valid && !flags.persistSourceMigration,
          recursive: !flags.persistSourceMigration, render: false
        });
      }
      _recordLegacyReportDocument(legacyReport, source, "Item", updateData);
    } catch(err) {
      logError(err, "Item", item.name);
    }
    await incrementProgress();
  }

  // Migrate World Macros
  for ( const m of game.macros ) {
    try {
      const updateData = migrateMacroData(m.toObject(), migrationData);
      if ( !foundry.utils.isEmpty(updateData) ) {
        log(`Migrating Macro document ${m.name}`);
        await m.update(updateData, {enforceTypes: false, render: false});
      }
      _recordLegacyReportDocument(legacyReport, m.toObject(), "Macro", updateData);
    } catch(err) {
      logError(err, "Macro", m.name);
    }
    await incrementProgress();
  }

  // Migrate World Messages
  for ( const m of game.messages ) {
    try {
      const updateData = migrateMessageData(m.toObject(), migrationData);
      if ( !foundry.utils.isEmpty(updateData) ) {
        log(`Migrating Message document ${m.id}`);
        await m.update(updateData, { enforceTypes: false, render: false });
      }
      _recordLegacyReportDocument(legacyReport, m.toObject(), "ChatMessage", updateData);
    } catch(err) {
      err.message = `Failed dnd5e system migration for Message ${m.id}: ${err.message}`;
      console.error(err);
      _recordLegacyReportError(legacyReport, err, "Message", m.id);
    }
    await incrementProgress();
  }

  // Migrate World Roll Tables
  for ( const table of game.tables ) {
    try {
      const updateData = migrateRollTableData(table.toObject(), migrationData);
      if ( !foundry.utils.isEmpty(updateData) ) {
        log(`Migrating RollTable document ${table.name}`);
        await table.update(updateData, { enforceTypes: false, render: false });
      }
      _recordLegacyReportDocument(legacyReport, table.toObject(), "RollTable", updateData);
    } catch(err) {
      logError(err, "RollTable", table.name);
    }
    await incrementProgress();
  }

  // Migrate Actor Override Tokens
  for ( const s of game.scenes ) {
    try {
      const updateData = migrateSceneData(s, migrationData);
      if ( !foundry.utils.isEmpty(updateData) ) {
        log(`Migrating Scene document ${s.name}`);
        await s.update(updateData, {enforceTypes: false, render: false});
      }
      _recordLegacyReportDocument(legacyReport, s.toObject(), "Scene", updateData);
    } catch(err) {
      logError(err, "Scene", s.name);
    }
    await incrementProgress();

    // Migrate ActorDeltas individually in order to avoid issues with ActorDelta bulk updates.
    for ( const token of s.tokens ) {
      if ( token.actorLink || !token.actor ) {
        await incrementProgress();
        continue;
      }
      let source;
      let updateData = {};
      try {
        const flags = { bypassVersionCheck, persistSourceMigration: false, legacyReport };
        source = token.actor.toObject();
        updateData = migrateActorData(token.actor, source, migrationData, flags, { actorUuid: token.actor.uuid });
        if ( !foundry.utils.isEmpty(updateData) ) {
          log(`Migrating ActorDelta document ${token.actor.name} [${token.delta.id}] in Scene ${s.name}`);
          if ( flags.persistSourceMigration ) {
            updateData = foundry.utils.mergeObject(source, updateData, { inplace: false });
          } else {
            // Workaround for core issue of bulk updating ActorDelta collections.
            ["items", "effects"].forEach(col => {
              for ( const [i, update] of (updateData[col] ?? []).entries() ) {
                const original = token.actor[col].get(update._id);
                updateData[col][i] = foundry.utils.mergeObject(original.toObject(), update, { inplace: false });
              }
            });
          }
          await token.actor.update(updateData, {
            enforceTypes: false, diff: !flags.persistSourceMigration,
            recursive: !flags.persistSourceMigration, render: false
          });
        }
        _recordLegacyReportDocument(legacyReport, source, "ActorDelta", updateData);
      } catch(err) {
        logError(err, "ActorDelta", `[${token.id}]`);
      }
      await incrementProgress();
    }
  }

  // Migrate World Compendium Packs
  for ( let p of packs ) {
    await migrateCompendium(p, { incrementProgress, legacyReport });
  }
  const legacyFolder = game.folders.find(f => f.type === "Compendium" && f.name === "D&D SRD Content");
  if ( legacyFolder ) legacyFolder.update({ name: "D&D Legacy Content" });

  // Set the migration as complete
  await game.settings.set("n5eb", "systemMigrationVersion", version);
  await _finalizeLegacyMigrationReport(legacyReport, { hasErrors });
  progress.element?.classList.add(hasErrors ? "warning" : "success");
  progress.update({ message: "MIGRATION.5eComplete", format: { version }, pct: 1 });
}

/* -------------------------------------------- */

/**
 * Determine whether a compendium pack should be migrated during `migrateWorld`.
 * @param {Compendium} pack
 * @returns {boolean}
 */
function _shouldMigrateCompendium(pack) {
  // We only care about actor, item or scene migrations
  if ( !["Actor", "Item", "Scene"].includes(pack.documentName) ) return false;

  // World compendiums should all be migrated, system ones should never by migrated
  if ( pack.metadata.packageType === "world" ) return true;
  if ( pack.metadata.packageType === "system" ) return false;

  // Module compendiums should only be migrated if they don't have a download or manifest URL
  const module = game.modules.get(pack.metadata.packageName);
  return !module.download && !module.manifest;
}

/* -------------------------------------------- */

/**
 * Clean legacy deletion marker keys from a document.
 * @param {foundry.abstract.Document} document  Document to update.
 * @returns {Promise<boolean>}                 Whether an update was applied.
 */
async function _cleanLegacyDeletionKeysForDocument(document) {
  const update = _getLegacyDeletionKeyCleanupUpdate(document.toObject());
  if ( !update ) return false;
  await document.update(update, { diff: false, recursive: true, render: false });
  return true;
}

/* -------------------------------------------- */

/**
 * Clean legacy deletion marker keys from an embedded collection.
 * @param {foundry.abstract.Document} parent  Parent document.
 * @param {string} embeddedName              Embedded document name.
 * @param {Collection} collection            Embedded document collection.
 * @returns {Promise<number>}                Number of updates applied.
 */
async function _cleanLegacyDeletionKeysForEmbedded(parent, embeddedName, collection) {
  if ( !collection?.size ) return 0;
  const updates = [];
  for ( const document of collection ) {
    const update = _getLegacyDeletionKeyCleanupUpdate(document.toObject());
    if ( update ) updates.push({ _id: document.id, ...update });
  }
  if ( !updates.length ) return 0;
  await parent.updateEmbeddedDocuments(embeddedName, updates, { diff: false, recursive: true, render: false });
  return updates.length;
}

/* -------------------------------------------- */

/**
 * Build a v14-safe update that replaces flags.n5eb with a cleaned copy.
 * @param {object} source  Document source data.
 * @returns {object|null}
 */
function _getLegacyDeletionKeyCleanupUpdate(source) {
  const flags = source.flags?.n5eb;
  if ( !foundry.utils.isPlainObject(flags) || foundry.utils.isEmpty(flags) ) return null;

  const cleaned = foundry.utils.deepClone(flags);
  _deleteLegacyDeletionKeys(cleaned);
  return { "flags.n5eb": foundry.data.operators.ForcedReplacement.create(cleaned) };
}

/* -------------------------------------------- */

/**
 * Remove legacy "-=" marker keys from an object tree.
 * @param {object} obj  Object to clean in place.
 * @returns {boolean}
 */
function _deleteLegacyDeletionKeys(obj) {
  let changed = false;
  for ( const key of Object.keys(obj) ) {
    if ( key.startsWith("-=") ) {
      delete obj[key];
      changed = true;
      continue;
    }

    const value = obj[key];
    if ( foundry.utils.isPlainObject(value) ) changed = _deleteLegacyDeletionKeys(value) || changed;
  }
  return changed;
}

/* -------------------------------------------- */

/**
 * Apply migration rules to all Documents within a single Compendium pack
 * @param {CompendiumCollection} pack       Pack to be migrated.
 * @param {object} [options={}]
 * @param {boolean} [options.bypassVersionCheck=false]  Bypass certain migration restrictions gated behind system
 *                                                      version stored in item stats.
 * @param {Function} [options.incrementProgress]        Function that can be called to increment the progress bar.
 * @param {boolean} [options.strict=false]  Migrate errors should stop the whole process.
 * @param {object} [options.legacyReport]  Report object for guarded legacy migrations.
 * @returns {Promise}
 */
export async function migrateCompendium(
  pack, { bypassVersionCheck=false, incrementProgress, strict=false, legacyReport }={}
) {
  const documentName = pack.documentName;
  if ( !["Actor", "Item", "Scene"].includes(documentName) ) return;

  const migrationData = await getMigrationData();

  // Unlock the pack for editing
  const wasLocked = pack.locked;
  try {
    await pack.configure({locked: false});
    game.compendiumArt.enabled = false;

    // Begin by requesting server-side data model migration and get the migrated content
    const documents = await pack.getDocuments();

    // Iterate over compendium entries - applying fine-tuned migration functions
    for ( let doc of documents ) {
      let updateData = {};
      let source;
      try {
        const flags = { bypassVersionCheck, persistSourceMigration: false, legacyReport };
        source = doc.toObject();
        switch ( documentName ) {
          case "Actor":
            updateData = migrateActorData(doc, source, migrationData, flags, { actorUuid: doc.uuid });
            if ( (documentName === "Actor") && source.effects && source.items
              && foundry.utils.isNewerVersion("3.0.3", source._stats.systemVersion) ) {
              const deleteIds = _duplicatedEffects(source);
              if ( deleteIds.size ) {
                if ( flags.persistSourceMigration ) source.effects = source.effects.filter(e => !deleteIds.has(e._id));
                else await doc.deleteEmbeddedDocuments("ActiveEffect", Array.from(deleteIds));
              }
            }
            break;
          case "Item":
            updateData = migrateItemData(doc, source, migrationData, flags);
            break;
          case "Scene":
            updateData = migrateSceneData(source, migrationData, flags);
            break;
        }

        // Save the entry, if data was changed
        if ( foundry.utils.isEmpty(updateData) ) continue;
        if ( flags.persistSourceMigration ) updateData = foundry.utils.mergeObject(source, updateData);
        await doc.update(updateData, { diff: !flags.persistSourceMigration });
        _recordLegacyReportDocument(legacyReport, source, documentName, updateData, { pack: pack.collection });
        log(`Migrated ${documentName} document ${doc.name} in Compendium ${pack.collection}`);
      }

      // Handle migration failures
      catch(err) {
        err.message = `Failed dnd5e system migration for document ${doc.name} in pack ${pack.collection}: ${err.message}`;
        console.error(err);
        _recordLegacyReportError(legacyReport, err, documentName, `${pack.collection}.${doc.name}`);
        if ( strict ) throw err;
      }

      finally {
        await incrementProgress?.();
      }
    }

    log(`Migrated all ${documentName} documents from Compendium ${pack.collection}`);
  } finally {
    // Apply the original locked status for the pack
    await pack.configure({locked: wasLocked});
    game.compendiumArt.enabled = true;
  }
}

/* -------------------------------------------- */

/**
 * Re-parents compendia from one top-level folder to another.
 * @param {string} from  The name of the source folder.
 * @param {string} to    The name of the destination folder.
 * @returns {Promise<Folder[]> | undefined}
 */
export function reparentCompendiums(from, to) {
  const compendiumFolders = new Map();
  for ( const folder of game.folders ) {
    if ( folder.type !== "Compendium" ) continue;
    if ( folder.folder ) {
      let folders = compendiumFolders.get(folder.folder);
      if ( !folders ) {
        folders = [];
        compendiumFolders.set(folder.folder, folders);
      }
      folders.push(folder);
    }
    if ( folder.name === from ) from = folder;
    else if ( folder.name === to ) to = folder;
  }
  if ( !(from instanceof Folder) || !(to instanceof Folder) ) return;
  const config = game.settings.get("core", "compendiumConfiguration");

  // Re-parent packs directly under the source folder.
  Object.values(config).forEach(conf => {
    if ( conf.folder === from.id ) conf.folder = to.id;
  });

  game.settings.set("core", "compendiumConfiguration", config);

  // Re-parent folders directly under the source folder.
  const updates = (compendiumFolders.get(from) ?? []).map(f => ({ _id: f.id, folder: to.id }));
  return Folder.implementation.updateDocuments(updates).then(() => from.delete());
}

/* -------------------------------------------- */

/**
 * Ensure persisted compendium folder configuration follows the current N5eB manifest layout.
 * Foundry preserves existing pack folder assignments, so manifest changes alone do not move packs
 * that were previously assigned elsewhere in a world.
 * @returns {Promise<void>}
 */
export async function ensureN5eBCompendiumFolders() {
  if ( !game.user.isGM ) return;

  const desired = new Map([
    ["N5E Content.Character Features", [
      "class", "subclass", "backgrounds", "traits-quirks", "clan", "feats", "classmod"
    ]],
    ["N5E Content.Items & Jutsus", ["items", "jutsus"]],
    ["N5E Content.Adversary & Summons", [
      "adversary", "npc", "adversary-traits", "adversary-passives", "summons"
    ]],
    ["N5E Content.Other", ["rules", "cheat-sheets", "conditions"]]
  ]);

  const config = foundry.utils.deepClone(game.settings.get("core", "compendiumConfiguration") ?? {});
  let changed = false;
  for ( const [path, packs] of desired ) {
    const folder = _findN5eBCompendiumFolder(path);
    if ( !folder ) continue;
    for ( const packName of packs ) {
      const collection = `n5eb.${packName}`;
      if ( !game.packs.has(collection) ) continue;
      config[collection] ??= {};
      if ( config[collection].folder === folder.id ) continue;
      config[collection].folder = folder.id;
      changed = true;
    }
  }

  if ( changed ) await game.settings.set("core", "compendiumConfiguration", config);
}

/* -------------------------------------------- */

/**
 * Find a Compendium folder by hierarchy path.
 * @param {string} path  Period-separated folder names.
 * @returns {Folder|null}
 * @private
 */
function _findN5eBCompendiumFolder(path) {
  let parentId = null;
  let match = null;
  for ( const name of path.split(".") ) {
    match = game.folders.find(folder =>
      (folder.type === "Compendium")
      && (folder.name === name)
      && (_getN5eBFolderParentId(folder) === parentId));
    if ( !match ) return null;
    parentId = match.id;
  }
  return match;
}

/* -------------------------------------------- */

/**
 * Get a folder's parent ID across Foundry parent representations.
 * @param {Folder} folder  Folder document.
 * @returns {string|null}
 * @private
 */
function _getN5eBFolderParentId(folder) {
  return folder.folder?.id ?? folder.folder ?? folder._source?.folder ?? null;
}

/* -------------------------------------------- */

/**
 * Update all compendium packs using the new system data model.
 * @param {object} [options={}]
 * @param {boolean} [options.bypassVersionCheck=false]  Bypass certain migration restrictions gated behind system
 *                                                      version stored in item stats.
 * @param {boolean} [options.migrate=true]  Also perform a system migration before refreshing.
 */
export async function refreshAllCompendiums(options) {
  for ( const pack of game.packs ) {
    await refreshCompendium(pack, options);
  }
}

/* -------------------------------------------- */

/**
 * Update all Documents in a compendium using the new system data model.
 * @param {CompendiumCollection} pack  Pack to refresh.
 * @param {object} [options={}]
 * @param {boolean} [options.bypassVersionCheck=false]  Bypass certain migration restrictions gated behind system
 *                                                      version stored in item stats.
 * @param {boolean} [options.migrate=true]  Also perform a system migration before refreshing.
 */
export async function refreshCompendium(pack, { bypassVersionCheck, migrate=true }={}) {
  if ( !pack?.documentName ) return;
  if ( migrate ) {
    try {
      await migrateCompendium(pack, { bypassVersionCheck, strict: true });
    } catch( err ) {
      err.message = `Failed dnd5e system migration pack ${pack.collection}: ${err.message}`;
      console.error(err);
      return;
    }
  }

  game.compendiumArt.enabled = false;
  const DocumentClass = CONFIG[pack.documentName].documentClass;
  const wasLocked = pack.locked;
  await pack.configure({locked: false});

  ui.notifications.info(`Beginning to refresh Compendium ${pack.collection}`);
  const documents = await pack.getDocuments();
  for ( const doc of documents ) {
    const data = doc.toObject();
    await doc.delete();
    await DocumentClass.create(data, {keepId: true, keepEmbeddedIds: true, pack: pack.collection});
  }
  await pack.configure({locked: wasLocked});
  game.compendiumArt.enabled = true;
  ui.notifications.info(`Refreshed all documents from Compendium ${pack.collection}`);
}

/* -------------------------------------------- */

/**
 * Apply 'smart' AC migration to a given Actor compendium. This will perform the normal AC migration but additionally
 * check to see if the actor has armor already equipped, and opt to use that instead.
 * @param {CompendiumCollection|string} pack  Pack or name of pack to migrate.
 * @returns {Promise}
 */
export async function migrateArmorClass(pack) {
  if ( typeof pack === "string" ) pack = game.packs.get(pack);
  if ( pack.documentName !== "Actor" ) return;
  const wasLocked = pack.locked;
  await pack.configure({locked: false});
  const actors = await pack.getDocuments();
  const updates = [];
  const armor = new Set(Object.keys(CONFIG.DND5E.armorTypes));

  for ( const actor of actors ) {
    try {
      log(`Migrating ${actor.name}...`);
      const src = actor.toObject();
      const update = {_id: actor.id};

      // Perform the normal migration.
      _migrateActorAC(src, update);
      // TODO: See if AC migration within DataModel is enough to handle this
      updates.push(update);

      // CASE 1: Armor is equipped
      const hasArmorEquipped = actor.itemTypes.equipment.some(e => {
        return armor.has(e.system.type.value) && e.system.equipped;
      });
      if ( hasArmorEquipped ) update["system.attributes.ac.calc"] = "default";

      // CASE 2: NPC Natural Armor
      else if ( src.type === "npc" ) update["system.attributes.ac.calc"] = "natural";
    } catch(e) {
      console.warn(`Failed to migrate armor class for Actor ${actor.name}`, e);
    }
  }

  await Actor.implementation.updateDocuments(updates, {pack: pack.collection});
  await pack.getDocuments(); // Force a re-prepare of all actors.
  await pack.configure({locked: wasLocked});
  log(`Migrated the AC of all Actors from Compendium ${pack.collection}`);
}

/* -------------------------------------------- */

/**
 * Migrate system settings to new data types.
 */
export async function migrateSettings() {
  // Migrate Disable Experience Tracking to Leveling Mode
  const disableExperienceTracking = game.settings.storage.get("world")
    ?.find(s => s.key === "dnd5e.disableExperienceTracking")?.value;
  const levelingMode = game.settings.storage.get("world")?.find(s => s.key === "dnd5e.levelingMode")?.value;
  if ( (disableExperienceTracking !== undefined) && (levelingMode === undefined) ) {
    await game.settings.set("n5eb", "levelingMode", "noxp");
  }
  // Migrate Disable Movement Automation to Movement Automation
  const disableMovementAutomation = game.settings.storage.get("world")
    ?.find(s => s.key === "dnd5e.disableMovementAutomation")?.value;
  const movementAutomation = game.settings.storage.get("world")
    ?.find(s => s.key === "dnd5e.movementAutomation")?.value;
  if ( (disableMovementAutomation !== undefined) && (movementAutomation === undefined) ) {
    await game.settings.set("n5eb", "movementAutomation", disableMovementAutomation ? "none" : "full");
  }
}

/* -------------------------------------------- */
/*  Document Type Migration Helpers             */
/* -------------------------------------------- */

/**
 * Migrate a single Actor document to incorporate latest data model changes
 * Return an Object of updateData to be applied
 * @param {Actor5e} actor               Full actor instance.
 * @param {object} actorData            The actor data object to update.
 * @param {object} [migrationData]      Additional data to perform the migration.
 * @param {object} [flags={}]           Track the needs migration flag.
 * @param {object} [options]
 * @param {string} [options.actorUuid]  The UUID of the actor.
 * @returns {object}                    The updateData to apply.
 */
export function migrateActorData(actor, actorData, migrationData, flags={}, { actorUuid }={}) {
  const updateData = {};
  _migrateTokenImage(actorData, updateData);
  _migrateLegacyN5eBActorData(actorData, updateData);
  _migrateActorAC(actorData, updateData);
  _migrateActorFlags(actorData, updateData);
  _migrateActorMovementSenses(actorData, updateData);
  _migrateN5eBHalfSaveDefaults(actorData, updateData, flags);
  _migrateN5eBDamageTypes(actorData, updateData);
  _migrateN5eBAffinityTrait(actorData, updateData);
  _migrateActorSkillToolMastery(actorData, updateData);
  _migrateN5eBActorToolKits(actorData, updateData);
  _migrateRyoCurrency(actorData.system, updateData);
  _migrateActorDowntimeCosts(actorData, updateData);
  _migrateCurrencyDenomination(actorData.system?.attributes?.price, updateData, "system.attributes.price");
  _migrateActorBulkWeight(actorData.system, updateData);
  _migrateLegacyPackUUIDs(actorData, updateData, migrationData, { skipKeys: new Set(["items", "effects"]) });

  // Migrate embedded effects
  if ( actorData.effects ) {
    const effects = migrateEffects(actorData, migrationData);
    if ( foundry.utils.isNewerVersion("3.1.0", actorData._stats?.systemVersion) ) {
      migrateCopyActorTransferEffects(actorData, effects, { actorUuid });
    }
    if ( effects.length > 0 ) updateData.effects = effects;
  }

  // Set source rules version to Legacy
  if ( foundry.utils.isNewerVersion("4.0.0", actorData._stats?.systemVersion) || flags.bypassVersionCheck ) {
    updateData["system.source.rules"] = "2014";
  }

  if ( foundry.utils.getProperty(actorData, "flags.n5eb.persistSourceMigration") ) {
    flags.persistSourceMigration = true;
    updateData["flags.n5eb.-=persistSourceMigration"] = null;
  }

  // Migrate Owned Items
  if ( !actorData.items ) return updateData;
  const mergeOptions = game.release.generation > 13
    ? { inplace: false, applyOperators: true }
    : { inplace: false, performDeletions: true };
  const items = actor.items.reduce((arr, i) => {
    // Migrate the Owned Item
    const itemData = i instanceof CONFIG.Item.documentClass ? i.toObject() : i;
    const itemFlags = {
      actorData, bypassVersionCheck: flags.bypassVersionCheck ?? false, persistSourceMigration: false,
      legacyReport: flags.legacyReport
    };
    let itemUpdate = migrateItemData(i, itemData, migrationData, itemFlags);
    _migrateClassChakraAdvancement(actorData, itemData, itemUpdate, updateData);

    if ( (itemData.type === "background") && (actorData.system?.details?.background !== itemData._id) ) {
      updateData["system.details.background"] = itemData._id;
    }

    // Prepared, Equipped, and Proficient for NPC actors
    if ( actorData.type === "npc" ) {
      if (foundry.utils.getProperty(itemData.system, "prepared") === false) itemUpdate["system.prepared"] = 1;
      if (foundry.utils.getProperty(itemData.system, "equipped") === false) itemUpdate["system.equipped"] = true;
    }

    // Update the Owned Item
    if ( itemFlags.persistSourceMigration ) flags.persistSourceMigration = true;
    _recordLegacyReportDocument(flags.legacyReport, itemData, "Item", itemUpdate, {
      parent: actorData.name || actorData._id
    });
    arr.push({ itemData, itemUpdate });

    // Update tool expertise.
    if ( actorData.system.tools ) {
      const hasToolProf = itemData.system.type?.baseItem in actorData.system.tools;
      if ( (itemData.type === "tool") && (itemData.system.proficient > 1) && hasToolProf ) {
        updateData[`system.tools.${itemData.system.type.baseItem}.value`] = 1;
        updateData[`system.tools.${itemData.system.type.baseItem}.mastery`] = Math.min(
          Math.max(Math.floor(itemData.system.proficient - 1), 1), 3
        );
      }
    }

    return arr;
  }, []).map(({ itemData, itemUpdate }) => {
    if ( flags.persistSourceMigration ) {
      if ( "effects" in itemUpdate ) itemUpdate.effects = itemData.effects.map(effect => foundry.utils.mergeObject(
        effect, itemUpdate.effects.find(e => e._id === effect._id) ?? {}, mergeOptions
      ));
      itemUpdate = foundry.utils.mergeObject(itemData, itemUpdate, mergeOptions);
    }
    return foundry.utils.isEmpty(itemUpdate) ? null : { ...itemUpdate, _id: itemData._id };
  }).filter(_ => _);
  if ( items.length ) {
    updateData.items = items;
    // This update might not contain any system data, so we manually bump systemVersion since the server will not.
    updateData._stats = { systemVersion: game.system.version };
  }

  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single Item document to incorporate latest data model changes
 *
 * @param {Item5e} item             Full item instance.
 * @param {object} itemData         Item data to migrate.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @param {object} [flags={}]       Track the needs migration flag.
 * @returns {object}                The updateData to apply.
 */
export function migrateItemData(item, itemData, migrationData, flags={}) {
  const updateData = {};
  _migrateDocumentIcon(itemData, updateData, migrationData);
  _migrateItemUses(item, itemData, updateData, flags);
  _migrateToolItemMastery(itemData, updateData);
  _migrateN5eBToolKitItem(itemData, updateData);
  _migrateN5eBKitTraitChoices(itemData, updateData);
  _migrateN5eBDamageTypes(itemData, updateData);
  _migrateN5eBClanSources(itemData, updateData);
  _migrateN5eBT7Dasomia(itemData, updateData);
  _migrateN5eBClanFeatureTypes(itemData, updateData);
  _migrateN5eBBackgroundSources(itemData, updateData);
  _migrateN5eBBackgroundFeatureTypes(itemData, updateData);
  _migrateN5eBBackgroundText(itemData, updateData);
  _migrateRyoCurrency(itemData.system, updateData);
  _migrateDowntimeTemplateCost(itemData, updateData);
  _migrateCurrencyDenomination(itemData.system?.price, updateData, "system.price");
  _migrateBulkWeight(itemData.system, updateData, "system");
  _migrateN5eBContainerItem(itemData, updateData);
  _migrateN5eBArmorAndSeals(itemData, updateData);
  _migrateJutsuChakraScaling(itemData, updateData);
  _migrateN5eBClassmodArts(itemData, updateData);
  _migrateN5eBBookParityFixes(itemData, updateData, migrationData);
  _migrateN5eBEquipmentPackAliases(itemData, updateData);
  _migrateLegacyPackUUIDs(itemData, updateData, migrationData);

  // Migrate embedded effects
  if ( itemData.effects ) {
    const riders = foundry.utils.getProperty(itemData, "flags.n5eb.riders.effect");
    if ( riders?.length ) updateData["flags.n5eb.riders.effect"] = riders;
    const effects = migrateEffects(itemData, migrationData, updateData, flags);
    if ( riders?.length === updateData["flags.n5eb.riders.effect"]?.length ) {
      delete updateData["flags.n5eb.riders.effect"];
    }
    if ( effects.length > 0 ) updateData.effects = effects;
  }

  // Set source rules version to Legacy
  if ( foundry.utils.isNewerVersion("4.0.0", itemData._stats?.systemVersion) || flags.bypassVersionCheck ) {
    updateData["system.source.rules"] = "2014";
    if ( Object.hasOwn(item.system, "identifier") && !itemData.system?.identifier ) {
      updateData["system.identifier"] = item.identifier;
    }
  }

  // Commit advancement data structure change
  if ( itemData.system?.advancement
    && (foundry.utils.isNewerVersion("5.3.0", itemData._stats?.systemVersion) || flags.bypassVersionCheck) ) {
    updateData["system.==advancement"] = itemData.system.advancement;
  }

  // Migrate properties
  const migratedProperties = foundry.utils.getProperty(itemData, "flags.n5eb.migratedProperties");
  if ( migratedProperties?.length ) {
    flags.persistSourceMigration = true;
    const properties = new Set(foundry.utils.getProperty(itemData, "system.properties") ?? [])
      .union(new Set(migratedProperties));
    updateData["system.properties"] = Array.from(properties);
    updateData["flags.n5eb.-=migratedProperties"] = null;
  }

  // Migrate gear property
  if ( (flags.actorData?.type === "npc") && item.system.quantity && (item.system.type?.value !== "natural")
    && (!["equipment", "weapon"].includes(item.type) || item._stats.compendiumSource)
    && !item.system.properties?.has("gear")
    && !item._stats.compendiumSource?.startsWith("Compendium.dnd-monster-manual.features.")
    && (flags.bypassVersionCheck || foundry.utils.isNewerVersion("5.3.0", item._stats.systemVersion)) ) {
    if ( !("system.properties" in updateData) ) {
      updateData["system.properties"] = foundry.utils.getProperty(itemData, "system.properties") ?? [];
    }
    updateData["system.properties"].push("gear");
  }

  // Backfill sourceItem for spells granted by non-class items (species, backgrounds, etc.)
  if ( (itemData.type === "spell") && !itemData.system?.sourceItem && flags.actorData?.items ) {
    // Try to identify the granting item from advancement or cast-activity flags.
    let grantingItemData;
    const advancementOrigin = item.getFlag("n5eb", "advancementOrigin");
    if ( advancementOrigin ) {
      const [itemId] = advancementOrigin.split(".");
      grantingItemData = flags.actorData.items.find(i => i._id === itemId);
    }
    if ( !grantingItemData ) {
      const cachedFor = item.getFlag("n5eb", "cachedFor");
      if ( cachedFor ) {
        const { embedded } = foundry.utils.parseUuid(cachedFor, { relative: item.parent }) ?? {};
        const [, itemId] = embedded ?? [];
        if ( itemId ) grantingItemData = flags.actorData.items.find(i => i._id === itemId);
      }
    }
    if ( grantingItemData ) {
      const identifier = grantingItemData.system?.identifier || formatIdentifier(grantingItemData.name);
      updateData["system.sourceItem"] = `${grantingItemData.type}:${identifier}`;
    }
  }

  if ( foundry.utils.getProperty(itemData, "flags.n5eb.persistSourceMigration") ) {
    flags.persistSourceMigration = true;
    updateData["flags.n5eb.-=persistSourceMigration"] = null;
  }

  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate any active effects attached to the provided parent.
 * @param {object} parent            Data of the parent being migrated.
 * @param {object} [migrationData]   Additional data to perform the migration.
 * @param {object} [itemUpdateData]  Update data for the item to apply changes back to item.
 * @param {object} [flags={}]        Track the needs migration flag.
 * @returns {object[]}               Updates to apply on the embedded effects.
 */
export function migrateEffects(parent, migrationData, itemUpdateData, flags={}) {
  if ( !parent.effects ) return [];
  return parent.effects.reduce((arr, e) => {
    const effectData = e instanceof CONFIG.ActiveEffect.documentClass ? e.toObject() : e;
    let effectUpdate = migrateEffectData(effectData, migrationData, { parent });
    if ( effectData.flags?.n5eb?.rider ) {
      itemUpdateData["flags.n5eb.riders.effect"] ??= [];
      itemUpdateData["flags.n5eb.riders.effect"].push(effectData._id);
      effectUpdate["flags.n5eb.-=rider"] = null;
    }
    if ( effectData.flags?.n5eb?.persistSourceMigration ) {
      flags.persistSourceMigration = true;
      effectUpdate["flags.n5eb.-=persistSourceMigration"] = null;
    }
    if ( !foundry.utils.isEmpty(effectUpdate) ) {
      effectUpdate._id = effectData._id;
      arr.push(foundry.utils.expandObject(effectUpdate));
    }
    return arr;
  }, []);
}

/* -------------------------------------------- */

/**
 * Migrates transfer effects on items belonging to this actor to "real" effects on the actor.
 * @param {object} actor                 The parent actor.
 * @param {object[]} effects             An array of new effects to add.
 * @param {object} [options]             Additional options.
 * @param {string} [options.actorUuid]   UUID of the parent actor
 */
export function migrateCopyActorTransferEffects(actor, effects, { actorUuid }={}) {
  if ( !actor.items ) return;

  for ( const item of actor.items ) {
    for ( const effect of item.effects ) {
      if ( !effect.transfer ) continue;
      if ( !isSpellOrScroll(item) ) continue;
      if ( effect.disabled ) continue;

      const newEffect = foundry.utils.deepClone(effect);
      newEffect.transfer = false;
      if ( actorUuid ) newEffect.origin = `${actorUuid}.Item.${item._id}.ActiveEffect.${effect._id}`;
      delete newEffect._id;
      effects.push(newEffect);
    }
  }
}

/* -------------------------------------------- */

/**
 * Migrate the provided active effect data.
 * @param {object} effect            Effect data to migrate.
 * @param {object} [migrationData]   Additional data to perform the migration.
 * @param {object} [options]         Additional options.
 * @param {object} [options.parent]  Parent of this effect.
 * @returns {object}                 The updateData to apply.
 */
export function migrateEffectData(effect, migrationData, { parent }={}) {
  const updateData = {};
  _migrateDocumentIcon(effect, updateData, {...migrationData, field: "img"});
  _migrateEffectArmorClass(effect, updateData);
  _migrateN5eBKitEffectKeys(effect, updateData);
  _migrateN5eBDamageEffectKeys(effect, updateData);
  _migrateN5eBAffinityEffectKeys(effect, updateData);
  _migrateN5eBConditionEffect(effect, updateData);
  if ( foundry.utils.isNewerVersion("3.1.0", effect._stats?.systemVersion ?? parent?._stats?.systemVersion) ) {
    _migrateTransferEffect(effect, parent, updateData);
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single Macro document to incorporate latest data model changes.
 * @param {object} macro            Macro data to migrate
 * @param {object} [migrationData]  Additional data to perform the migration
 * @returns {object}                The updateData to apply
 */
export function migrateMacroData(macro, migrationData) {
  const updateData = {};
  _migrateDocumentIcon(macro, updateData, migrationData);
  _migrateMacroCommands(macro, updateData);
  _migrateLegacyPackUUIDs(macro, updateData, migrationData);
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single chat message document.
 * @param {object} messageData      Message data to migrate.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @returns {object}                The update data to apply.
 */
export function migrateMessageData(messageData, migrationData) {
  const updateData = {};
  const { flags } = messageData;
  _migrateLegacyPackUUIDs(messageData, updateData, migrationData);

  if ( (flags?.n5eb?.messageType === "usage") && (messageData.type !== "usage") ) {
    const use = flags.n5eb.use;
    updateData.type = "usage";
    updateData["==system"] = {
      cause: use?.cause,
      concentration: use?.concentrationId,
      deltas: use?.consumed,
      effects: use?.effects?.map?.(id => `.ActiveEffect.${id}`),
      scaling: use?.scaling,
      spellLevel: use?.spellLevel
    };
    updateData["flags.n5eb.-=messageType"] = null;
    updateData["flags.n5eb.-=scaling"] = null;
    updateData["flags.n5eb.use.-=cause"] = null;
    updateData["flags.n5eb.use.-=concentrationId"] = null;
    updateData["flags.n5eb.use.-=consumed"] = null;
    updateData["flags.n5eb.use.-=effects"] = null;
    updateData["flags.n5eb.use.-=spellLevel"] = null;
  }

  else if ( flags?.n5eb?.bastion && (messageData.type === "base") ) {
    const bastion = flags.n5eb.bastion;
    updateData.type = "orders" in bastion ? "bastionTurn" : "bastionAttack";
    updateData["==system"] = bastion;
    updateData["flags.n5eb.-=bastion"] = null;
  }

  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single RollTable document to incorporate the latest data model changes.
 * @param {object} table            Roll table data to migrate.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @returns {object}                The update delta to apply.
 */
export function migrateRollTableData(table, migrationData) {
  const updateData = {};
  _migrateDocumentIcon(table, updateData, migrationData);
  _migrateLegacyPackUUIDs(table, updateData, migrationData);
  if ( !table.results?.length ) return updateData;
  const results = table.results.reduce((arr, result) => {
    const resultUpdate = {};
    _migrateDocumentIcon(result, resultUpdate, migrationData);
    if ( !foundry.utils.isEmpty(resultUpdate) ) {
      resultUpdate._id = result._id;
      arr.push(foundry.utils.expandObject(resultUpdate));
    }
    return arr;
  }, []);
  if ( results.length ) updateData.results = results;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single Scene document to incorporate changes to the data model of its actor data overrides
 * Return an Object of updateData to be applied
 * @param {object} scene            The Scene data to Update
 * @param {object} [migrationData]  Additional data to perform the migration
 * @returns {object}                The updateData to apply
 */
export function migrateSceneData(scene, migrationData) {
  const updateData = {};
  _migrateLegacyPackUUIDs(scene, updateData, migrationData, { skipKeys: new Set(["tokens"]) });
  const tokens = scene.tokens.reduce((arr, token) => {
    const t = token instanceof foundry.abstract.DataModel ? token.toObject() : token;
    const update = {};
    _migrateLegacyPackUUIDs(t, update, migrationData);
    _migrateTokenImage(t, update);
    if ( !game.actors.has(t.actorId) ) update.actorId = null;
    if ( !foundry.utils.isEmpty(update) ) arr.push({ ...update, _id: t._id });
    return arr;
  }, []);
  if ( tokens.length ) updateData.tokens = tokens;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Fetch bundled data for large-scale migrations.
 * @returns {Promise<object>}  Object mapping original system references to their replacements.
 */
export async function getMigrationData() {
  const data = {};
  try {
    const icons = await fetch("systems/n5eb/json/icon-migration.json");
    const spellIcons = await fetch("systems/n5eb/json/spell-icon-migration.json");
    data.iconMap = {...await icons.json(), ...await spellIcons.json()};
  } catch(err) {
    console.warn(`Failed to retrieve icon migration data: ${err.message}`);
  }
  try {
    const legacyPackUuidMap = await fetch("systems/n5eb/json/legacy-pack-uuid-map.json");
    data.legacyPackUuidMap = legacyPackUuidMap.ok ? await legacyPackUuidMap.json() : {};
  } catch(err) {
    console.warn(`Failed to retrieve legacy N5eB UUID migration data: ${err.message}`);
    data.legacyPackUuidMap = {};
  }
  try {
    const assetPathMap = await fetch("systems/n5eb/json/asset-path-map.json");
    data.assetPathMap = assetPathMap.ok ? await assetPathMap.json() : {};
  } catch(err) {
    console.warn(`Failed to retrieve N5eB asset path migration data: ${err.message}`);
    data.assetPathMap = {};
  }
  try {
    const bookParityFixes = await fetch("systems/n5eb/json/book-parity-fixes.json");
    data.bookParityFixes = bookParityFixes.ok ? await bookParityFixes.json() : [];
  } catch(err) {
    console.warn(`Failed to retrieve N5eB book parity migration data: ${err.message}`);
    data.bookParityFixes = [];
  }
  return data;
}

/* -------------------------------------------- */
/*  Low level migration utilities
/* -------------------------------------------- */

/**
 * Coerce a value to a finite number, falling back to zero.
 * @param {*} value  Value to coerce.
 * @returns {number}
 * @private
 */
function _finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/* -------------------------------------------- */

/**
 * Migrate D&D damage type keys that are not valid N5eB damage types.
 * @param {object} documentData  Document source data being migrated.
 * @param {object} updateData    Existing updates being applied. *Will be mutated.*
 * @returns {object}
 * @private
 */
function _migrateN5eBDamageTypes(documentData, updateData) {
  const system = documentData.system ?? {};

  for ( const trait of ["di", "dr", "dv"] ) {
    _migrateN5eBDamageTypeSet(
      foundry.utils.getProperty(system, `traits.${trait}.value`),
      `system.traits.${trait}.value`,
      updateData
    );
  }
  _migrateN5eBDamageModificationMap(system.traits?.dm?.amount, "system.traits.dm.amount", updateData);

  _migrateN5eBDamageData(system.damage?.base, "system.damage.base", updateData);
  _migrateN5eBDamageData(system.damage?.versatile, "system.damage.versatile", updateData);
  _migrateN5eBLegacyDamageParts(system.damage?.parts, "system.damage.parts", updateData);

  for ( const [activityId, activity] of Object.entries(system.activities ?? {}) ) {
    for ( const [partId, part] of Object.entries(activity.damage?.parts ?? {}) ) {
      _migrateN5eBDamageData(part, `system.activities.${activityId}.damage.parts.${partId}`, updateData);
    }
    _migrateN5eBDamageData(activity.healing, `system.activities.${activityId}.healing`, updateData);
  }

  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate damage type keys in an Active Effect's changes.
 * @param {object} effect      Effect source data.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @returns {object}
 * @private
 */
function _migrateN5eBDamageEffectKeys(effect, updateData) {
  for ( const [index, change] of (effect.changes ?? []).entries() ) {
    const keyMatch = change.key?.match(/^system\.traits\.dm\.amount\.(radiant|thunder|none)$/);
    if ( keyMatch ) {
      const migrated = _migrateN5eBDamageType(keyMatch[1]);
      updateData[`changes.${index}.key`] = migrated ? `system.traits.dm.amount.${migrated}` : "";
    }

    if ( typeof change.value !== "string" ) continue;
    const migrated = _migrateN5eBDamageTypeString(change.value);
    if ( migrated !== change.value ) updateData[`changes.${index}.value`] = migrated;
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate legacy actor affinity data into the native N5eB affinity trait shape.
 * @param {object} actorData   Actor data being migrated.
 * @param {object} updateData  Existing update data. *Will be mutated.*
 * @returns {object}           Modified update data.
 * @private
 */
function _migrateN5eBAffinityTrait(actorData, updateData) {
  const affinity = actorData.system?.traits?.affinity;
  if ( affinity === undefined ) return updateData;

  const { value, changed } = _normalizeN5eBAffinityTrait(affinity);
  if ( changed ) updateData["system.traits.affinity"] = value;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Normalize old Active Effect affinity paths and values.
 * @param {object} effect      Active Effect data being migrated.
 * @param {object} updateData  Existing update data. *Will be mutated.*
 * @returns {object}           Modified update data.
 * @private
 */
function _migrateN5eBAffinityEffectKeys(effect, updateData) {
  for ( const [index, change] of (effect.changes ?? []).entries() ) {
    const key = change.key;
    if ( key === "system.traits.affinity" ) updateData[`changes.${index}.key`] = "system.traits.affinity.value";
    if ( (key !== "system.traits.affinity") && (key !== "system.traits.affinity.value") ) continue;

    const migrated = _normalizeN5eBAffinityKey(change.value);
    if ( migrated && (migrated !== change.value) ) updateData[`changes.${index}.value`] = migrated;
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Normalize affinity trait data.
 * @param {unknown} value  Legacy or current affinity data.
 * @returns {{ value: object, changed: boolean }}
 * @private
 */
function _normalizeN5eBAffinityTrait(value) {
  const isObject = foundry.utils.getType(value) === "Object";
  const current = isObject ? value : {};
  const normalized = {
    ...current,
    value: [],
    custom: typeof current.custom === "string" ? current.custom : ""
  };

  const affinities = new Set();
  const custom = new Set(normalized.custom.split(";").map(v => v.trim()).filter(Boolean));
  const rawValue = Object.hasOwn(current, "value") ? current.value : value;
  _collectN5eBAffinityValues(rawValue, affinities, custom);
  normalized.value = Array.from(affinities);
  normalized.custom = Array.from(custom).join("; ");

  const wasCurrentShape = isObject
    && Array.isArray(value.value)
    && (typeof value.custom === "string")
    && value.value.every(v => affinities.has(v))
    && (value.value.length === affinities.size)
    && (value.custom === normalized.custom);

  return { value: normalized, changed: !wasCurrentShape };
}

/* -------------------------------------------- */

/**
 * Collect affinity values from legacy data.
 * @param {unknown} value       Source value.
 * @param {Set<string>} values  Normalized canonical values. *Will be mutated.*
 * @param {Set<string>} custom  Unrecognized values. *Will be mutated.*
 * @private
 */
function _collectN5eBAffinityValues(value, values, custom) {
  if ( value instanceof Set ) value = Array.from(value);
  if ( Array.isArray(value) ) {
    value.forEach(v => _collectN5eBAffinityValues(v, values, custom));
    return;
  }

  if ( value && (typeof value === "object") ) {
    Object.entries(value).forEach(([key, selected]) => {
      if ( selected ) _collectN5eBAffinityValues(key, values, custom);
    });
    return;
  }

  if ( typeof value !== "string" ) return;
  for ( const entry of value.split(/[;,]/).map(v => v.trim()).filter(Boolean) ) {
    const normalized = _normalizeN5eBAffinityKey(entry);
    if ( normalized ) values.add(normalized);
    else if ( entry !== "*" ) custom.add(entry);
  }
}

/* -------------------------------------------- */

/**
 * Normalize one affinity key or label.
 * @param {unknown} value  Affinity key.
 * @returns {string|null}
 * @private
 */
function _normalizeN5eBAffinityKey(value) {
  if ( typeof value !== "string" ) return null;
  value = value.trim();
  if ( !value || (value === "*") ) return null;
  value = value.replace(/^affinity:/i, "");
  const compact = value.toLowerCase().replace(/[\s_-]/g, "").replace(/release$/i, "");
  const map = {
    earth: "earth",
    fire: "fire",
    lightning: "lightning",
    medical: "medical",
    water: "water",
    wind: "wind"
  };
  return map[compact] ?? (N5EB_AFFINITY_KEYS.has(value) ? value : null);
}

/* -------------------------------------------- */

/**
 * Migrate a DamageData-like object.
 * @param {object} data        Damage data source.
 * @param {string} path        Update path to the damage data.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @private
 */
function _migrateN5eBDamageData(data, path, updateData) {
  if ( !data ) return;
  _migrateN5eBDamageTypeSet(data.types, `${path}.types`, updateData);
}

/* -------------------------------------------- */

/**
 * Migrate legacy damage part tuples.
 * @param {Array} parts        Legacy damage parts.
 * @param {string} path        Update path to the legacy damage parts.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @private
 */
function _migrateN5eBLegacyDamageParts(parts, path, updateData) {
  if ( !Array.isArray(parts) ) return;
  for ( const [index, part] of parts.entries() ) {
    if ( !Array.isArray(part) || (typeof part[1] !== "string") ) continue;
    const migrated = _migrateN5eBDamageType(part[1]);
    if ( migrated === part[1] ) continue;
    updateData[`${path}.${index}.1`] = migrated ?? "";
  }
}

/* -------------------------------------------- */

/**
 * Migrate a set or array of damage type keys.
 * @param {Iterable<string>} types  Damage type keys.
 * @param {string} path             Update path to the type set.
 * @param {object} updateData       Existing updates being applied. *Will be mutated.*
 * @private
 */
function _migrateN5eBDamageTypeSet(types, path, updateData) {
  if ( !types ) return;
  const next = [];
  let changed = false;
  for ( const type of Array.from(types) ) {
    if ( typeof type !== "string" ) {
      next.push(type);
      continue;
    }

    const migrated = _migrateN5eBDamageType(type);
    changed ||= migrated !== type;
    if ( migrated !== null ) next.push(migrated);
  }

  const unique = Array.from(new Set(next));
  changed ||= unique.length !== next.length;
  if ( changed ) updateData[path] = unique;
}

/* -------------------------------------------- */

/**
 * Migrate keys in a damage modification map.
 * @param {object} amount      Damage modification map.
 * @param {string} path        Update path to the map.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @private
 */
function _migrateN5eBDamageModificationMap(amount, path, updateData) {
  if ( !amount ) return;
  for ( const [type, formula] of Object.entries(amount) ) {
    const migrated = _migrateN5eBDamageType(type);
    if ( migrated === type ) continue;

    updateData[`${path}.-=${type}`] = null;
    if ( migrated === null ) continue;

    const existing = updateData[`${path}.${migrated}`] ?? amount[migrated];
    updateData[`${path}.${migrated}`] = _mergeN5eBDamageModification(existing, formula);
  }
}

/* -------------------------------------------- */

/**
 * Merge two damage modification formulas.
 * @param {string} existing  Existing formula.
 * @param {string} incoming  Incoming formula.
 * @returns {string}
 * @private
 */
function _mergeN5eBDamageModification(existing, incoming) {
  if ( !existing ) return incoming;
  if ( !incoming || (existing === incoming) ) return existing;
  return `(${existing}) + (${incoming})`;
}

/* -------------------------------------------- */

/**
 * Migrate one damage type key.
 * @param {string} type  Damage type key.
 * @returns {string|null}
 * @private
 */
function _migrateN5eBDamageType(type) {
  return Object.hasOwn(N5EB_DAMAGE_TYPE_MIGRATIONS, type) ? N5EB_DAMAGE_TYPE_MIGRATIONS[type] : type;
}

/* -------------------------------------------- */

/**
 * Migrate damage type keys embedded in a compact formula/config string.
 * @param {string} value  Source string.
 * @returns {string}
 * @private
 */
function _migrateN5eBDamageTypeString(value) {
  const exact = _migrateN5eBDamageType(value);
  if ( exact !== value ) return exact ?? "";
  return value
    .replace(/\bradiant\b/g, "lightning")
    .replace(/\bthunder\b/g, "force");
}

/* -------------------------------------------- */

/**
 * Migrate official/T7 clan source metadata and naming.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBClanSources(itemData, updateData) {
  if ( itemData.system?.source?.rules !== "n5eb" ) return updateData;
  if ( !_isN5eBOfficialClanItem(itemData) ) return updateData;

  if ( itemData.system?.source?.book === "Tsunade's Studies Compendium" ) {
    updateData["system.source.book"] = "Naruto 5e";
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate Team 7 Dasomia spelling corrections on existing world items.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBT7Dasomia(itemData, updateData) {
  if ( !_isN5eBT7DasomiaItem(itemData) ) return updateData;

  const name = _replaceN5eBT7DasomiaText(itemData.name);
  if ( name && (name !== itemData.name) ) updateData.name = name;

  const currentIdentifier = itemData.system?.identifier;
  const identifier = _replaceN5eBT7DasomiaText(currentIdentifier);
  if ( identifier && (identifier !== currentIdentifier) ) updateData["system.identifier"] = identifier;

  return updateData;
}

/* -------------------------------------------- */

/**
 * Replace obsolete Team 7 Dasomia spellings.
 * @param {string|undefined} value  Text value to migrate.
 * @returns {string|undefined}      Migrated value.
 * @private
 */
function _replaceN5eBT7DasomiaText(value) {
  if ( typeof value !== "string" ) return value;
  return N5EB_T7_DASOMIA_REPLACEMENTS.reduce((text, [pattern, replacement]) => {
    return text.replace(pattern, replacement);
  }, value);
}

/* -------------------------------------------- */

/**
 * Migrate imported official clan feature categories to N5eB-specific labels.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBClanFeatureTypes(itemData, updateData) {
  if ( itemData.type !== "feat" ) return updateData;

  const type = itemData.system?.type ?? {};
  const subtype = N5EB_CLAN_FEATURE_SUBTYPE_MIGRATIONS[type.subtype] ?? type.subtype;
  if ( subtype !== type.subtype ) updateData["system.type.subtype"] = subtype;

  const clanFeatureType = _getN5eBClanFeatureType(itemData);
  if ( !clanFeatureType ) return updateData;

  if ( type.value !== clanFeatureType ) updateData["system.type.value"] = clanFeatureType;
  if ( (clanFeatureType !== "race") && type.subtype ) updateData["system.type.subtype"] = "";
  return updateData;
}

/* -------------------------------------------- */

/**
 * Get the canonical official clan feature type for an item.
 * @param {object} itemData  Item data being migrated.
 * @returns {string|null}
 * @private
 */
function _getN5eBClanFeatureType(itemData) {
  const sourcePath = _getN5eBClanSourcePath(itemData);
  if ( sourcePath ) {
    if ( /(?:^|[/\\])clan-feats(?:[/\\]|$)/i.test(sourcePath) ) return "clanfeat";
    if ( /(?:^|[/\\])latent-ability(?:[/\\]|$)/i.test(sourcePath) ) return "latentAbility";
    if ( /(?:^|[/\\])(?:clan-features|byakugan-features|hyuga-features|nindo)(?:[/\\]|$)/i.test(sourcePath) ) {
      return "race";
    }
  }

  if ( !_isN5eBOfficialClanFeatureItem(itemData) ) return null;

  const identifier = itemData.system?.identifier ?? formatIdentifier(itemData.name ?? "");
  if ( identifier.startsWith("latent-") || /^latent\b/i.test(itemData.name ?? "") ) return "latentAbility";
  if ( itemData.system?.type?.value === "clanfeat" ) return "clanfeat";
  return null;
}

/* -------------------------------------------- */

/**
 * Get legacy source path metadata for an official clan feature item.
 * @param {object} itemData  Item data being migrated.
 * @returns {string}
 * @private
 */
function _getN5eBClanSourcePath(itemData) {
  const legacyImport = foundry.utils.getProperty(itemData, "flags.n5eb.legacyImport") ?? {};
  return legacyImport.sourcePath ?? itemData._stats?.compendiumSource ?? "";
}

/* -------------------------------------------- */

/**
 * Is this item sourced from the official N5eB clan pack?
 * @param {object} itemData  Item data being migrated.
 * @returns {boolean}
 * @private
 */
function _isN5eBOfficialClanFeatureItem(itemData) {
  return _isN5eBOfficialClanItem(itemData);
}

/* -------------------------------------------- */

/**
 * Is this item sourced from the official N5eB clan pack?
 * @param {object} itemData  Item data being migrated.
 * @returns {boolean}
 * @private
 */
function _isN5eBOfficialClanItem(itemData) {
  const legacyImport = foundry.utils.getProperty(itemData, "flags.n5eb.legacyImport") ?? {};
  if ( legacyImport.sourcePack === "clan" ) return true;
  if ( itemData._stats?.compendiumSource?.startsWith("Compendium.n5eb.clan.") ) return true;
  return itemData.system?.source?.rules === "n5eb"
    && N5EB_OFFICIAL_CLAN_SOURCE_BOOKS.has(itemData.system?.source?.book);
}

/* -------------------------------------------- */

/**
 * Is this item a Team 7 Dasomia clan item using an obsolete spelling?
 * @param {object} itemData  Item data being migrated.
 * @returns {boolean}
 * @private
 */
function _isN5eBT7DasomiaItem(itemData) {
  const legacyImport = foundry.utils.getProperty(itemData, "flags.n5eb.legacyImport") ?? {};
  const sourcePath = `${legacyImport.sourcePath ?? ""} ${itemData._stats?.compendiumSource ?? ""}`;
  if ( /dosamia-coven/i.test(sourcePath) ) return true;

  return itemData.system?.source?.rules === "n5eb"
    && itemData.system?.source?.book === "Team 7"
    && /\b(?:dosamia|desomia)\b/i.test(`${itemData.name ?? ""} ${itemData.system?.identifier ?? ""}`);
}

/* -------------------------------------------- */

/**
 * Migrate official and Team 7 background source labels.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBBackgroundSources(itemData, updateData) {
  if ( !_isN5eBBackgroundPackItem(itemData) ) return updateData;

  const pack = _getN5eBBackgroundSourcePack(itemData);
  const currentBook = itemData.system?.source?.book;
  const book = pack === "backgrounds" ? "Naruto 5e"
    : pack === "t7-backgrounds" ? "Team 7"
      : N5EB_BACKGROUND_SOURCE_BOOK_MIGRATIONS[currentBook];

  if ( book && (currentBook !== book) ) updateData["system.source.book"] = book;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate background feature item categories.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBBackgroundFeatureTypes(itemData, updateData) {
  if ( itemData.type !== "feat" ) return updateData;
  if ( !_isN5eBBackgroundFeatureItem(itemData) ) return updateData;

  if ( itemData.system?.type?.value !== "background" ) updateData["system.type.value"] = "background";
  if ( itemData.system?.type?.subtype ) updateData["system.type.subtype"] = "";
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate readable background text and obvious display typos.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBBackgroundText(itemData, updateData) {
  if ( !_isN5eBBackgroundPackItem(itemData) ) return updateData;

  const name = _replaceN5eBBackgroundText(itemData.name);
  if ( name && (name !== itemData.name) ) updateData.name = name;

  const currentIdentifier = itemData.system?.identifier;
  const identifier = _replaceN5eBBackgroundText(currentIdentifier);
  if ( identifier && (identifier !== currentIdentifier) ) updateData["system.identifier"] = identifier;

  const currentDescription = updateData["system.description.value"] ?? itemData.system?.description?.value;
  const description = _cleanN5eBBackgroundDescription(_replaceN5eBBackgroundText(currentDescription));
  if ( description && (description !== currentDescription) ) updateData["system.description.value"] = description;

  return updateData;
}

/* -------------------------------------------- */

/**
 * Is this item from the official or Team 7 background packs?
 * @param {object} itemData  Item data being migrated.
 * @returns {boolean}
 * @private
 */
function _isN5eBBackgroundPackItem(itemData) {
  if ( _getN5eBBackgroundSourcePack(itemData) ) return true;

  const sourceBook = itemData.system?.source?.book;
  return itemData.type === "background"
    && itemData.system?.source?.rules === "n5eb"
    && Object.hasOwn(N5EB_BACKGROUND_SOURCE_BOOK_MIGRATIONS, sourceBook);
}

/* -------------------------------------------- */

/**
 * Is this item an official or Team 7 background feature?
 * @param {object} itemData  Item data being migrated.
 * @returns {boolean}
 * @private
 */
function _isN5eBBackgroundFeatureItem(itemData) {
  const sourcePath = _getN5eBBackgroundSourcePath(itemData);
  if ( /(?:^|[/\\])background-features(?:[/\\]|$)/i.test(sourcePath) ) return true;
  return Boolean(_getN5eBBackgroundSourcePack(itemData));
}

/* -------------------------------------------- */

/**
 * Get the source pack for official or Team 7 background content.
 * @param {object} itemData  Item data being migrated.
 * @returns {string}
 * @private
 */
function _getN5eBBackgroundSourcePack(itemData) {
  const legacyImport = foundry.utils.getProperty(itemData, "flags.n5eb.legacyImport") ?? {};
  if ( ["backgrounds", "t7-backgrounds"].includes(legacyImport.sourcePack) ) return legacyImport.sourcePack;

  const compendiumSource = itemData._stats?.compendiumSource ?? "";
  if ( compendiumSource.startsWith("Compendium.n5eb.backgrounds.") ) return "backgrounds";
  if ( compendiumSource.startsWith("Compendium.n5eb.t7-backgrounds.") ) return "t7-backgrounds";
  return "";
}

/* -------------------------------------------- */

/**
 * Get source path metadata for official or Team 7 background content.
 * @param {object} itemData  Item data being migrated.
 * @returns {string}
 * @private
 */
function _getN5eBBackgroundSourcePath(itemData) {
  const legacyImport = foundry.utils.getProperty(itemData, "flags.n5eb.legacyImport") ?? {};
  return `${legacyImport.sourcePath ?? ""} ${itemData._stats?.compendiumSource ?? ""}`;
}

/* -------------------------------------------- */

/**
 * Replace obvious background display typos.
 * @param {string|undefined} value  Text value to migrate.
 * @returns {string|undefined}      Migrated value.
 * @private
 */
function _replaceN5eBBackgroundText(value) {
  if ( typeof value !== "string" ) return value;
  return N5EB_BACKGROUND_TEXT_REPLACEMENTS.reduce((text, [pattern, replacement]) => {
    return text.replace(pattern, replacement);
  }, value);
}

/* -------------------------------------------- */

/**
 * Remove imported inline text styling from background descriptions.
 * @param {string|undefined} value  Description HTML.
 * @returns {string|undefined}      Cleaned description HTML.
 * @private
 */
function _cleanN5eBBackgroundDescription(value) {
  if ( typeof value !== "string" ) return value;
  return value
    .replace(/\sstyle=(["']).*?\1/gi, "")
    .replace(/<\/?span\b[^>]*>/gi, "")
    .replace(/<\/?font\b[^>]*>/gi, "");
}

/* -------------------------------------------- */

/**
 * Migrate old imported condition Active Effects to native N5eB condition flags.
 * @param {object} effect      Effect source data.
 * @param {object} updateData  Update data.
 * @private
 */
function _migrateN5eBConditionEffect(effect, updateData) {
  const id = _getN5eBConditionId(effect);
  const config = Conditions.getConditionConfig(id);
  if ( !id || !config ) return;

  const rank = _getN5eBConditionRank(effect, id);
  const existingFlags = foundry.utils.getProperty(effect, "flags.n5eb.condition") ?? {};
  const conditionFlags = {
    ...existingFlags,
    id,
    rank,
    maxRank: config.maxRank ?? 1,
    category: config.category,
    source: "main-book"
  };
  if ( (id === "dazed") && !conditionFlags.automation?.appliedTurnKey ) {
    const automation = Conditions.getConditionAutomationData(id);
    if ( !foundry.utils.isEmpty(automation) ) conditionFlags.automation = automation;
  }
  updateData.img = config.img;
  updateData.name = Conditions.conditionName(id, rank);
  updateData.statuses = [id, ...(config.statuses ?? [])];
  updateData["flags.n5eb.condition"] = conditionFlags;
  if ( id === "exhaustion" ) updateData["flags.n5eb.exhaustionLevel"] = rank;
}

/* -------------------------------------------- */

/**
 * Resolve a condition id from old effect source data.
 * @param {object} effect  Effect source data.
 * @returns {string|null}
 * @private
 */
function _getN5eBConditionId(effect) {
  const flagged = foundry.utils.getProperty(effect, "flags.n5eb.condition.id");
  if ( flagged ) return Conditions.canonicalizeConditionId(flagged);

  for ( const status of effect.statuses ?? [] ) {
    const id = Conditions.canonicalizeConditionId(status);
    if ( Conditions.getConditionConfig(id) ) return id;
  }

  for ( const change of effect.changes ?? [] ) {
    if ( change.key !== "StatusEffect" ) continue;
    const id = Conditions.canonicalizeConditionId(change.value);
    if ( Conditions.getConditionConfig(id) ) return id;
  }

  const id = Conditions.canonicalizeConditionId(formatIdentifier(effect.name ?? ""));
  return Conditions.getConditionConfig(id) ? id : null;
}

/* -------------------------------------------- */

/**
 * Resolve a condition rank from old effect source data.
 * @param {object} effect  Effect source data.
 * @param {string} id      Condition id.
 * @returns {number}
 * @private
 */
function _getN5eBConditionRank(effect, id) {
  const flagRank = foundry.utils.getProperty(effect, "flags.n5eb.condition.rank")
    ?? foundry.utils.getProperty(effect, "flags.n5eb.exhaustionLevel");
  const nameRank = String(effect.name ?? "").match(/\b(\d+)\s*$/)?.[1];
  return Conditions.normalizeConditionRank(id, flagRank ?? nameRank ?? 1);
}

/* -------------------------------------------- */

/**
 * Decode URL path segments, preserving undecodable values.
 * @param {string} value  URL path.
 * @returns {string}      Decoded path.
 * @private
 */
function _decodeAssetPath(value) {
  return value.split("/").map(part => {
    try {
      return decodeURIComponent(part);
    } catch{
      return part;
    }
  }).join("/");
}

/* -------------------------------------------- */

/**
 * Normalize legacy N5eB asset references to their canonical raw path shape.
 * @param {string} value  Asset reference.
 * @returns {string}      Canonical reference.
 * @private
 */
function _normalizeN5eBAssetReference(value) {
  const normalized = value
    .replaceAll("&amp;", "&")
    .replace(/%5C/gi, "/")
    .replace(/%2F/gi, "/")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ");
  return _decodeAssetPath(normalized);
}

/* -------------------------------------------- */

/**
 * Rewrite N5eB custom asset references to optimized WebP content paths.
 * @param {string} value        Source text.
 * @param {object} assetPathMap Asset path migration map.
 * @returns {string}            Rewritten text.
 * @private
 */
function _rewriteN5eBAssetPaths(value, assetPathMap) {
  if ( foundry.utils.isEmpty(assetPathMap) ) return value;
  return value.replace(N5EB_ASSET_REFERENCE_RE, match =>
    assetPathMap[match] ?? assetPathMap[_normalizeN5eBAssetReference(match)] ?? match);
}

/* -------------------------------------------- */

/**
 * Rewrite legacy N5eB UUIDs and custom asset paths to their current locations.
 * @param {object} documentData     Document source data being migrated.
 * @param {object} updateData       Existing updates being applied. *Will be mutated.*
 * @param {object} migrationData    Additional data to perform the migration.
 * @param {object} [options={}]     Migration options.
 * @param {Set<string>} [options.skipKeys] Top-level keys to skip during traversal.
 * @returns {object}                Modified version of update data.
 * @private
 */
function _migrateLegacyPackUUIDs(documentData, updateData, migrationData, { skipKeys=new Set() }={}) {
  const uuidMap = migrationData?.legacyPackUuidMap ?? {};
  const assetPathMap = migrationData?.assetPathMap ?? {};
  if ( foundry.utils.isEmpty(uuidMap) && foundry.utils.isEmpty(assetPathMap) ) return updateData;

  const rewriteUuid = uuid => uuidMap[uuid] ?? _canonicalN5eBEquipmentPackUuid(uuid) ?? uuid;
  const rewrite = value => _rewriteN5eBAssetPaths(
    value.replace(LEGACY_PACK_UUID_RE, rewriteUuid).replace(N5EB_EQUIPMENT_PACK_ALIAS_UUID_RE, rewriteUuid),
    assetPathMap
  );
  const seen = new WeakSet();
  const visit = (value, path=[]) => {
    if ( typeof value === "string" ) {
      const rewritten = rewrite(value);
      if ( rewritten !== value ) updateData[path.join(".")] = rewritten;
      return;
    }

    if ( !value || (typeof value !== "object") ) return;
    if ( seen.has(value) ) return;
    seen.add(value);
    for ( const [key, child] of Object.entries(value) ) {
      if ( (path.length === 0) && skipKeys.has(key) ) continue;
      visit(child, [...path, key]);
    }
  };

  visit(documentData);
  return updateData;
}

/* -------------------------------------------- */

/**
 * Resolve a removed duplicate equipment pack UUID to the canonical old-import pack UUID.
 * @param {string} uuid  Candidate UUID.
 * @returns {string|null}
 * @private
 */
function _canonicalN5eBEquipmentPackUuid(uuid) {
  const id = _n5eBItemIdFromUuid(uuid);
  return N5EB_EQUIPMENT_PACK_ALIASES[id]?.canonicalUuid ?? null;
}

/* -------------------------------------------- */

/**
 * Migrate duplicate starter-pass pack copies to point at canonical old-import equipment packs.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBEquipmentPackAliases(itemData, updateData) {
  const alias = _getN5eBEquipmentPackAlias(itemData);
  if ( !alias ) return updateData;

  const sourceId = foundry.utils.getProperty(itemData, "flags.n5eb.sourceId");
  if ( !sourceId || alias.oldIds.includes(_n5eBItemIdFromUuid(sourceId)) ) {
    updateData["flags.n5eb.sourceId"] = alias.canonicalUuid;
  }

  const compendiumSource = itemData._stats?.compendiumSource;
  if ( compendiumSource && alias.oldIds.includes(_n5eBItemIdFromUuid(compendiumSource)) ) {
    updateData["_stats.compendiumSource"] = alias.canonicalUuid;
  }

  if ( alias.oldIdentifiers.includes(itemData.system?.identifier) ) {
    updateData["system.identifier"] = alias.identifier;
  }

  updateData["flags.n5eb.equipmentPackAliasMigrated"] = {
    version: "5.3.11",
    canonicalUuid: alias.canonicalUuid,
    oldId: alias.oldIds[0],
    migratedAt: "system-migration"
  };
  return updateData;
}

/* -------------------------------------------- */

/**
 * Find the duplicate equipment pack alias matched by this item.
 * @param {object} itemData  Item data being migrated.
 * @returns {object|null}
 * @private
 */
function _getN5eBEquipmentPackAlias(itemData) {
  if ( itemData.type && (itemData.type !== "container") ) return null;

  const sourceId = foundry.utils.getProperty(itemData, "flags.n5eb.sourceId")
    ?? foundry.utils.getProperty(itemData, "flags.n5eb.legacyImport.sourceId");
  const compendiumSource = itemData._stats?.compendiumSource;
  const candidates = new Set([
    itemData._id,
    _n5eBItemIdFromUuid(sourceId),
    _n5eBItemIdFromUuid(compendiumSource)
  ].filter(Boolean));

  for ( const alias of Object.values(N5EB_EQUIPMENT_PACK_ALIASES) ) {
    if ( alias.oldIds.some(id => candidates.has(id)) ) return alias;
    if ( alias.oldIdentifiers.includes(itemData.system?.identifier) ) return alias;
  }

  return null;
}

/* -------------------------------------------- */

/**
 * Extract an item ID from a UUID-like value.
 * @param {string} value  UUID or ID.
 * @returns {string|null}
 * @private
 */
function _n5eBItemIdFromUuid(value) {
  if ( !value ) return null;
  return `${value}`.split(".").at(-1);
}

/* -------------------------------------------- */

/**
 * Migrate actor-local downtime cost state to the structured pricing and ledger shape.
 * @param {object} actorData   Actor data being migrated.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateActorDowntimeCosts(actorData, updateData) {
  const activities = actorData.system?.downtime?.activities;
  if ( !Array.isArray(activities) ) return updateData;

  let changed = false;
  const migrated = activities.map(activity => {
    const copy = foundry.utils.deepClone(activity);
    const before = JSON.stringify(copy.cost ?? {});
    _migrateDowntimeActivityCost(copy);
    if ( before !== JSON.stringify(copy.cost ?? {}) ) changed = true;
    return copy;
  });

  if ( changed ) updateData["system.downtime.activities"] = migrated;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate downtime template item cost data.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateDowntimeTemplateCost(itemData, updateData) {
  if ( itemData.type !== "downtime" ) return updateData;
  const source = { cost: foundry.utils.deepClone(itemData.system?.cost ?? {}) };
  const before = JSON.stringify(source.cost);
  _migrateDowntimeActivityCost(source);
  delete source.cost.paid;
  delete source.cost.ledger;
  if ( before !== JSON.stringify(source.cost) ) {
    for ( const [key, value] of Object.entries(source.cost) ) updateData[`system.cost.${key}`] = value;
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single downtime activity's cost data.
 * @param {object} activity  Downtime activity source.
 * @private
 */
function _migrateDowntimeActivityCost(activity) {
  activity.cost ??= {};
  const cost = activity.cost;
  cost.value ??= 0;
  cost.denomination ||= "ryo";
  cost.per ||= "activity";
  cost.paid ??= false;
  const legacyMode = cost.per === "week" ? "per-week" : (cost.value ? "fixed" : "none");
  cost.mode ||= legacyMode;
  cost.due ||= cost.mode === "per-week" ? "weekly" : (cost.mode === "none" ? "manual" : "completion");
  cost.fixed ??= cost.per === "activity" ? _finiteNumber(cost.value) : 0;
  cost.perWeek ??= cost.per === "week" ? _finiteNumber(cost.value) : 0;
  cost.manualTotal ??= 0;
  cost.dueAmount ??= 0;
  cost.rank ??= "";
  cost.rankTable ??= {};
  for ( const rank of ["e", "d", "c", "b", "a", "s"] ) cost.rankTable[rank] ??= 0;
  cost.override ??= false;
  cost.reason ??= "";
  cost.note ??= "";
  cost.ledger = Array.isArray(cost.ledger) ? cost.ledger : [];
  for ( const entry of cost.ledger ) _migrateDowntimeLedgerEntry(entry);

  if ( cost.paid && !cost.ledger.length ) {
    const amount = _getLegacyDowntimeDue(activity);
    if ( amount > 0 ) cost.ledger.push({
      _id: foundry.utils.randomID(),
      type: "payment",
      amount,
      note: "Migrated from the legacy paid downtime flag.",
      user: "",
      userName: "Migration",
      timestamp: "",
      deducted: false
    });
  }
}

/* -------------------------------------------- */

/**
 * Migrate a downtime ledger entry.
 * @param {object} entry  Ledger entry.
 * @private
 */
function _migrateDowntimeLedgerEntry(entry) {
  entry._id ||= foundry.utils.randomID();
  entry.type ||= "payment";
  entry.amount ??= 0;
  entry.note ??= "";
  entry.user ??= "";
  entry.userName ??= "";
  entry.timestamp ??= "";
  entry.deducted ??= false;
}

/* -------------------------------------------- */

/**
 * Calculate the old paid flag settlement amount.
 * @param {object} activity  Downtime activity source.
 * @returns {number}
 * @private
 */
function _getLegacyDowntimeDue(activity) {
  const value = Math.max(0, _finiteNumber(activity.cost?.value));
  if ( !value ) return 0;
  if ( activity.cost?.per === "week" ) return value * Math.max(0, _finiteNumber(activity.progress?.value));
  return value;
}

/* -------------------------------------------- */

/**
 * Migrate held currency from D&D coins to a single Ryo denomination.
 * @param {object} systemData  System data containing a currency object.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateRyoCurrency(systemData, updateData) {
  const currency = systemData?.currency;
  if ( !currency ) return updateData;

  const hasRyo = Object.hasOwn(currency, "ryo");
  const hasLegacy = LEGACY_CURRENCY_KEYS.some(key => Object.hasOwn(currency, key));
  if ( !hasRyo && !hasLegacy ) return updateData;

  updateData["system.currency.ryo"] = hasRyo
    ? Math.round(_finiteNumber(currency.ryo))
    : Math.round(LEGACY_CURRENCY_KEYS.reduce((total, key) =>
      total + (_finiteNumber(currency[key]) / LEGACY_CURRENCY_CONVERSIONS[key]), 0));

  for ( const key of Object.keys(currency) ) {
    if ( key !== "ryo" ) updateData[`system.currency.-=${key}`] = null;
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a price denomination from legacy D&D coins to Ryo.
 * @param {object} price       Price data.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @param {string} path        Update path to the price data.
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateCurrencyDenomination(price, updateData, path) {
  const conversion = LEGACY_CURRENCY_CONVERSIONS[price?.denomination];
  if ( !conversion ) return updateData;
  updateData[`${path}.value`] = Math.round(_finiteNumber(price.value) / conversion);
  updateData[`${path}.denomination`] = "ryo";
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate physical item weight data to N5eB Bulk units.
 * @param {object} systemData  Item system data.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @param {string} path        Update path to the system data.
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateBulkWeight(systemData, updateData, path) {
  if ( !systemData ) return updateData;

  const weight = systemData.weight;
  if ( Object.hasOwn(systemData, "weight") ) {
    if ( foundry.utils.getType(weight) === "Object" ) {
      if ( weight.units !== "bulk" ) updateData[`${path}.weight.units`] = "bulk";
      if ( !Number.isNumeric(weight.value) ) updateData[`${path}.weight.value`] = 0;
    } else {
      updateData[`${path}.weight`] = {
        value: Number.isNumeric(weight) ? Number(weight) : 0,
        units: "bulk"
      };
    }
  }

  const capacityWeight = systemData.capacity?.weight;
  if ( foundry.utils.getType(capacityWeight) === "Object" ) {
    if ( capacityWeight.units !== "bulk" ) updateData[`${path}.capacity.weight.units`] = "bulk";
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Convert early N5eB physical container content from loot/equipment to real container items.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBContainerItem(itemData, updateData) {
  const config = N5EB_CONTAINER_ITEM_MIGRATIONS[itemData.system?.identifier];
  if ( !config ) return updateData;

  const system = itemData.system ?? {};
  if ( itemData.type !== "container" ) updateData.type = "container";

  for ( const key of N5EB_CONTAINER_STALE_SYSTEM_KEYS ) {
    if ( Object.hasOwn(system, key) ) updateData[`system.-=${key}`] = null;
  }

  if ( (itemData.type !== "container") || foundry.utils.isEmpty(system.capacity ?? {}) ) {
    updateData["system.capacity"] = foundry.utils.deepClone(config.capacity);
  }

  if ( !Number.isNumeric(system.currency?.ryo) ) updateData["system.currency.ryo"] = config.currency;

  if ( config.properties?.length ) {
    const current = new Set(system.properties ?? []);
    const properties = new Set([...current, ...config.properties]);
    if ( properties.size !== current.size ) updateData["system.properties"] = Array.from(properties);
  }

  if ( !Object.hasOwn(system, "attunement") ) updateData["system.attunement"] = "";
  if ( !Object.hasOwn(system, "equipped") ) updateData["system.equipped"] = false;
  if ( !Object.hasOwn(system, "attuned") ) updateData["system.attuned"] = false;
  if ( !Object.hasOwn(system, "rarity") ) updateData["system.rarity"] = "";

  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate N5eB armor and enhancement seal metadata.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBArmorAndSeals(itemData, updateData) {
  Seals.migrateArmorSourceData(itemData, updateData);
  Seals.migrateSealSourceData(itemData, updateData);
  return updateData;
}

/* -------------------------------------------- */

/**
 * Apply high-confidence book parity corrections to item copies that still match stale source data.
 * @param {object} itemData       Item data being migrated.
 * @param {object} updateData     Existing updates being applied. *Will be mutated.*
 * @param {object} migrationData  Additional data to perform the migration.
 * @returns {object}              Modified version of update data.
 * @private
 */
function _migrateN5eBBookParityFixes(itemData, updateData, migrationData) {
  const fixes = migrationData?.bookParityFixes ?? [];
  if ( !fixes.length ) return updateData;

  for ( const fix of fixes ) {
    if ( !_matchesN5eBBookParityFix(itemData, fix) ) continue;

    const oldValues = {};
    for ( const change of fix.changes ?? [] ) {
      const current = foundry.utils.getProperty(itemData, change.path);
      if ( !_isN5eBBookParityStaleValue(current, change.from) ) continue;
      updateData[change.path] = foundry.utils.deepClone(change.to);
      oldValues[_bookParityFlagKey(change.path)] = foundry.utils.deepClone(current);
    }

    if ( foundry.utils.isEmpty(oldValues) ) continue;
    updateData["flags.n5eb.bookParityFix.version"] = N5EB_BOOK_PARITY_FIX_VERSION;
    updateData["flags.n5eb.bookParityFix.sourceId"] = fix.sourceId;
    updateData["flags.n5eb.bookParityFix.sourcePath"] = fix.sourcePath;
    updateData["flags.n5eb.bookParityFix.migratedAt"] = "system-migration";
    for ( const [key, value] of Object.entries(oldValues) ) {
      updateData[`flags.n5eb.bookParityFix.oldValues.${key}`] = value;
    }
  }

  return updateData;
}

/* -------------------------------------------- */

/**
 * Does an item match a book parity fix rule.
 * @param {object} itemData  Item data being migrated.
 * @param {object} fix       Book parity fix data.
 * @returns {boolean}
 * @private
 */
function _matchesN5eBBookParityFix(itemData, fix) {
  if ( fix.type && (itemData.type !== fix.type) ) return false;
  if ( itemData._id === fix.sourceId ) return true;

  const compendiumSource = itemData._stats?.compendiumSource ?? "";
  if ( compendiumSource.endsWith(`.${fix.sourceId}`) || compendiumSource.includes(`Item.${fix.sourceId}`) ) {
    return true;
  }

  const identifier = itemData.system?.identifier;
  if ( identifier && (fix.identifiers ?? []).includes(identifier) ) return true;

  return Boolean(itemData.name && (fix.names ?? []).includes(itemData.name));
}

/* -------------------------------------------- */

/**
 * Is a current value still exactly the stale audited value.
 * @param {*} current  Current document value.
 * @param {*} stale    Stale source value from the fix map.
 * @returns {boolean}
 * @private
 */
function _isN5eBBookParityStaleValue(current, stale) {
  if ( stale === undefined ) return ["", null, undefined].includes(current);
  if ( Array.isArray(current) || Array.isArray(stale) ) return _sameN5eBBookParityArray(current, stale);
  if ( Number.isNumeric(current) && Number.isNumeric(stale) ) return Number(current) === Number(stale);
  if ( (foundry.utils.getType(current) === "Object") || (foundry.utils.getType(stale) === "Object") ) {
    return JSON.stringify(current) === JSON.stringify(stale);
  }
  return (current === stale) || (`${current}` === `${stale}`);
}

/* -------------------------------------------- */

/**
 * Compare two arrays as exact sets.
 * @param {*} current  Current document value.
 * @param {*} stale    Stale source value from the fix map.
 * @returns {boolean}
 * @private
 */
function _sameN5eBBookParityArray(current, stale) {
  if ( !Array.isArray(current) || !Array.isArray(stale) ) return false;
  if ( current.length !== stale.length ) return false;
  const currentValues = new Set(current.map(value => JSON.stringify(value)));
  return stale.every(value => currentValues.has(JSON.stringify(value)));
}

/* -------------------------------------------- */

/**
 * Convert a document path to a stable flag key.
 * @param {string} path  Document path.
 * @returns {string}
 * @private
 */
function _bookParityFlagKey(path) {
  return path.replace(/[^A-Za-z0-9]/g, "_");
}

/* -------------------------------------------- */

/**
 * Migrate actor-level vehicle weight fields to N5eB Bulk units.
 * @param {object} systemData  Actor system data.
 * @param {object} updateData  Existing updates being applied. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateActorBulkWeight(systemData, updateData) {
  if ( systemData?.attributes?.capacity?.cargo?.units && (systemData.attributes.capacity.cargo.units !== "bulk") ) {
    updateData["system.attributes.capacity.cargo.units"] = "bulk";
  }
  if ( systemData?.traits?.weight?.units && (systemData.traits.weight.units !== "bulk") ) {
    updateData["system.traits.weight.units"] = "bulk";
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Backfill missing Chakra advancement values on class items that already had HP advancement applied.
 * @param {object} actorData       Actor source data being migrated.
 * @param {object} itemData        Embedded item source data being migrated.
 * @param {object} itemUpdate      Existing embedded item update data. *Will be mutated.*
 * @param {object} actorUpdate     Existing actor update data. *Will be mutated.*
 * @private
 */
function _migrateClassChakraAdvancement(actorData, itemData, itemUpdate, actorUpdate) {
  if ( (actorData.type !== "character") || (itemData.type !== "class") ) return;
  if ( actorData.system?.details?.originalClass !== itemData._id ) return;
  if ( Number(itemData.system?.levels ?? 0) < 1 ) return;

  const advancement = _getAdvancementEntries(itemData.system?.advancement);
  const hp = advancement.find(entry => entry?.type === "HitPoints");
  const chakra = advancement.find(entry => ["Chakra", "ChakraPoints"].includes(entry?.type));
  if ( !chakra?._id ) return;

  if ( chakra.type === "ChakraPoints" ) itemUpdate[`system.advancement.${chakra._id}.type`] = "Chakra";
  if ( chakra.value?.[1] !== undefined ) return;

  const chakraState = actorData.system?.attributes?.chakra ?? {};
  const hpWasApplied = hp?.value?.[1] !== undefined;
  const staleZeroChakra = [undefined, null, 0].includes(chakraState.max)
    && [undefined, null, 0].includes(chakraState.value);
  if ( !hpWasApplied && !staleZeroChakra ) return;

  itemUpdate[`system.advancement.${chakra._id}.value.1`] = "max";
  itemUpdate["flags.n5eb.chakraAdvancementFix.level1"] = "max";
  itemUpdate["flags.n5eb.chakraAdvancementFix.migratedAt"] = "system-migration";

  if ( chakraState.max === 0 ) actorUpdate["system.attributes.chakra.max"] = null;
  if ( staleZeroChakra ) actorUpdate["system.attributes.chakra.value"] = _getInitialClassChakra(actorData, itemData);
}

/* -------------------------------------------- */

/**
 * Get advancement entries from either old array storage or current object storage.
 * @param {object[]|object} advancement  Advancement source data.
 * @returns {object[]}                   Advancement entries.
 * @private
 */
function _getAdvancementEntries(advancement) {
  if ( Array.isArray(advancement) ) return advancement;
  if ( foundry.utils.getType(advancement) === "Object" ) return Object.values(advancement);
  return [];
}

/* -------------------------------------------- */

/**
 * Calculate the initial Chakra value for a class at level 1.
 * @param {object} actorData  Actor source data.
 * @param {object} itemData   Class item source data.
 * @returns {number}          Initial Chakra value.
 * @private
 */
function _getInitialClassChakra(actorData, itemData) {
  const die = String(itemData.system?.cd?.denomination ?? itemData.system?.chakraDice ?? "d0");
  const dieValue = Number(die.match(/\d+/)?.[0] ?? 0);
  const ability = CONFIG.DND5E.defaultAbilities?.chakraPoints ?? "con";
  const score = Number(actorData.system?.abilities?.[ability]?.value ?? 10);
  const mod = Math.floor((score - 10) / 2);
  return Math.max(dieValue + mod, 1);
}

/* -------------------------------------------- */

/**
 * Identify effects that might have been duplicated when legacyTransferral was disabled.
 * @param {object} parent   Data of the actor being migrated.
 * @returns {Set<string>}   IDs of effects to delete from the actor.
 * @private
 */
function _duplicatedEffects(parent) {
  const deleteIds = new Set();
  for ( const item of parent.items ) {
    for ( const effect of item.effects ?? [] ) {
      if ( !effect.transfer ) continue;
      const match = parent.effects.find(t => {
        const diff = foundry.utils.diffObject(t, effect);
        return t.origin?.endsWith(`Item.${item._id}`) && !("changes" in diff) && !deleteIds.has(t._id);
      });
      if ( match ) deleteIds.add(match._id);
    }
  }
  return deleteIds;
}

/* -------------------------------------------- */

/**
 * Restore high-risk legacy N5eB actor fields from the preserved pre-cleanup source snapshot.
 * @param {object} actorData   Actor source data being migrated.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateLegacyN5eBActorData(actorData, updateData) {
  const original = foundry.utils.getProperty(actorData, "flags.n5eb.legacyMigration.originalSystem");
  if ( foundry.utils.getType(original) !== "Object" ) return updateData;

  const oldCP = original.attributes?.cp;
  if ( foundry.utils.getType(oldCP) === "Object" ) {
    const chakra = foundry.utils.mergeObject(actorData.system?.attributes?.chakra ?? {}, oldCP, { inplace: false });
    chakra.formula ??= "";
    updateData["system.attributes.chakra"] = chakra;
    updateData["system.attributes.-=cp"] = null;
  }

  const oldChakraSight = original.attributes?.senses?.chakrasight;
  if ( oldChakraSight !== undefined ) {
    const chakraSightPath = "system.attributes.senses.ranges.chakrasight";
    if ( foundry.utils.getProperty(actorData, chakraSightPath) === undefined ) {
      updateData[chakraSightPath] = oldChakraSight;
    }
    updateData["system.attributes.senses.-=chakrasight"] = null;
  }

  const oldSpellcasting = original.attributes?.spellcasting;
  if ( foundry.utils.getType(oldSpellcasting) === "Object" ) {
    for ( const key of ["ninjutsu", "genjutsu", "taijutsu"] ) {
      const ability = oldSpellcasting[key];
      if ( ability ) updateData[`system.attributes.jutsu.${key}.ability`] = ability;
    }
  } else if ( oldSpellcasting && !actorData.system?.attributes?.spellcasting ) {
    updateData["system.attributes.spellcasting"] = oldSpellcasting;
  }

  const oldChakraDie = original.resources?.chakradie;
  const tertiary = actorData.system?.resources?.tertiary;
  if ( foundry.utils.getType(oldChakraDie) === "Object" && _isEmptyLegacyResource(tertiary) ) {
    updateData["system.resources.tertiary"] = foundry.utils.deepClone(oldChakraDie);
    updateData["system.resources.-=chakradie"] = null;
  }

  return updateData;
}

/* -------------------------------------------- */

/**
 * Determine whether a resource slot is effectively empty.
 * @param {object} resource  Resource source data.
 * @returns {boolean}
 * @private
 */
function _isEmptyLegacyResource(resource) {
  if ( !resource ) return true;
  const label = `${resource.label ?? ""}`.trim();
  const value = Number(resource.value ?? 0);
  const max = Number(resource.max ?? 0);
  const lr = Boolean(resource.lr);
  const sr = Boolean(resource.sr);
  return !label && !value && !max && !lr && !sr;
}

/* -------------------------------------------- */

/**
 * Migrate the actor attributes.ac.value to the new ac.flat override field.
 * @param {object} actorData   Actor data being migrated.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateActorAC(actorData, updateData) {
  const ac = actorData.system?.attributes?.ac;
  // If the actor has a numeric ac.value, then their AC has not been migrated to the auto-calculation schema yet.
  if ( Number.isNumeric(ac?.value) ) {
    updateData["system.attributes.ac.flat"] = parseInt(ac.value);
    updateData["system.attributes.ac.calc"] = actorData.type === "npc" ? "natural" : "flat";
    updateData["system.attributes.ac.-=value"] = null;
    return updateData;
  }

  // Migrate ac.base in custom formulas to ac.armor
  if ( (typeof ac?.formula === "string") && ac?.formula.includes("@attributes.ac.base") ) {
    updateData["system.attributes.ac.formula"] = ac.formula.replaceAll("@attributes.ac.base", "@attributes.ac.armor");
  }

  // Protect against string values created by character sheets or importers that don't enforce data types
  if ( (typeof ac?.flat === "string") && Number.isNumeric(ac.flat) ) {
    updateData["system.attributes.ac.flat"] = parseInt(ac.flat);
  }

  // Remove invalid AC formula strings.
  if ( ac?.formula ) {
    try {
      const roll = new Roll(ac.formula);
      roll.evaluateSync();
    } catch( e ) {
      updateData["system.attributes.ac.formula"] = "";
    }
  }

  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate the actor flags that have been deprecated.
 * @param {object} actorData   Actor data being migrated.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateActorFlags(actorData, updateData) {
  const initiativeAdv = foundry.utils.getProperty(actorData, "flags.n5eb.initiativeAdv");
  if ( initiativeAdv ) {
    const key = "system.attributes.init.roll.mode";
    updateData[key] = Math.min(1, (foundry.utils.getProperty(actorData, key) ?? 0) + 1);
    updateData["flags.n5eb.-=initiativeAdv"] = null;
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate the actor movement & senses to replace `0` with `null`.
 * @param {object} actorData   Actor data being migrated.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateActorMovementSenses(actorData, updateData) {
  const oldChakraSight = foundry.utils.getProperty(actorData, "system.attributes.senses.chakrasight");
  if ( oldChakraSight !== undefined ) {
    const chakraSightPath = "system.attributes.senses.ranges.chakrasight";
    if ( foundry.utils.getProperty(actorData, chakraSightPath) === undefined ) {
      updateData[chakraSightPath] = oldChakraSight;
    }
    updateData["system.attributes.senses.-=chakrasight"] = null;
  }

  if ( actorData._stats?.systemVersion && foundry.utils.isNewerVersion("2.4.0", actorData._stats.systemVersion) ) {
    for ( const key of Object.keys(CONFIG.DND5E.movementTypes) ) {
      const keyPath = `system.attributes.movement.${key}`;
      if ( foundry.utils.getProperty(actorData, keyPath) === 0 ) updateData[keyPath] = null;
    }
    for ( const key of Object.keys(CONFIG.DND5E.senses) ) {
      const keyPath = `system.attributes.senses.ranges.${key}`;
      if ( foundry.utils.getProperty(actorData, keyPath) === 0 ) updateData[keyPath] = null;
    }
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate legacy combined skill/tool proficiency values to split Mastery data.
 * @param {object} actorData   Actor data being migrated.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateActorSkillToolMastery(actorData, updateData) {
  for ( const type of ["skills", "tools"] ) {
    for ( const [key, data] of Object.entries(actorData.system?.[type] ?? {}) ) {
      const value = Number(data.value ?? 0);
      if ( value < 2 ) {
        if ( data.mastery === undefined ) updateData[`system.${type}.${key}.mastery`] = 0;
        continue;
      }

      updateData[`system.${type}.${key}.value`] = 1;
      updateData[`system.${type}.${key}.mastery`] = Math.min(
        Math.max(Math.floor(value - 1), Number(data.mastery ?? 0), 1), 3
      );
    }
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Convert old N5eB non-proficient save defaults to the book baseline of half proficiency.
 * @param {object} actorData   Actor data being migrated.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @param {object} flags       Migration flags.
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBHalfSaveDefaults(actorData, updateData, flags={}) {
  const sourceVersion = actorData._stats?.systemVersion ?? "0";
  if ( !flags.bypassVersionCheck && !foundry.utils.isNewerVersion("5.3.20", sourceVersion) ) return updateData;

  for ( const [ability, data] of Object.entries(actorData.system?.abilities ?? {}) ) {
    if ( Number(data.proficient ?? 0) === 0 ) updateData[`system.abilities.${ability}.proficient`] = 0.5;
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate N5eB toolkit actor proficiency keys away from the D&D Artisan's Tools category.
 * @param {object} actorData   Actor data being migrated.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBActorToolKits(actorData, updateData) {
  const tools = actorData.system?.tools;
  if ( !tools ) return updateData;

  for ( const [oldKey, newKey] of Object.entries(N5EB_KIT_BASE_ITEM_MIGRATIONS) ) {
    _migrateN5eBActorToolKey(tools, oldKey, newKey, updateData);
  }

  const isN5eBActor = _documentUsesN5eB(actorData) || (actorData.items ?? []).some(item => _documentUsesN5eB(item));
  if ( isN5eBActor ) {
    _migrateN5eBActorToolKey(tools, "art", "kit", updateData);
    for ( const oldKey of N5EB_OBSOLETE_TOOL_KEYS ) _removeN5eBActorToolKey(tools, oldKey, updateData);
  }

  const overrides = foundry.utils.getProperty(actorData, "flags.n5eb.masteryOverride.tools") ?? {};
  for ( const [oldKey, newKey] of Object.entries(N5EB_KIT_BASE_ITEM_MIGRATIONS) ) {
    _migrateN5eBActorToolOverride(overrides, oldKey, newKey, updateData);
  }
  if ( isN5eBActor ) {
    _migrateN5eBActorToolOverride(overrides, "art", "kit", updateData);
    for ( const oldKey of N5EB_OBSOLETE_TOOL_KEYS ) _removeN5eBActorToolOverride(overrides, oldKey, updateData);
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Move an actor tool proficiency from one key to another.
 * @param {object} tools       Source actor tools data.
 * @param {string} oldKey      Current tool key.
 * @param {string} newKey      New tool key.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @private
 */
function _migrateN5eBActorToolKey(tools, oldKey, newKey, updateData) {
  if ( oldKey === newKey ) return;
  if ( !Object.hasOwn(tools, oldKey) ) return;

  const source = _normalizeN5eBToolData(tools[oldKey], newKey);
  const existing = tools[newKey] ? _normalizeN5eBToolData(tools[newKey], newKey) : null;
  updateData[`system.tools.${newKey}`] = existing ? _mergeN5eBToolData(existing, source, newKey) : source;
  updateData[`system.tools.-=${oldKey}`] = null;
  _deleteN5eBKitToolUpdates(updateData, oldKey);
}

/* -------------------------------------------- */

/**
 * Remove an obsolete N5eB actor tool proficiency.
 * @param {object} tools       Source actor tools data.
 * @param {string} oldKey      Current tool key.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @private
 */
function _removeN5eBActorToolKey(tools, oldKey, updateData) {
  if ( !Object.hasOwn(tools, oldKey) ) return;
  updateData[`system.tools.-=${oldKey}`] = null;
  _deleteN5eBKitToolUpdates(updateData, oldKey);
}

/* -------------------------------------------- */

/**
 * Migrate a manual Mastery override flag from one tool key to another.
 * @param {object} overrides   Source actor override data.
 * @param {string} oldKey      Current tool key.
 * @param {string} newKey      New tool key.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @private
 */
function _migrateN5eBActorToolOverride(overrides, oldKey, newKey, updateData) {
  if ( oldKey === newKey ) return;
  if ( !Object.hasOwn(overrides, oldKey) ) return;
  if ( !Object.hasOwn(overrides, newKey) ) {
    updateData[`flags.n5eb.masteryOverride.tools.${newKey}`] = overrides[oldKey];
  }
  updateData[`flags.n5eb.masteryOverride.tools.-=${oldKey}`] = null;
}

/* -------------------------------------------- */

/**
 * Remove an obsolete manual Mastery override flag.
 * @param {object} overrides   Source actor override data.
 * @param {string} oldKey      Current tool key.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @private
 */
function _removeN5eBActorToolOverride(overrides, oldKey, updateData) {
  if ( !Object.hasOwn(overrides, oldKey) ) return;
  updateData[`flags.n5eb.masteryOverride.tools.-=${oldKey}`] = null;
}

/* -------------------------------------------- */

/**
 * Normalize migrated skill/tool data to the split proficiency and Mastery format.
 * @param {object} data     Skill or tool data.
 * @param {string} toolKey  New tool key.
 * @returns {object}
 * @private
 */
function _normalizeN5eBToolData(data, toolKey) {
  const migrated = foundry.utils.deepClone(data ?? {});
  const value = Number(migrated.value ?? 0);
  const mastery = Number(migrated.mastery ?? 0);

  if ( value >= 2 ) {
    migrated.value = 1;
    migrated.mastery = Math.min(Math.max(Math.floor(value - 1), mastery, 1), 3);
  } else {
    migrated.value = value;
    migrated.mastery = mastery;
  }

  migrated.ability ||= CONFIG.DND5E.tools[toolKey]?.ability ?? "int";
  return migrated;
}

/* -------------------------------------------- */

/**
 * Merge two actor tool data records.
 * @param {object} target   Existing tool data.
 * @param {object} source   Migrated tool data.
 * @param {string} toolKey  New tool key.
 * @returns {object}
 * @private
 */
function _mergeN5eBToolData(target, source, toolKey) {
  const merged = foundry.utils.deepClone(target);
  merged.value = Math.max(Number(target.value ?? 0), Number(source.value ?? 0));
  merged.mastery = Math.max(Number(target.mastery ?? 0), Number(source.mastery ?? 0));
  merged.ability ||= source.ability ?? CONFIG.DND5E.tools[toolKey]?.ability ?? "int";
  if ( !merged.bonuses && source.bonuses ) merged.bonuses = foundry.utils.deepClone(source.bonuses);
  return merged;
}

/* -------------------------------------------- */

/**
 * Remove stale updates for a migrated old tool key.
 * @param {object} updateData  Existing updates being applied to actor. *Will be mutated.*
 * @param {string} oldKey      Current tool key.
 * @private
 */
function _deleteN5eBKitToolUpdates(updateData, oldKey) {
  const prefix = `system.tools.${oldKey}`;
  for ( const key of Object.keys(updateData) ) {
    if ( (key === prefix) || key.startsWith(`${prefix}.`) ) delete updateData[key];
  }
}

/* -------------------------------------------- */

/**
 * Migrate legacy combined tool item proficiency values to split Mastery data.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateToolItemMastery(itemData, updateData) {
  if ( itemData.type !== "tool" ) return updateData;
  const value = Number(itemData.system?.proficient ?? 0);
  if ( value < 2 ) {
    if ( itemData.system?.mastery === undefined ) updateData["system.mastery"] = 0;
    return updateData;
  }

  updateData["system.proficient"] = 1;
  updateData["system.mastery"] = Math.min(
    Math.max(Math.floor(value - 1), Number(itemData.system?.mastery ?? 0), 1), 3
  );
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate N5eB toolkit items away from the D&D Artisan's Tools category.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBToolKitItem(itemData, updateData) {
  if ( itemData.type !== "tool" ) return updateData;
  const baseItem = _getN5eBKitBaseItem(itemData);
  if ( !baseItem ) return updateData;

  if ( itemData.system?.type?.value !== "kit" ) updateData["system.type.value"] = "kit";
  if ( itemData.system?.type?.baseItem !== baseItem ) updateData["system.type.baseItem"] = baseItem;
  if ( !itemData.system?.ability && CONFIG.DND5E.tools[baseItem]?.ability ) {
    updateData["system.ability"] = CONFIG.DND5E.tools[baseItem].ability;
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate N5eB trait advancement entries from `tool:art` to `tool:kit`.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBKitTraitChoices(itemData, updateData) {
  if ( !_documentUsesN5eB(itemData) ) return updateData;
  const advancement = itemData.system?.advancement;
  if ( !Array.isArray(advancement) ) return updateData;
  const { value, changed } = _migrateN5eBKitTraitValue(advancement);
  if ( changed ) updateData["system.advancement"] = value;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Get the new N5eB toolkit base item key for a tool item.
 * @param {object} itemData  Item data being migrated.
 * @returns {string|null}
 * @private
 */
function _getN5eBKitBaseItem(itemData) {
  const system = itemData.system ?? {};
  const baseItem = system.type?.baseItem;
  if ( N5EB_KIT_BASE_ITEMS.has(baseItem) ) return baseItem;
  if ( baseItem in N5EB_KIT_BASE_ITEM_MIGRATIONS ) return N5EB_KIT_BASE_ITEM_MIGRATIONS[baseItem];
  if ( !_documentUsesN5eB(itemData) ) return null;

  const identifier = system.identifier || formatIdentifier(itemData.name ?? "");
  return _getN5eBKitBaseItemFromIdentifier(identifier);
}

/* -------------------------------------------- */

/**
 * Get the new N5eB toolkit base item key from an item identifier.
 * @param {string} identifier  Item identifier.
 * @returns {string|null}
 * @private
 */
function _getN5eBKitBaseItemFromIdentifier(identifier) {
  if ( !identifier ) return null;
  if ( identifier in N5EB_KIT_IDENTIFIER_BASE_ITEMS ) return N5EB_KIT_IDENTIFIER_BASE_ITEMS[identifier];
  const baseIdentifier = identifier.replace(N5EB_KIT_QUALITY_RE, "");
  return N5EB_KIT_IDENTIFIER_BASE_ITEMS[baseIdentifier] ?? null;
}

/* -------------------------------------------- */

/**
 * Migrate N5eB toolkit trait keys inside arbitrary advancement data.
 * @param {unknown} value  Value being migrated.
 * @returns {{value: unknown, changed: boolean}}
 * @private
 */
function _migrateN5eBKitTraitValue(value) {
  if ( typeof value === "string" ) {
    const migrated = _migrateN5eBKitTraitKey(value);
    return { value: migrated, changed: migrated !== value, remove: migrated === null };
  }

  if ( Array.isArray(value) ) {
    let changed = false;
    const migrated = [];
    for ( const entry of value ) {
      const result = _migrateN5eBKitTraitValue(entry);
      changed ||= result.changed;
      if ( result.remove ) continue;
      migrated.push(result.value);
    }
    return { value: migrated, changed };
  }

  if ( !value || (typeof value !== "object") ) return { value, changed: false };
  let changed = false;
  const migrated = {};
  for ( const [key, entry] of Object.entries(value) ) {
    const result = _migrateN5eBKitTraitValue(entry);
    changed ||= result.changed;
    if ( result.remove ) continue;
    migrated[key] = result.value;
  }
  return { value: migrated, changed };
}

/* -------------------------------------------- */

/**
 * Migrate one N5eB toolkit trait key.
 * @param {string} key  Trait key.
 * @returns {string}
 * @private
 */
function _migrateN5eBKitTraitKey(key) {
  if ( key === "tool:art" ) return "tool:kit";
  if ( key === "tool:art:*" ) return "tool:kit:*";
  if ( key.match(/^tool:(?:game|music|vehicle)(?::.*)?$/) ) return null;

  const match = key.match(/^tool:art:([^:]+)$/);
  if ( !match ) return key;
  const baseItem = N5EB_KIT_BASE_ITEM_MIGRATIONS[match[1]];
  return baseItem ? `tool:kit:${baseItem}` : null;
}

/* -------------------------------------------- */

/**
 * Migrate legacy N5eB jutsu chakra scaling into structured v14 fields.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateJutsuChakraScaling(itemData, updateData) {
  if ( itemData.type !== "spell" ) return updateData;
  const system = itemData.system ?? {};
  if ( system.chakra?.scaling?.mode ) {
    if ( system.chakraScaling !== undefined ) updateData["system.-=chakraScaling"] = null;
    return updateData;
  }

  const original = foundry.utils.getProperty(itemData, "flags.n5eb.legacyMigration.originalSystem.chakraScaling")
    ?? foundry.utils.getProperty(itemData, "flags.n5eb.legacyImport.originalSystem.chakraScaling");
  const legacy = system.chakraScaling ?? original ?? _parseLegacyChakraScaling(system.chakra?.special);
  const mode = `${legacy?.mode ?? ""}`.toLowerCase();
  const value = Number(legacy?.value ?? 0);
  if ( (mode === "level") && Number.isFinite(value) && (value > 0) ) {
    updateData["system.chakra.scaling.mode"] = "rank";
    updateData["system.chakra.scaling.value"] = Math.floor(value);
    if ( _isLegacyChakraScalingNote(system.chakra?.special) ) updateData["system.chakra.special"] = "";
  } else {
    updateData["system.chakra.scaling.mode"] = "none";
    updateData["system.chakra.scaling.value"] = 0;
    if ( (mode === "none") && Number.isFinite(value) && (value > 0) ) {
      updateData["system.chakra.special"] = `Legacy chakra scaling value ${value} was marked none.`;
    } else if ( _isLegacyChakraScalingNote(system.chakra?.special) ) {
      updateData["system.chakra.special"] = "";
    }
  }
  if ( system.chakraScaling !== undefined ) updateData["system.-=chakraScaling"] = null;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate imported classmod Arts formulas and color into the active v14 fields.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @returns {object}           Modified version of update data.
 * @private
 */
function _migrateN5eBClassmodArts(itemData, updateData) {
  if ( itemData.type !== "classmod" ) return updateData;
  const system = itemData.system ?? {};
  if ( !/^#[0-9a-f]{6}$/i.test(system.color) ) updateData["system.color"] = DEFAULT_CLASSMOD_ARTS_COLOR;

  _migrateN5eBClassmodFormulaBlock(itemData, updateData, "save", "oldSaveFormula");
  _migrateN5eBClassmodFormulaBlock(itemData, updateData, "attackBonus", "oldAttackBonusFormula");
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single classmod formula block.
 * @param {object} itemData    Item data being migrated.
 * @param {object} updateData  Existing updates being applied to item. *Will be mutated.*
 * @param {string} key         System block key.
 * @param {string} flagKey     Flag key used to preserve the imported value.
 * @private
 */
function _migrateN5eBClassmodFormulaBlock(itemData, updateData, key, flagKey) {
  const block = itemData.system?.[key];
  if ( foundry.utils.getType(block) !== "Object" ) return;
  const formula = block.formula;
  if ( !formula || block.value ) return;
  updateData[`system.${key}.value`] = formula;
  updateData[`flags.n5eb.classmodArtsFix.${flagKey}`] = formula;
  updateData["flags.n5eb.classmodArtsFix.migratedAt"] = "system-migration";
}

/* -------------------------------------------- */

/**
 * Parse an old chakra scaling value.
 * @param {*} value  Candidate value.
 * @returns {object|null}
 * @private
 */
function _parseLegacyChakraScaling(value) {
  if ( foundry.utils.getType(value) === "Object" ) return value;
  if ( Number.isNumeric(value) ) return { mode: "level", value: Number(value) };
  if ( typeof value !== "string" ) return null;
  const trimmed = value.trim();
  if ( !trimmed ) return null;
  if ( Number.isNumeric(trimmed) ) return { mode: "level", value: Number(trimmed) };
  try {
    const parsed = JSON.parse(trimmed);
    return foundry.utils.getType(parsed) === "Object" ? parsed : null;
  } catch{
    return null;
  }
}

/* -------------------------------------------- */

/**
 * Is this special chakra text a legacy mechanical scaling placeholder.
 * @param {*} value  Candidate value.
 * @returns {boolean}
 * @private
 */
function _isLegacyChakraScalingNote(value) {
  if ( !value ) return false;
  const trimmed = `${value}`.trim();
  return Number.isNumeric(trimmed) || /^\{.*"mode".*"value".*\}$/.test(trimmed);
}

/* -------------------------------------------- */

/**
 * Migrate any system token images from PNG to WEBP.
 * @param {object} actorData    Actor or token data to migrate.
 * @param {object} updateData   Existing update to expand upon.
 * @returns {object}            The updateData to apply
 * @private
 */
function _migrateTokenImage(actorData, updateData) {
  const oldSystemPNG = /^systems\/dnd5e\/tokens\/([a-z]+)\/([A-z]+).png$/;
  for ( const path of ["texture.src", "prototypeToken.texture.src"] ) {
    const v = foundry.utils.getProperty(actorData, path);
    if ( oldSystemPNG.test(v) ) {
      const [type, fileName] = v.match(oldSystemPNG).slice(1);
      updateData[path] = `systems/n5eb/tokens/${type}/${fileName}.webp`;
    }
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Convert system icons to use bundled core webp icons.
 * @param {object} document                                 Document data to migrate
 * @param {object} updateData                               Existing update to expand upon
 * @param {object} [migrationData={}]                       Additional data to perform the migration
 * @param {Object<string, string>} [migrationData.iconMap]  A mapping of system icons to core foundry icons
 * @param {string} [migrationData.field]                    The document field to migrate
 * @returns {object}                                        The updateData to apply
 * @private
 */
function _migrateDocumentIcon(document, updateData, { iconMap, field="img" }={}) {
  let path = document?.[field];
  if ( path && iconMap ) {
    if ( path.startsWith("/") || path.startsWith("\\") ) path = path.substring(1);
    const rename = iconMap[path];
    if ( rename ) updateData[field] = rename;
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * Change active effects that target AC.
 * @param {object} effect      Effect data to migrate.
 * @param {object} updateData  Existing update to expand upon.
 * @returns {object}           The updateData to apply.
 */
function _migrateEffectArmorClass(effect, updateData) {
  let containsUpdates = false;
  const changes = (effect.changes || []).map(c => {
    if ( c.key !== "system.attributes.ac.base" ) return c;
    c.key = "system.attributes.ac.armor";
    containsUpdates = true;
    return c;
  });
  if ( containsUpdates ) updateData.changes = changes;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate active effect keys that target old N5eB toolkit actor paths.
 * @param {object} effect      Effect data to migrate.
 * @param {object} updateData  Existing update to expand upon.
 * @returns {object}           The updateData to apply.
 * @private
 */
function _migrateN5eBKitEffectKeys(effect, updateData) {
  let containsUpdates = false;
  const changes = (updateData.changes ?? effect.changes ?? []).map(change => {
    const key = _migrateN5eBKitEffectKey(change.key);
    if ( key === change.key ) return change;
    containsUpdates = true;
    return { ...change, key };
  });
  if ( containsUpdates ) updateData.changes = changes;
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate one active effect key that targets old N5eB toolkit actor paths.
 * @param {string} key  Active effect key.
 * @returns {string}
 * @private
 */
function _migrateN5eBKitEffectKey(key) {
  if ( typeof key !== "string" ) return key;
  for ( const [oldKey, newKey] of Object.entries(N5EB_KIT_BASE_ITEM_MIGRATIONS) ) {
    const escapedKey = oldKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\bsystem\\.tools\\.${escapedKey}(?=\\b|\\.)`, "g");
    key = key.replace(pattern, `system.tools.${newKey}`);
  }
  return key;
}

/* -------------------------------------------- */

/**
 * Is this document N5eB-native content?
 * @param {object} documentData  Document data.
 * @returns {boolean}
 * @private
 */
function _documentUsesN5eB(documentData) {
  if ( documentData.system?.source?.rules === "n5eb" ) return true;

  const legacyImport = foundry.utils.getProperty(documentData, "flags.n5eb.legacyImport");
  return Boolean(legacyImport?.sourceSystem?.startsWith("n5eb")
    || legacyImport?.sourcePath?.includes("consumables/kits"));
}

/* -------------------------------------------- */

/**
 * Move `uses.value` to `uses.spent` for items.
 * @param {Item5e} item        Full item instance.
 * @param {object} itemData    Item data to migrate.
 * @param {object} updateData  Existing update to expand upon.
 * @param {object} flags       Track the needs migration flag.
 */
function _migrateItemUses(item, itemData, updateData, flags) {
  const value = foundry.utils.getProperty(itemData, "flags.n5eb.migratedUses");
  const max = foundry.utils.getProperty(item, "system.uses.max");
  if ( (value !== undefined) && (max !== undefined) && Number.isNumeric(value) && Number.isNumeric(max) ) {
    foundry.utils.setProperty(updateData, "system.uses.spent", parseInt(max) - parseInt(value));
    flags.persistSourceMigration = true;
  }
  if ( value !== undefined ) updateData["flags.n5eb.-=migratedUses"] = null;
}

/* -------------------------------------------- */

/**
 * Disable transfer on effects on spell items
 * @param {object} effect      Effect data to migrate.
 * @param {object} parent      The parent of this effect.
 * @param {object} updateData  Existing update to expand upon.
 * @returns {object}           The updateData to apply.
 */
function _migrateTransferEffect(effect, parent, updateData) {
  if ( !effect.transfer ) return updateData;
  if ( !isSpellOrScroll(parent) ) return updateData;

  updateData.transfer = false;
  updateData.disabled = true;
  updateData["duration.startTime"] = null;
  updateData["duration.startRound"] = null;
  updateData["duration.startTurn"] = null;

  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate macros from the old 'dnd5e.rollItemMacro' and 'dnd5e.macros' commands to the new location.
 * @param {object} macro       Macro data to migrate.
 * @param {object} updateData  Existing update to expand upon.
 * @returns {object}           The updateData to apply.
 */
function _migrateMacroCommands(macro, updateData) {
  if ( macro.command.includes("game.dnd5e.rollItemMacro") ) {
    updateData.command = macro.command.replaceAll("game.dnd5e.rollItemMacro", "dnd5e.documents.macro.rollItem");
  } else if ( macro.command.includes("game.dnd5e.macros.") ) {
    updateData.command = macro.command.replaceAll("game.dnd5e.macros.", "dnd5e.documents.macro.");
  }
  return updateData;
}

/* -------------------------------------------- */

/**
 * A general tool to purge flags from all documents in a Compendium pack.
 * @param {CompendiumCollection} pack   The compendium pack to clean.
 * @private
 */
export async function purgeFlags(pack) {
  const cleanFlags = flags => {
    const flags5e = flags.n5eb || null;
    return flags5e ? {n5eb: flags5e} : {};
  };
  await pack.configure({locked: false});
  const content = await pack.getDocuments();
  for ( let doc of content ) {
    const update = {flags: cleanFlags(doc.flags)};
    if ( pack.documentName === "Actor" ) {
      update.items = doc.items.map(i => {
        i.flags = cleanFlags(i.flags);
        return i;
      });
    }
    await doc.update(update, {recursive: false});
    log(`Purged flags from ${doc.name}`);
  }
  await pack.configure({locked: true});
}

/* -------------------------------------------- */

/**
 * Returns whether given item data represents either a spell item or a spell scroll consumable
 * @param {object} item  The item data.
 * @returns {boolean}
 */
function isSpellOrScroll(item) {
  if ( (item.type === "consumable") && (item.system.type.value === "scroll") ) return true;
  return item.type === "spell";
}
