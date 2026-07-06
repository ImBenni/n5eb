/**
 * The D&D fifth edition game system for Foundry Virtual Tabletop
 * A system for playing the fifth edition of the world's most popular role-playing game.
 * Author: Atropos
 * Software License: MIT
 * Content License: https://www.dndbeyond.com/attachments/39j2li89/SRD5.1-CCBY4.0License.pdf
 *                  https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf
 * Repository: https://github.com/foundryvtt/dnd5e
 * Issue Tracker: https://github.com/foundryvtt/dnd5e/issues
 */

// Import Configuration
import DND5E from "./module/config.mjs";
import {
  applyLegacyRules, registerDeferredSettings, registerSystemKeybindings, registerSystemSettings
} from "./module/settings.mjs";

// Import Submodules
import * as applications from "./module/applications/_module.mjs";
import * as canvas from "./module/canvas/_module.mjs";
import * as conditions from "./module/conditions.mjs";
import * as dataModels from "./module/data/_module.mjs";
import * as dice from "./module/dice/_module.mjs";
import * as documents from "./module/documents/_module.mjs";
import { assignSystemFlagAliases, mirrorSystemFlagDataScopes } from "./module/documents/flag-compatibility.mjs";
import * as enrichers from "./module/enrichers.mjs";
import * as Filter from "./module/filter.mjs";
import * as migrations from "./module/migration.mjs";
import ModuleArt from "./module/module-art.mjs";
import { registerModuleData, registerModuleRedirects, setupModulePacks } from "./module/module-registration.mjs";
import { default as registry } from "./module/registry.mjs";
import * as seals from "./module/seals.mjs";
import Tooltips5e from "./module/tooltips.mjs";
import * as utils from "./module/utils.mjs";
import DragDrop5e from "./module/drag-drop.mjs";

/* -------------------------------------------- */
/*  Define Module Structure                     */
/* -------------------------------------------- */

globalThis.dnd5e = {
  applications,
  canvas,
  conditions,
  config: DND5E,
  dataModels,
  dice,
  documents,
  enrichers,
  Filter,
  migrations,
  registry,
  seals,
  ui: {},
  utils
};
globalThis.n5eb = globalThis.dnd5e;

/* -------------------------------------------- */

/**
 * Expose N5eB through both its native namespace and the dnd5e-compatible namespace used by automation modules.
 */
function assignCompatibilityNamespaceAliases() {
  game.n5eb = game.dnd5e;
  globalThis.n5eb = globalThis.dnd5e;
  foundry.utils.setProperty(game.system, "flags.daeCompatible", true);
  if ( CONFIG.DND5E ) CONFIG.N5EB = CONFIG.DND5E;
}

/* -------------------------------------------- */

/**
 * Let DAE use its DND5E system adapter for N5eB when the module is installed.
 */
function registerDAECompatibilityAlias() {
  if ( !globalThis.daeSystems?.dnd5e ) return;
  globalThis.daeSystems.n5eb ??= globalThis.daeSystems.dnd5e;
}

/* -------------------------------------------- */

/**
 * Normalize N5eB schema entries that DAE's dnd5e adapter reads from mapping field metadata.
 */
function registerDAEDataModelCompatibilityHooks() {
  Hooks.on("dae.modifyBaseValues", (actorType, baseValues) => {
    const { DataField, NumberField } = foundry.data.fields;
    for ( const [sense, label] of Object.entries(CONFIG.DND5E.senses ?? {}) ) {
      const key = `system.attributes.senses.ranges.${sense}`;
      if ( baseValues[key]?.[0] instanceof DataField ) continue;
      baseValues[key] = [
        new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null, label }),
        ""
      ];
    }
  });
}

/* -------------------------------------------- */

/**
 * Expose N5eB/DND5E flag aliases on measured template documents and their serialized data.
 */
function registerMeasuredTemplateCompatibilityHooks() {
  const assignTemplateAliases = template => {
    const document = template?.document ?? template;
    if ( document ) assignSystemFlagAliases(document);
  };

  Hooks.on("preCreateMeasuredTemplate", (document, data) => {
    const flags = mirrorSystemFlagDataScopes(data);
    if ( flags ) document.updateSource({ flags });
    assignTemplateAliases(document);
  });

  Hooks.on("preUpdateMeasuredTemplate", (document, changes) => {
    mirrorSystemFlagDataScopes(changes);
  });

  Hooks.on("createMeasuredTemplate", assignTemplateAliases);
  Hooks.on("updateMeasuredTemplate", assignTemplateAliases);
  Hooks.on("refreshMeasuredTemplate", assignTemplateAliases);
  Hooks.on("canvasReady", () => canvas.scene?.templates?.forEach(assignTemplateAliases));
}

/* -------------------------------------------- */

/**
 * Let dnd5e-targeted modules use the original system flag scope against N5eB documents.
 */
function registerDocumentFlagCompatibility() {
  const Document = foundry.abstract.Document;
  if ( Document.prototype._n5ebDocumentFlagCompatibility ) return;

  const getFlag = Document.prototype.getFlag;
  const setFlag = Document.prototype.setFlag;
  const unsetFlag = Document.prototype.unsetFlag;
  const isInvalidDND5eScope = error => /Flag scope "dnd5e" is not valid/.test(error.message ?? "");

  Object.defineProperty(Document.prototype, "_n5ebDocumentFlagCompatibility", { value: true });

  Document.prototype.getFlag = function(scope, key) {
    if ( scope !== "dnd5e" ) return getFlag.call(this, scope, key);
    try {
      return getFlag.call(this, scope, key);
    } catch(error) {
      if ( !isInvalidDND5eScope(error) ) throw error;
      return getFlag.call(this, "n5eb", key);
    }
  };

  Document.prototype.setFlag = function(scope, key, value) {
    return setFlag.call(this, scope === "dnd5e" ? "n5eb" : scope, key, value);
  };

  Document.prototype.unsetFlag = function(scope, key) {
    return unsetFlag.call(this, scope === "dnd5e" ? "n5eb" : scope, key);
  };
}

/* -------------------------------------------- */

/**
 * Add an alias for a registered sheet class entry if the target class is present in the registry.
 * @param {object} registry      The sheet registry for a specific document type.
 * @param {typeof Application} cls  The class used by the canonical sheet entry.
 * @param {string[]} aliases     Additional sheet ids that should resolve to the same entry.
 */
function aliasSheetClass(registry, cls, aliases) {
  if ( !registry ) return;
  const entry = Object.values(registry).find(entry => entry?.cls === cls);
  if ( !entry ) return;
  for ( const alias of aliases ) registry[alias] ??= entry;
}

/* -------------------------------------------- */

/**
 * Register legacy dnd5e and N5eB sheet ids used by common automation modules.
 */
function registerCompatibilitySheetAliases() {
  const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
  const actorAliases = [
    {
      type: "character",
      cls: applications.actor.CharacterActorSheet,
      label: "DND5E.SheetClass.Character",
      aliases: ["dnd5e.ActorSheet5eCharacter", "n5eb.ActorSheet5eCharacter", "dnd5e.CharacterActorSheet"]
    },
    {
      type: "npc",
      cls: applications.actor.NPCActorSheet,
      label: "DND5E.SheetClass.NPC",
      aliases: ["dnd5e.ActorSheet5eNPC", "n5eb.ActorSheet5eNPC", "dnd5e.NPCActorSheet"]
    },
    {
      type: "vehicle",
      cls: applications.actor.VehicleActorSheet,
      label: "DND5E.SheetClass.Vehicle",
      aliases: ["dnd5e.ActorSheet5eVehicle", "n5eb.ActorSheet5eVehicle", "dnd5e.VehicleActorSheet"]
    },
    {
      type: "group",
      cls: applications.actor.GroupActorSheet,
      label: "DND5E.SheetClass.Group",
      aliases: ["dnd5e.ActorSheet5eGroup", "n5eb.ActorSheet5eGroup", "dnd5e.GroupActorSheet"]
    },
    {
      type: "encounter",
      cls: applications.actor.EncounterActorSheet,
      label: "DND5E.SheetClass.Encounter",
      aliases: ["dnd5e.ActorSheet5eEncounter", "n5eb.ActorSheet5eEncounter", "dnd5e.EncounterActorSheet"]
    }
  ];
  for ( const { type, cls, label, aliases } of actorAliases ) {
    DocumentSheetConfig.registerSheet(Actor, "dnd5e", cls, {
      types: [type],
      makeDefault: false,
      canConfigure: false,
      canBeDefault: false,
      label
    });
    aliasSheetClass(CONFIG.Actor.sheetClasses?.[type], cls, aliases);
  }

  for ( const registry of Object.values(CONFIG.Item.sheetClasses ?? {}) ) {
    aliasSheetClass(registry, applications.item.ItemSheet5e, ["dnd5e.ItemSheet5e", "n5eb.ItemSheet5e"]);
    aliasSheetClass(registry, applications.item.ContainerSheet, ["dnd5e.ContainerSheet", "n5eb.ContainerSheet"]);
  }
}

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", function() {
  globalThis.dnd5e = game.dnd5e = Object.assign(game.system, globalThis.dnd5e);
  assignCompatibilityNamespaceAliases();
  registerDAECompatibilityAlias();
  registerDAEDataModelCompatibilityHooks();
  registerMeasuredTemplateCompatibilityHooks();
  registerDocumentFlagCompatibility();
  utils.log(`Initializing the D&D Fifth Game System - Version ${dnd5e.version}\n${DND5E.ASCII}`);

  /**
   * Suppress some known deprecations.
   * @deprecated
   * @since 5.3.0
   */
  CONFIG.compatibility.excludePatterns.push(/numeric #mode/, /CONST\.ACTIVE_EFFECT_MODES/, /ContextMenuEntry#/,
    /foundry\.data\.operators\.ForcedDeletion/, /foundry\.utils\.buildRelativeUuid/, /CONFIG.ChatMessage.modes/,
    /core\.rollMode/, /ChatMessage\.applyRollMode/, /Scene#templates/, /MeasuredTemplate/, /MeasuredTemplateDocument/,
    /core\.gridTemplates/, /core\.coneTemplateType/, /ControlIcon#refresh/);

  // Record Configuration Values
  CONFIG.DND5E = DND5E;
  CONFIG.N5EB = CONFIG.DND5E;
  CONFIG.ActiveEffect.documentClass = documents.ActiveEffect5e;
  CONFIG.ActiveEffect.legacyTransferral = false;
  CONFIG.Actor.collection = dataModels.collection.Actors5e;
  CONFIG.Actor.documentClass = documents.Actor5e;
  CONFIG.Adventure.documentClass = documents.Adventure5e;
  CONFIG.ChatMessage.documentClass = documents.ChatMessage5e;
  CONFIG.Combat.documentClass = documents.Combat5e;
  CONFIG.Combatant.documentClass = documents.Combatant5e;
  CONFIG.CombatantGroup.documentClass = documents.CombatantGroup5e;
  CONFIG.Item.collection = dataModels.collection.Items5e;
  CONFIG.Item.compendiumIndexFields.push("system.container", "system.identifier");
  CONFIG.Item.documentClass = documents.Item5e;
  CONFIG.JournalEntryPage.documentClass = documents.JournalEntryPage5e;
  CONFIG.Token.documentClass = documents.TokenDocument5e;
  CONFIG.Token.objectClass = canvas.Token5e;
  CONFIG.Token.rulerClass = canvas.TokenRuler5e;
  CONFIG.Token.movement.TerrainData = dataModels.TerrainData5e;
  CONFIG.User.documentClass = documents.User5e;
  CONFIG.time.roundTime = 6;
  Roll.TOOLTIP_TEMPLATE = "systems/n5eb/templates/chat/roll-breakdown.hbs";
  CONFIG.Dice.BasicDie = CONFIG.Dice.terms.d = dice.BasicDie;
  CONFIG.Dice.BasicRoll = dice.BasicRoll;
  CONFIG.Dice.DamageRoll = dice.DamageRoll;
  CONFIG.Dice.D20Die = dice.D20Die;
  CONFIG.Dice.D20Roll = dice.D20Roll;
  CONFIG.MeasuredTemplate.defaults.angle = 53.13; // 5e cone RAW should be 53.13 degrees
  CONFIG.Note.objectClass = canvas.Note5e;
  CONFIG.ui.chat = applications.ChatLog5e;
  CONFIG.ui.combat = applications.combat.CombatTracker5e;
  CONFIG.ui.items = applications.item.ItemDirectory5e;
  CONFIG.ux.DragDrop = DragDrop5e;

  if ( game.release.generation < 14 ) CONFIG.Token.layerClass = canvas.layers.TokenLayer5e;
  CONFIG.Canvas.layers.tokens.layerClass = canvas.layers.TokenLayer5e;

  // Register System Settings
  registerSystemSettings();
  registerSystemKeybindings();

  // Configure module art
  game.dnd5e.moduleArt = new ModuleArt();

  // Configure bastions
  game.dnd5e.bastion = new documents.Bastion();

  // Configure tooltips
  game.dnd5e.tooltips = new Tooltips5e();

  // Remove honor & sanity from configuration if they aren't enabled
  if ( !game.settings.get("n5eb", "honorScore") ) delete DND5E.abilities.hon;
  if ( !game.settings.get("n5eb", "sanityScore") ) delete DND5E.abilities.san;

  // Legacy rules.
  if ( dnd5e.settings.rulesVersion === "legacy" ) applyLegacyRules();

  // N5eB condition registry.
  conditions.configureConditionTypes(DND5E);
  seals.registerHooks();

  // Register system
  DND5E.SPELL_LISTS.forEach(uuid => dnd5e.registry.spellLists.register(uuid));

  // Register module data from manifests
  registerModuleData();
  registerModuleRedirects();

  // Register Roll Extensions
  CONFIG.Dice.rolls = [dice.BasicRoll, dice.D20Roll, dice.DamageRoll];

  // Hook up system data types
  Object.assign(CONFIG.ActiveEffect.dataModels, dataModels.activeEffect.config);
  CONFIG.Actor.dataModels = dataModels.actor.config;
  CONFIG.ChatMessage.dataModels = dataModels.chatMessage.config;
  CONFIG.Item.dataModels = dataModels.item.config;
  CONFIG.JournalEntryPage.dataModels = dataModels.journal.config;
  Object.assign(CONFIG.RegionBehavior.dataModels, dataModels.regionBehavior.config);
  Object.assign(CONFIG.RegionBehavior.typeIcons, dataModels.regionBehavior.icons);

  // Add fonts
  _configureFonts();

  // Register sheet application classes
  const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
  DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  DocumentSheetConfig.registerSheet(Actor, "n5eb", applications.actor.CharacterActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "DND5E.SheetClass.Character"
  });
  DocumentSheetConfig.registerSheet(Actor, "n5eb", applications.actor.NPCActorSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "DND5E.SheetClass.NPC"
  });
  DocumentSheetConfig.registerSheet(Actor, "n5eb", applications.actor.VehicleActorSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "DND5E.SheetClass.Vehicle"
  });
  DocumentSheetConfig.registerSheet(Actor, "n5eb", applications.actor.GroupActorSheet, {
    types: ["group"],
    makeDefault: true,
    label: "DND5E.SheetClass.Group"
  });
  DocumentSheetConfig.registerSheet(Actor, "n5eb", applications.actor.EncounterActorSheet, {
    types: ["encounter"],
    makeDefault: true,
    label: "DND5E.SheetClass.Encounter"
  });

  DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  DocumentSheetConfig.registerSheet(Item, "n5eb", applications.item.ItemSheet5e, {
    makeDefault: true,
    label: "DND5E.SheetClass.Item"
  });
  DocumentSheetConfig.unregisterSheet(Item, "n5eb", applications.item.ItemSheet5e, { types: ["container"] });
  DocumentSheetConfig.registerSheet(Item, "n5eb", applications.item.ContainerSheet, {
    makeDefault: true,
    types: ["container"],
    label: "DND5E.SheetClass.Container"
  });

  DocumentSheetConfig.registerSheet(JournalEntry, "n5eb", applications.journal.JournalEntrySheet5e, {
    makeDefault: true,
    label: "DND5E.SheetClass.JournalEntry"
  });
  DocumentSheetConfig.registerSheet(JournalEntry, "n5eb", applications.journal.JournalSheet5e, {
    makeDefault: false,
    canConfigure: false,
    canBeDefault: false,
    label: "DND5E.SheetClass.JournalEntryLegacy"
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "n5eb", applications.journal.JournalClassPageSheet, {
    label: "DND5E.SheetClass.ClassSummary",
    types: ["class", "subclass"]
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "n5eb", applications.journal.JournalMapLocationPageSheet, {
    label: "DND5E.SheetClass.MapLocation",
    types: ["map"]
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "n5eb", applications.journal.JournalRulePageSheet, {
    label: "DND5E.SheetClass.Rule",
    types: ["rule"]
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, "n5eb", applications.journal.JournalSpellListPageSheet, {
    label: "DND5E.SheetClass.SpellList",
    types: ["spells"]
  });

  DocumentSheetConfig.unregisterSheet(RegionBehavior, "core", foundry.applications.sheets.RegionBehaviorConfig, {
    types: ["n5eb.difficultTerrain", "n5eb.rotateArea"]
  });
  DocumentSheetConfig.registerSheet(RegionBehavior, "n5eb", applications.regionBehavior.DifficultTerrainConfig, {
    label: "DND5E.SheetClass.DifficultTerrain",
    types: ["n5eb.difficultTerrain"]
  });
  DocumentSheetConfig.registerSheet(RegionBehavior, "n5eb", applications.regionBehavior.RotateAreaConfig, {
    label: "DND5E.SheetClass.RotateArea",
    types: ["n5eb.rotateArea"]
  });

  DocumentSheetConfig.registerSheet(RollTable, "n5eb", applications.RollTableSheet5e, {
    makeDefault: true,
    label: "DND5E.SheetClass.RollTable"
  });

  CONFIG.Token.prototypeSheetClass = applications.PrototypeTokenConfig5e;
  DocumentSheetConfig.unregisterSheet(TokenDocument, "core", foundry.applications.sheets.TokenConfig);
  DocumentSheetConfig.registerSheet(TokenDocument, "n5eb", applications.TokenConfig5e, {
    label: "DND5E.SheetClass.Token"
  });
  registerCompatibilitySheetAliases();

  // Preload Handlebars helpers & partials
  utils.registerHandlebarsHelpers();
  utils.preloadHandlebarsTemplates();

  // Enrichers
  enrichers.registerCustomEnrichers();

  // Exhaustion handling
  documents.ActiveEffect5e.registerHUDListeners();
  conditions.registerConditionHooks();

  // Set up token movement actions
  documents.TokenDocument5e.registerMovementActions();

  // Custom movement cost aggregator
  CONFIG.Token.movement.costAggregator = (results, distance, segment) => {
    return Math.max(...results.map(i => i.cost));
  };

  // Setup Calendar
  _configureCalendar();
});

/* -------------------------------------------- */

/**
 * Configure world calendar based on setting.
 */
function _configureCalendar() {
  CONFIG.time.earthCalendarClass = dataModels.calendar.CalendarData5e;
  CONFIG.time.worldCalendarClass = dataModels.calendar.CalendarData5e;

  /**
   * A hook event that fires during the `init` step to give modules a chance to customize the calendar
   * configuration before loading the world calendar.
   * @function dnd5e.preSetupCalendar
   * @memberof hookEvents
   * @returns               Explicitly return `false` to prevent system from setting up the calendar.
   */
  if ( Hooks.call("dnd5e.setupCalendar") === false ) return;

  const calendar = game.settings.get("n5eb", "calendar");
  const calendarConfig = CONFIG.DND5E.calendar.calendars.find(c => c.value === calendar);
  if ( calendarConfig ) {
    CONFIG.time.worldCalendarConfig = calendarConfig.config;
    if ( calendarConfig.class ) CONFIG.time.worldCalendarClass = calendarConfig.class;
  }
}

/* -------------------------------------------- */

/**
 * Configure explicit lists of attributes that are trackable on the token HUD and in the combat tracker.
 * @internal
 */
function _configureTrackableAttributes() {
  const common = {
    bar: [],
    value: [
      ...Object.keys(DND5E.abilities).map(ability => `abilities.${ability}.value`),
      ...Object.keys(DND5E.movementTypes).map(movement => `attributes.movement.${movement}`),
      "attributes.ac.value", "attributes.init.total"
    ]
  };

  const creature = {
    bar: [
      ...common.bar,
      "attributes.hp",
      "attributes.chakra",
      ..._trackedSpellAttributes()
    ],
    value: [
      ...common.value,
      ...Object.keys(DND5E.skills).map(skill => `skills.${skill}.passive`),
      ...Object.keys(DND5E.senses).map(sense => `attributes.senses.ranges.${sense}`),
      "attributes.hp.temp", "attributes.chakra.value", "attributes.chakra.temp", "attributes.spell.attack",
      "attributes.spell.dc"
    ]
  };

  CONFIG.Actor.trackableAttributes = {
    character: {
      bar: [...creature.bar, "resources.primary", "resources.secondary", "resources.tertiary", "details.xp"],
      value: [...creature.value]
    },
    npc: {
      bar: [...creature.bar, "resources.legact", "resources.legres"],
      value: [...creature.value, "attributes.spell.level", "details.cr", "details.xp.value"]
    },
    vehicle: {
      bar: [...common.bar, "attributes.hp"],
      value: [...common.value]
    },
    group: {
      bar: [],
      value: []
    }
  };
}

/* -------------------------------------------- */

/**
 * Get all trackable spell slot attributes.
 * @param {string} [suffix=""]  Suffix appended to the path.
 * @returns {Set<string>}
 * @internal
 */
function _trackedSpellAttributes(suffix="") {
  return Object.entries(DND5E.spellcasting).reduce((acc, [k, v]) => {
    if ( v.slots ) Array.fromRange(Object.keys(DND5E.spellLevels).length - 1, 1).forEach(l => {
      acc.add(`spells.${v.getSpellSlotKey(l)}${suffix}`);
    });
    return acc;
  }, new Set());
}

/* -------------------------------------------- */

/**
 * Configure which attributes are available for item consumption.
 * @internal
 */
function _configureConsumableAttributes() {
  CONFIG.DND5E.consumableResources = [
    ...Object.keys(DND5E.abilities).map(ability => `abilities.${ability}.value`),
    "attributes.ac.flat",
    "attributes.hp.value",
    "attributes.chakra.value",
    "attributes.exhaustion",
    ...Object.keys(DND5E.senses).map(sense => `attributes.senses.ranges.${sense}`),
    ...Object.keys(DND5E.movementTypes).map(type => `attributes.movement.${type}`),
    ...Object.keys(DND5E.currencies).map(denom => `currency.${denom}`),
    "details.xp.value",
    "resources.primary.value", "resources.secondary.value", "resources.tertiary.value",
    "resources.legact.value", "resources.legres.value", "attributes.actions.value",
    ..._trackedSpellAttributes(".value")
  ];
}

/* -------------------------------------------- */

/**
 * Configure additional system fonts.
 */
function _configureFonts() {
  Object.assign(CONFIG.fontDefinitions, {
    Roboto: {
      editor: true,
      fonts: [
        { urls: ["systems/n5eb/fonts/roboto/Roboto-Regular.woff2"] },
        { urls: ["systems/n5eb/fonts/roboto/Roboto-Bold.woff2"], weight: "bold" },
        { urls: ["systems/n5eb/fonts/roboto/Roboto-Italic.woff2"], style: "italic" },
        { urls: ["systems/n5eb/fonts/roboto/Roboto-BoldItalic.woff2"], weight: "bold", style: "italic" }
      ]
    },
    "Roboto Condensed": {
      editor: true,
      fonts: [
        { urls: ["systems/n5eb/fonts/roboto-condensed/RobotoCondensed-Regular.woff2"] },
        { urls: ["systems/n5eb/fonts/roboto-condensed/RobotoCondensed-Bold.woff2"], weight: "bold" },
        { urls: ["systems/n5eb/fonts/roboto-condensed/RobotoCondensed-Italic.woff2"], style: "italic" },
        {
          urls: ["systems/n5eb/fonts/roboto-condensed/RobotoCondensed-BoldItalic.woff2"], weight: "bold",
          style: "italic"
        }
      ]
    },
    "Roboto Slab": {
      editor: true,
      fonts: [
        { urls: ["systems/n5eb/fonts/roboto-slab/RobotoSlab-Regular.ttf"] },
        { urls: ["systems/n5eb/fonts/roboto-slab/RobotoSlab-Bold.ttf"], weight: "bold" }
      ]
    }
  });
}

/* -------------------------------------------- */

/**
 * Configure system status effects.
 */
function _configureStatusEffects() {
  const addEffect = (effects, {special, ...data}) => {
    data = foundry.utils.deepClone(data);
    data._id = utils.staticID(`dnd5e${data.id}`);
    data.order ??= Infinity;
    effects.push(data);
    if ( special ) CONFIG.specialStatusEffects[special] = data.id;
    if ( data.neverBlockMovement ) DND5E.neverBlockStatuses.add(data.id);
  };
  CONFIG.statusEffects = Object.entries(CONFIG.DND5E.statusEffects).reduce((arr, [id, data]) => {
    const original = CONFIG.statusEffects.find(s => s.id === id);
    addEffect(arr, foundry.utils.mergeObject(original ?? {}, { id, ...data }, { inplace: false }));
    return arr;
  }, []);
  for ( const [id, data] of Object.entries(CONFIG.DND5E.conditionTypes) ) {
    addEffect(CONFIG.statusEffects, { id, ...data });
  }
  for ( const [id, data] of Object.entries(CONFIG.DND5E.encumbrance.effects) ) {
    addEffect(CONFIG.statusEffects, { id, ...data, hud: false });
  }
}

/* -------------------------------------------- */
/*  Foundry VTT Setup                           */
/* -------------------------------------------- */

/**
 * Prepare attribute lists.
 */
Hooks.once("setup", function() {
  // Configure trackable & consumable attributes.
  _configureTrackableAttributes();
  _configureConsumableAttributes();

  CONFIG.DND5E.trackableAttributes = expandAttributeList(CONFIG.DND5E.trackableAttributes);
  game.dnd5e.moduleArt.registerModuleArt();
  Tooltips5e.activateListeners();
  game.dnd5e.tooltips.observe();

  // Register settings after modules have had a chance to initialize
  registerDeferredSettings();

  // Set up compendiums with custom applications & sorting
  setupModulePacks();

  // Create CSS for currencies
  const style = document.createElement("style");
  const currencies = append => Object.entries(CONFIG.DND5E.currencies)
    .map(([key, { icon }]) => `&.${key}${append ?? ""} { background-image: url("${icon}"); }`);
  style.innerHTML = `
    :is(.dnd5e2, .dnd5e2-journal) :is(i, span).currency {
      ${currencies().join("\n")}
    }
    .dnd5e2 .form-group label.label-icon.currency {
      ${currencies("::after").join("\n")}
    }
  `;
  document.head.append(style);
});

/* --------------------------------------------- */

/**
 * Expand a list of attribute paths into an object that can be traversed.
 * @param {string[]} attributes  The initial attributes configuration.
 * @returns {object}  The expanded object structure.
 */
function expandAttributeList(attributes) {
  return attributes.reduce((obj, attr) => {
    foundry.utils.setProperty(obj, attr, true);
    return obj;
  }, {});
}

/* --------------------------------------------- */

/**
 * Perform one-time pre-localization and sorting of some configuration objects
 */
Hooks.once("i18nInit", () => {
  // Set up status effects. Explicitly performed after init and before prelocalization.
  _configureStatusEffects();

  if ( dnd5e.settings.useExpertise ) {
    CONFIG.DND5E.masteryLevels[1] = "DND5E.Expertise";
    CONFIG.DND5E.masteryLevels[2] = "DND5E.Expertise";
    CONFIG.DND5E.masteryLevels[3] = "DND5E.Expertise";
  } else {
    CONFIG.DND5E.traitModes.expertise.label = "DND5E.ADVANCEMENT.Trait.Mode.SkillMastery.Label";
    CONFIG.DND5E.traitModes.expertise.hint = "DND5E.ADVANCEMENT.Trait.Mode.SkillMastery.Hint";
    CONFIG.DND5E.traitModes.forcedExpertise.label = "DND5E.ADVANCEMENT.Trait.Mode.ForceMastery.Label";
    CONFIG.DND5E.traitModes.forcedExpertise.hint = "DND5E.ADVANCEMENT.Trait.Mode.ForceMastery.Hint";
    CONFIG.DND5E.traitModes.upgrade.hint = "DND5E.ADVANCEMENT.Trait.Mode.UpgradeMastery.Hint";
  }

  if ( dnd5e.settings.rulesVersion === "legacy" ) {
    const { translations, _fallback } = game.i18n;
    foundry.utils.mergeObject(translations, {
      "TYPES.Item": {
        race: game.i18n.localize("TYPES.Item.raceLegacy"),
        racePl: game.i18n.localize("TYPES.Item.raceLegacyPl")
      },
      DND5E: {
        "Feature.Class.ArtificerPlan": game.i18n.localize("DND5E.Feature.Class.ArtificerInfusion"),
        "Feature.Species": game.i18n.localize("DND5E.Feature.SpeciesLegacy"),
        FlagsAlertHint: game.i18n.localize("DND5E.FlagsAlertHintLegacy"),
        ItemSpeciesDetails: game.i18n.localize("DND5E.ItemSpeciesDetailsLegacy"),
        "Language.Category.Rare": game.i18n.localize("DND5E.Language.Category.Exotic"),
        "MOVEMENT.Type.Speed": game.i18n.localize("DND5E.MOVEMENT.Type.Walk"),
        RacialTraits: game.i18n.localize("DND5E.RacialTraitsLegacy"),
        "REST.Long.Hint.Normal": game.i18n.localize("DND5E.REST.Long.Hint.NormalLegacy"),
        "REST.Long.Hint.Group": game.i18n.localize("DND5E.REST.Long.Hint.GroupLegacy"),
        "Species.Add": game.i18n.localize("DND5E.Species.AddLegacy"),
        "Species.Features": game.i18n.localize("DND5E.Species.FeaturesLegacy"),
        "TARGET.Type.Emanation": foundry.utils.mergeObject(
          _fallback.DND5E?.TARGET?.Type?.Radius ?? {},
          translations.DND5E?.TARGET?.Type?.Radius ?? {},
          { inplace: false }
        ),
        TraitArmorPlural: foundry.utils.mergeObject(
          _fallback.DND5E?.TraitArmorLegacyPlural ?? {},
          translations.DND5E?.TraitArmorLegacyPlural ?? {},
          { inplace: false }
        ),
        TraitArmorProf: game.i18n.localize("DND5E.TraitArmorLegacyProf")
      }
    });
  }
  utils.performPreLocalization(CONFIG.DND5E);
  Object.values(CONFIG.DND5E.activityTypes).forEach(c => c.documentClass.localize());
  Object.values(CONFIG.DND5E.advancementTypes).forEach(c => c.documentClass.localize());
  foundry.helpers.Localization.localizeDataModel(dataModels.settings.CalendarConfigSetting);
  foundry.helpers.Localization.localizeDataModel(dataModels.settings.CalendarPreferencesSetting);
  foundry.helpers.Localization.localizeDataModel(dataModels.settings.TransformationSetting);

  // Spellcasting
  dataModels.spellcasting.SpellcastingModel.fromConfig();
});

/* -------------------------------------------- */
/*  Foundry VTT Ready                           */
/* -------------------------------------------- */

/**
 * Once the entire VTT framework is initialized, check to see if we should perform a data migration
 */
Hooks.once("ready", function() {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if ( ["ActiveEffect", "Activity", "Item"].includes(data.type) ) {
      documents.macro.create5eMacro(data, slot);
      return false;
    }
  });

  // Adjust sourced items on actors now that compendium UUID redirects have been initialized
  game.actors.forEach(a => a.sourcedItems?._redirectKeys?.());

  // Register items by type
  dnd5e.registry.classes.initialize();
  dnd5e.registry.subclasses.initialize();

  // Chat message listeners
  documents.ChatMessage5e.activateListeners();

  // Bastion initialization
  game.dnd5e.bastion.initializeUI();

  // Display the calendar HUD
  if ( CONFIG.DND5E.calendar.application ) {
    dnd5e.ui.calendar = new CONFIG.DND5E.calendar.application();
    dnd5e.ui.calendar.render({ force: true });
  }

  // Determine whether a system migration is required and feasible
  if ( !game.user.isGM ) return;
  migrations.ensureN5eBCompendiumFolders();
  const cv = game.settings.get("n5eb", "systemMigrationVersion") || game.world.flags.n5eb?.version;
  const targetMigrationVersion = migrations.getTargetMigrationVersion();
  const needsMigration = !cv || foundry.utils.isNewerVersion(targetMigrationVersion, cv);
  const legacyPreview = migrations.previewLegacyMigration();
  const cleanLegacyDeletionKeys = () => {
    migrations.cleanLegacyDeletionKeys().catch(err => {
      err.message = `Failed legacy deletion key cleanup: ${err.message}`;
      console.error(err);
    });
  };
  const handleMigrationError = err => {
    err.message = `Failed dnd5e system migration: ${err.message}`;
    console.error(err);
    ui.notifications.error("Naruto 5e system migration failed. Check the console (F12) for details.", {
      permanent: true
    });
  };
  const runMigration = migration => migration.then(cleanLegacyDeletionKeys).catch(handleMigrationError);
  if ( !cv && (legacyPreview.counts.totalDocuments === 0) ) {
    return game.settings.set("n5eb", "systemMigrationVersion", targetMigrationVersion).then(cleanLegacyDeletionKeys);
  }
  if ( cv && !needsMigration ) {
    cleanLegacyDeletionKeys();
    return;
  }

  if ( needsMigration && legacyPreview.required ) {
    if ( game.settings.get("n5eb", "legacyMigrationConfirmed") ) {
      runMigration(migrations.runLegacyMigration({ confirmed: true, preview: legacyPreview }));
    } else {
      runMigration(migrations.promptLegacyMigration(legacyPreview));
    }
    return;
  }

  // Compendium pack folder migration.
  if ( foundry.utils.isNewerVersion("3.0.0", cv) ) {
    migrations.reparentCompendiums("DnD5e SRD Content", "D&D SRD Content");
  }

  // Perform the migration
  if ( cv && foundry.utils.isNewerVersion(game.system.flags.compatibleMigrationVersion, cv) ) {
    ui.notifications.error("MIGRATION.5eVersionTooOldWarning", {localize: true, permanent: true});
  }
  runMigration(migrations.migrateWorld());
});

/* -------------------------------------------- */
/*  System Styling                              */
/* -------------------------------------------- */

Hooks.on("renderGamePause", (app, html) => {
  if ( Hooks.events.renderGamePause.length > 1 ) return;
  html.classList.add("dnd5e2");
  const container = document.createElement("div");
  container.classList.add("flexcol");
  container.append(...html.children);
  html.append(container);
  const img = html.querySelector("img");
  img.src = "systems/n5eb/ui/official/n5eb-pause.svg";
  img.className = "";
});

Hooks.on("renderSettings", (app, html) => applications.settings.sidebar.renderSettings(html));

/* -------------------------------------------- */
/*  Other Hooks                                 */
/* -------------------------------------------- */

Hooks.on("applyCompendiumArt", (documentClass, ...args) => documentClass.applyCompendiumArt?.(...args));

Hooks.on("renderChatPopout", documents.ChatMessage5e.onRenderChatPopout);
Hooks.on("getChatMessageContextOptions", documents.ChatMessage5e.addChatMessageContextOptions);

Hooks.on("renderChatLog", (app, html, data) => {
  documents.Item5e.chatListeners(html);
  documents.ChatMessage5e.onRenderChatLog(html);
});
Hooks.on("renderChatPopout", (app, html, data) => documents.Item5e.chatListeners(html));

Hooks.on("chatMessage", (app, message, data) => applications.Award.chatMessage(message));
Hooks.on("createChatMessage", dataModels.chatMessage.RequestMessageData.onCreateMessage);
Hooks.on("updateChatMessage", dataModels.chatMessage.RequestMessageData.onUpdateResultMessage);

Hooks.on("renderActorDirectory", (app, html, data) => documents.Actor5e.onRenderActorDirectory(html));

Hooks.on("getActorContextOptions", documents.Actor5e.addDirectoryContextOptions);
Hooks.on("getItemContextOptions", documents.Item5e.addDirectoryContextOptions);
Hooks.on("deleteItem", item => {
  void import("./module/applications/actor/config/adversary-builder-config.mjs")
    .then(({ recordDeletedAutoPassiveSuppression }) => recordDeletedAutoPassiveSuppression(item))
    .catch(err => utils.log(`Failed to record adversary passive suppression: ${err.message}`, { level: "error" }));
});

Hooks.on("renderCompendiumDirectory", (app, html) => applications.CompendiumBrowser.injectSidebarButton(html));

Hooks.on("renderJournalEntryPageSheet", applications.journal.JournalEntrySheet5e.onRenderJournalPageSheet);

Hooks.on("renderActiveEffectConfig", documents.ActiveEffect5e.onRenderActiveEffectConfig);

Hooks.on("renderDocumentSheetConfig", (app, html) => {
  const { document } = app.options;
  if ( (document instanceof Actor) && document.system.isGroup ) {
    applications.actor.MultiActorSheet.addDocumentSheetConfigOptions(app, html);
  }
});

Hooks.on("targetToken", canvas.Token5e.onTargetToken);

Hooks.on("renderCombatTracker", (app, html, data) => app.renderGroups(html));

Hooks.on("preCreateScene", (doc, createData, options, userId) => {
  // Set default grid units based on metric length setting
  const units = utils.defaultUnits("length");
  if ( (units !== dnd5e.grid.units) && !foundry.utils.getProperty(createData, "grid.distance")
    && !foundry.utils.getProperty(createData, "grid.units") ) {
    doc.updateSource({
      grid: { distance: utils.convertLength(dnd5e.grid.distance, dnd5e.grid.units, units, { strict: false }), units }
    });
  }
});

Hooks.on("updateWorldTime", (...args) => {
  dataModels.calendar.CalendarData5e.onUpdateWorldTime(...args);
  CONFIG.DND5E.calendar.application?.onUpdateWorldTime?.(...args);
});

/* -------------------------------------------- */
/*  Bundled Module Exports                      */
/* -------------------------------------------- */

export {
  applications,
  canvas,
  dataModels,
  dice,
  documents,
  enrichers,
  Filter,
  migrations,
  registry,
  utils,
  DND5E
};
