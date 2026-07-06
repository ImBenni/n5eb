import CompendiumBrowser from "./applications/compendium-browser.mjs";
import BastionSettingsConfig from "./applications/settings/bastion-settings.mjs";
import CalendarSettingsConfig from "./applications/settings/calendar-settings.mjs";
import CombatSettingsConfig from "./applications/settings/combat-settings.mjs";
import CompendiumBrowserSettingsConfig from "./applications/settings/compendium-browser-settings.mjs";
import ModuleArtSettingsConfig from "./applications/settings/module-art-settings.mjs";
import VariantRulesSettingsConfig from "./applications/settings/variant-rules-settings.mjs";
import VisibilitySettingsConfig from "./applications/settings/visibility-settings.mjs";
import BastionSetting from "./data/settings/bastion-setting.mjs";
import { CalendarConfigSetting, CalendarPreferencesSetting } from "./data/settings/calendar-setting.mjs";
import PrimaryPartySetting from "./data/settings/primary-party-setting.mjs";
import TransformationSetting from "./data/settings/transformation-setting.mjs";
import * as LEGACY from "./config-legacy.mjs";

const { StringField } = foundry.data.fields;

/**
 * Settings that common dnd5e automation modules still read from the original system namespace.
 * These are registered under dnd5e as hidden aliases and routed back to N5eB at runtime.
 * @type {Set<string>}
 */
const DND5E_COMPATIBILITY_SETTING_ALIASES = new Set([
  "attackRollVisibility",
  "challengeVisibility",
  "criticalDamageMaxDice",
  "criticalDamageModifiers",
  "disableConcentration",
  "honorScore",
  "metricLengthUnits",
  "sanityScore"
]);

/**
 * Symbol used to mark a patched settings manager.
 * @type {symbol}
 */
const DND5E_SETTING_ALIAS_PATCH = Symbol.for("n5eb.dnd5eSettingAliases");

/**
 * Patch game.settings access so reads and writes to known dnd5e aliases use N5eB values.
 */
function patchDnd5eCompatibilitySettingAccess() {
  if ( game.settings[DND5E_SETTING_ALIAS_PATCH] ) return;
  const manager = game.settings;
  const original = {
    get: manager.get.bind(manager),
    set: manager.set.bind(manager)
  };

  manager.get = function(namespace, key, ...args) {
    if ( (namespace === "dnd5e") && DND5E_COMPATIBILITY_SETTING_ALIASES.has(key)
      && manager.settings.has(`n5eb.${key}`) ) {
      return original.get("n5eb", key, ...args);
    }
    return original.get(namespace, key, ...args);
  };

  manager.set = function(namespace, key, value, ...args) {
    if ( (namespace === "dnd5e") && DND5E_COMPATIBILITY_SETTING_ALIASES.has(key)
      && manager.settings.has(`n5eb.${key}`) ) {
      return original.set("n5eb", key, value, ...args);
    }
    return original.set(namespace, key, value, ...args);
  };

  Object.defineProperty(manager, DND5E_SETTING_ALIAS_PATCH, { value: original });
}

/**
 * Register hidden dnd5e namespace settings used by automation modules so their setting lookups pass.
 */
function registerDnd5eCompatibilitySettingAliases() {
  for ( const key of DND5E_COMPATIBILITY_SETTING_ALIASES ) {
    if ( game.settings.settings.has(`dnd5e.${key}`) ) continue;
    const setting = game.settings.settings.get(`n5eb.${key}`);
    if ( !setting ) continue;

    const config = {};
    for ( const prop of ["name", "hint", "scope", "type", "default", "choices", "range", "requiresReload"] ) {
      if ( setting[prop] !== undefined ) config[prop] = setting[prop];
    }
    config.config = false;
    try {
      config.default = game.settings.get("n5eb", key);
    } catch(err) {
      console.warn(`N5eB | Unable to initialize dnd5e setting alias for ${key}`, err);
    }
    game.settings.register("dnd5e", key, config);
  }

  patchDnd5eCompatibilitySettingAccess();
}

/* -------------------------------------------- */

/**
 * Rerender all currently open actor sheets.
 */
function rerenderOpenActorSheets() {
  for ( const actor of game.actors ?? [] ) {
    const sheet = actor.sheet;
    if ( sheet?.rendered ) sheet.render(true);
  }
}

/**
 * Register all of the system's keybindings.
 */
export function registerSystemKeybindings() {
  game.keybindings.register("n5eb", "skipDialogNormal", {
    name: "KEYBINDINGS.DND5E.SkipDialogNormal",
    editable: [{ key: "ShiftLeft" }, { key: "ShiftRight" }]
  });

  game.keybindings.register("n5eb", "skipDialogAdvantage", {
    name: "KEYBINDINGS.DND5E.SkipDialogAdvantage",
    editable: [{ key: "AltLeft" }, { key: "AltRight" }]
  });

  game.keybindings.register("n5eb", "skipDialogDisadvantage", {
    name: "KEYBINDINGS.DND5E.SkipDialogDisadvantage",
    editable: [{ key: "ControlLeft" }, { key: "ControlRight" }, { key: "OsLeft" }, { key: "OsRight" }]
  });

  game.keybindings.register("n5eb", "dragCopy", {
    name: "KEYBINDINGS.DND5E.DragCopy",
    editable: [{ key: "ControlLeft" }, { key: "ControlRight" }, { key: "AltLeft" }, { key: "AltRight" }]
  });

  game.keybindings.register("n5eb", "dragMove", {
    name: "KEYBINDINGS.DND5E.DragMove",
    editable: [{ key: "ShiftLeft" }, { key: "ShiftRight" }, { key: "OsLeft" }, { key: "OsRight" }]
  });
}

/* -------------------------------------------- */

/**
 * Register all of the system's settings.
 */
export function registerSystemSettings() {
  // Internal System Migration Version
  game.settings.register("n5eb", "systemMigrationVersion", {
    name: "System Migration Version",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register("n5eb", "legacyDeletionKeyCleanupVersion", {
    name: "Legacy Deletion Key Cleanup Version",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register("n5eb", "legacyMigrationConfirmed", {
    name: "Legacy Migration Confirmed",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("n5eb", "legacyMigrationReport", {
    name: "Legacy Migration Report",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // Polymorph Settings
  game.settings.register("n5eb", "transformationSettings", {
    scope: "client",
    config: false,
    type: TransformationSetting
  });

  // Rules version
  game.settings.register("n5eb", "rulesVersion", {
    name: "SETTINGS.DND5E.RULESVERSION.Name",
    hint: "SETTINGS.DND5E.RULESVERSION.Hint",
    scope: "world",
    config: true,
    default: "modern",
    type: String,
    choices: {
      modern: "SETTINGS.DND5E.RULESVERSION.Modern",
      legacy: "SETTINGS.DND5E.RULESVERSION.Legacy"
    },
    requiresReload: true
  });

  // Movement automation
  game.settings.register("n5eb", "movementAutomation", {
    name: "SETTINGS.DND5E.AUTOMATION.Movement.Name",
    hint: "SETTINGS.DND5E.AUTOMATION.Movement.Hint",
    scope: "world",
    config: true,
    default: "full",
    type: String,
    choices: {
      full: "SETTINGS.DND5E.AUTOMATION.Movement.Full",
      noBlocking: "SETTINGS.DND5E.AUTOMATION.Movement.NoBlocking",
      none: "SETTINGS.DND5E.AUTOMATION.Movement.None"
    }
  });

  // Allow rotating square templates
  game.settings.register("n5eb", "gridAlignedSquareTemplates", {
    name: "SETTINGS.5eGridAlignedSquareTemplatesN",
    hint: "SETTINGS.5eGridAlignedSquareTemplatesL",
    scope: "world",
    config: true,
    default: true,
    type: Boolean
  });

  // Loyalty
  game.settings.register("n5eb", "loyaltyScore", {
    name: "SETTINGS.DND5E.LOYALTY.Name",
    hint: "SETTINGS.DND5E.LOYALTY.Hint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  // Disable Advancements
  game.settings.register("n5eb", "disableAdvancements", {
    name: "SETTINGS.5eNoAdvancementsN",
    hint: "SETTINGS.5eNoAdvancementsL",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  // Disable Concentration Tracking
  game.settings.register("n5eb", "disableConcentration", {
    name: "SETTINGS.5eNoConcentrationN",
    hint: "SETTINGS.5eNoConcentrationL",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  // Collapse Item Cards (by default)
  game.settings.register("n5eb", "autoCollapseItemCards", {
    name: "SETTINGS.5eAutoCollapseCardN",
    hint: "SETTINGS.5eAutoCollapseCardL",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: s => {
      ui.chat.render();
    }
  });

  // Collapse Chat Card Trays
  game.settings.register("n5eb", "autoCollapseChatTrays", {
    name: "SETTINGS.DND5E.COLLAPSETRAYS.Name",
    hint: "SETTINGS.DND5E.COLLAPSETRAYS.Hint",
    scope: "client",
    config: true,
    default: "older",
    type: String,
    choices: {
      manual: "SETTINGS.DND5E.COLLAPSETRAYS.Manual",
      never: "SETTINGS.DND5E.COLLAPSETRAYS.Never",
      older: "SETTINGS.DND5E.COLLAPSETRAYS.Older",
      always: "SETTINGS.DND5E.COLLAPSETRAYS.Always"
    }
  });

  // Allow Rests from Sheet
  game.settings.register("n5eb", "allowRests", {
    name: "SETTINGS.DND5E.PERMISSIONS.AllowRests.Name",
    hint: "SETTINGS.DND5E.PERMISSIONS.AllowRests.Hint",
    scope: "world",
    config: true,
    default: true,
    type: Boolean
  });

  // Allow Polymorphing
  game.settings.register("n5eb", "allowPolymorphing", {
    name: "SETTINGS.DND5E.PERMISSIONS.AllowTransformation.Name",
    hint: "SETTINGS.DND5E.PERMISSIONS.AllowTransformation.Hint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  // Allow Summoning
  game.settings.register("n5eb", "allowSummoning", {
    name: "SETTINGS.DND5E.PERMISSIONS.AllowSummoning.Name",
    hint: "SETTINGS.DND5E.PERMISSIONS.AllowSummoning.Hint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  // Metric Length Weights
  game.settings.register("n5eb", "metricLengthUnits", {
    name: "SETTINGS.DND5E.METRIC.LengthUnits.Name",
    hint: "SETTINGS.DND5E.METRIC.LengthUnits.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Metric Volume Weights
  game.settings.register("n5eb", "metricVolumeUnits", {
    name: "SETTINGS.DND5E.METRIC.VolumeUnits.Name",
    hint: "SETTINGS.DND5E.METRIC.VolumeUnits.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Metric Unit Weights
  game.settings.register("n5eb", "metricWeightUnits", {
    name: "SETTINGS.DND5E.METRIC.WeightUnits.Name",
    hint: "SETTINGS.DND5E.METRIC.WeightUnits.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Strict validation
  game.settings.register("n5eb", "strictValidation", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  // Dynamic art.
  game.settings.registerMenu("n5eb", "moduleArtConfiguration", {
    name: "DND5E.ModuleArtConfigN",
    label: "DND5E.ModuleArtConfigL",
    hint: "DND5E.ModuleArtConfigH",
    icon: "fa-solid fa-palette",
    type: ModuleArtSettingsConfig,
    restricted: true
  });

  game.settings.register("n5eb", "moduleArtConfiguration", {
    name: "Module Art Configuration",
    scope: "world",
    config: false,
    type: Object,
    default: {
      n5eb: {
        portraits: true,
        tokens: true
      }
    }
  });

  // Compendium Browser source exclusion
  game.settings.registerMenu("n5eb", "packSourceConfiguration", {
    name: "DND5E.CompendiumBrowser.Sources.Name",
    label: "DND5E.CompendiumBrowser.Sources.Label",
    hint: "DND5E.CompendiumBrowser.Sources.Hint",
    icon: "fas fa-book-open-reader",
    type: CompendiumBrowserSettingsConfig,
    restricted: true
  });

  game.settings.register("n5eb", "packSourceConfiguration", {
    name: "Pack Source Configuration",
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      // Refresh all open Compendium Browser instances when source configuration changes
      foundry.applications.instances.forEach(app => {
        if ( app instanceof CompendiumBrowser ) {
          app.render({ parts: ["results", "filters"], changedTab: true });
        }
      });
    }
  });

  // Bastions
  game.settings.registerMenu("n5eb", "bastionConfiguration", {
    name: "DND5E.Bastion.Configuration.Name",
    label: "DND5E.Bastion.Configuration.Label",
    hint: "DND5E.Bastion.Configuration.Hint",
    icon: "fas fa-chess-rook",
    type: BastionSettingsConfig,
    restricted: true
  });

  game.settings.register("n5eb", "bastionConfiguration", {
    name: "Bastion Configuration",
    scope: "world",
    config: false,
    type: BastionSetting,
    default: {
      button: false,
      enabled: false,
      duration: 7
    },
    onChange: () => game.dnd5e.bastion.initializeUI()
  });

  // Calendar Settings
  game.settings.registerMenu("n5eb", "calendarConfiguration", {
    name: "DND5E.CALENDAR.Configuration.Name",
    label: "DND5E.CALENDAR.Configuration.Label",
    hint: "DND5E.CALENDAR.Configuration.Hint",
    icon: "fas fa-calendar-days",
    type: CalendarSettingsConfig
  });

  game.settings.register("n5eb", "calendar", {
    name: "DND5E.CALENDAR.FIELDS.calendar.label",
    hint: "DND5E.CALENDAR.FIELDS.calendar.hint",
    scope: "world",
    config: false,
    type: new StringField({
      required: true, blank: false, initial: "gregorian", choices: () => Object.fromEntries(
        CONFIG.DND5E.calendar.calendars.map(({ value, label }) => [value, label])
      )
    }),
    requiresReload: true
  });

  game.settings.register("n5eb", "calendarConfig", {
    name: "Calendar Configuration",
    scope: "world",
    config: false,
    type: CalendarConfigSetting,
    onChange: () => dnd5e.ui.calendar?.onUpdateSettings?.()
  });

  game.settings.register("n5eb", "calendarPreferences", {
    name: "Calendar Preferences",
    scope: "user",
    config: false,
    type: CalendarPreferencesSetting,
    onChange: () => dnd5e.ui.calendar?.onUpdateSettings?.()
  });

  // Combat Settings
  game.settings.registerMenu("n5eb", "combatConfiguration", {
    name: "SETTINGS.DND5E.COMBAT.Name",
    label: "SETTINGS.DND5E.COMBAT.Label",
    hint: "SETTINGS.DND5E.COMBAT.Hint",
    icon: "fas fa-explosion",
    type: CombatSettingsConfig,
    restricted: true
  });

  game.settings.register("n5eb", "autoRecharge", {
    name: "SETTINGS.DND5E.NPCS.AutoRecharge.Name",
    hint: "SETTINGS.DND5E.NPCS.AutoRecharge.Hint",
    scope: "world",
    config: false,
    default: "no",
    type: String,
    choices: {
      no: "SETTINGS.DND5E.NPCS.AutoRecharge.No",
      silent: "SETTINGS.DND5E.NPCS.AutoRecharge.Silent",
      yes: "SETTINGS.DND5E.NPCS.AutoRecharge.Yes"
    }
  });

  game.settings.register("n5eb", "autoRollNPCHP", {
    name: "SETTINGS.DND5E.NPCS.AutoRollNPCHP.Name",
    hint: "SETTINGS.DND5E.NPCS.AutoRollNPCHP.Hint",
    scope: "world",
    config: false,
    default: "no",
    type: String,
    choices: {
      no: "SETTINGS.DND5E.NPCS.AutoRollNPCHP.No",
      silent: "SETTINGS.DND5E.NPCS.AutoRollNPCHP.Silent",
      yes: "SETTINGS.DND5E.NPCS.AutoRollNPCHP.Yes"
    }
  });

  game.settings.register("n5eb", "criticalDamageModifiers", {
    name: "SETTINGS.DND5E.CRITICAL.MultiplyModifiers.Name",
    hint: "SETTINGS.DND5E.CRITICAL.MultiplyModifiers.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("n5eb", "criticalDamageMaxDice", {
    name: "SETTINGS.DND5E.CRITICAL.MaxDice.Name",
    hint: "SETTINGS.DND5E.CRITICAL.MaxDice.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("n5eb", "initiativeDexTiebreaker", {
    name: "SETTINGS.DND5E.COMBAT.DexTiebreaker.Name",
    hint: "SETTINGS.DND5E.COMBAT.DexTiebreaker.Hint",
    scope: "world",
    config: false,
    default: false,
    type: Boolean
  });

  game.settings.register("n5eb", "initiativeScore", {
    name: "SETTINGS.DND5E.COMBAT.InitiativeScore.Name",
    hint: "SETTINGS.DND5E.COMBAT.InitiativeScore.Hint",
    scope: "world",
    config: false,
    default: "none",
    type: String,
    choices: {
      none: "SETTINGS.DND5E.COMBAT.InitiativeScore.None",
      npcs: "SETTINGS.DND5E.COMBAT.InitiativeScore.NPCs",
      all: "SETTINGS.DND5E.COMBAT.InitiativeScore.All"
    }
  });

  // Variant Rules
  game.settings.registerMenu("n5eb", "variantRulesConfiguration", {
    name: "SETTINGS.DND5E.VARIANT.Name",
    label: "SETTINGS.DND5E.VARIANT.Label",
    hint: "SETTINGS.DND5E.VARIANT.Hint",
    icon: "fas fa-list-check",
    type: VariantRulesSettingsConfig,
    restricted: true
  });

  game.settings.register("n5eb", "allowFeats", {
    name: "SETTINGS.DND5E.VARIANT.AllowFeats.Name",
    hint: "SETTINGS.DND5E.VARIANT.AllowFeats.Hint",
    scope: "world",
    config: false,
    default: true,
    type: Boolean
  });

  game.settings.register("n5eb", "currencyWeight", {
    name: "SETTINGS.DND5E.VARIANT.CurrencyWeight.Name",
    hint: "SETTINGS.DND5E.VARIANT.CurrencyWeight.Hint",
    scope: "world",
    config: false,
    default: false,
    type: Boolean
  });

  game.settings.register("n5eb", "encumbrance", {
    name: "SETTINGS.DND5E.VARIANT.Encumbrance.Name",
    hint: "SETTINGS.DND5E.VARIANT.Encumbrance.Hint",
    scope: "world",
    config: false,
    default: "variant",
    type: String,
    choices: {
      none: "SETTINGS.DND5E.VARIANT.Encumbrance.None",
      normal: "SETTINGS.DND5E.VARIANT.Encumbrance.Normal",
      variant: "SETTINGS.DND5E.VARIANT.Encumbrance.Variant"
    }
  });

  game.settings.register("n5eb", "honorScore", {
    name: "SETTINGS.DND5E.VARIANT.HonorScore.Name",
    hint: "SETTINGS.DND5E.VARIANT.HonorScore.Hint",
    scope: "world",
    config: false,
    default: false,
    type: Boolean,
    requiresReload: true
  });

  game.settings.register("n5eb", "levelingMode", {
    name: "SETTINGS.DND5E.VARIANT.LevelingMode.Name",
    hint: "SETTINGS.DND5E.VARIANT.LevelingMode.Hint",
    scope: "world",
    config: false,
    default: "xpBoons",
    type: String,
    choices: {
      noxp: "SETTINGS.DND5E.VARIANT.LevelingMode.NoXP",
      xp: "SETTINGS.DND5E.VARIANT.LevelingMode.XP",
      xpBoons: "SETTINGS.DND5E.VARIANT.LevelingMode.XPBoons"
    }
  });

  game.settings.register("n5eb", "proficiencyModifier", {
    name: "SETTINGS.DND5E.VARIANT.ProficiencyModifier.Name",
    hint: "SETTINGS.DND5E.VARIANT.ProficiencyModifier.Hint",
    scope: "world",
    config: false,
    default: "bonus",
    type: String,
    choices: {
      bonus: "SETTINGS.DND5E.VARIANT.ProficiencyModifier.Bonus",
      dice: "SETTINGS.DND5E.VARIANT.ProficiencyModifier.Dice"
    }
  });

  game.settings.register("n5eb", "useExpertise", {
    name: "SETTINGS.DND5E.VARIANT.UseExpertise.Name",
    hint: "SETTINGS.DND5E.VARIANT.UseExpertise.Hint",
    scope: "world",
    config: false,
    default: false,
    type: Boolean,
    requiresReload: true
  });

  game.settings.register("n5eb", "restVariant", {
    name: "SETTINGS.DND5E.VARIANT.Rest.Name",
    hint: "SETTINGS.DND5E.VARIANT.Rest.Hint",
    scope: "world",
    config: false,
    default: "normal",
    type: String,
    choices: {
      normal: "SETTINGS.DND5E.VARIANT.Rest.Normal",
      gritty: "SETTINGS.DND5E.VARIANT.Rest.Gritty",
      epic: "SETTINGS.DND5E.VARIANT.Rest.Epic"
    }
  });

  game.settings.register("n5eb", "sanityScore", {
    name: "SETTINGS.DND5E.VARIANT.SanityScore.Name",
    hint: "SETTINGS.DND5E.VARIANT.SanityScore.Hint",
    scope: "world",
    config: false,
    default: false,
    type: Boolean,
    requiresReload: true
  });

  // Visibility Settings
  game.settings.registerMenu("n5eb", "visibilityConfiguration", {
    name: "SETTINGS.DND5E.VISIBILITY.Name",
    label: "SETTINGS.DND5E.VISIBILITY.Label",
    hint: "SETTINGS.DND5E.VISIBILITY.Hint",
    icon: "fas fa-eye",
    type: VisibilitySettingsConfig,
    restricted: true
  });

  game.settings.register("n5eb", "attackRollVisibility", {
    name: "SETTINGS.DND5E.VISIBILITY.Attack.Name",
    hint: "SETTINGS.DND5E.VISIBILITY.Attack.Hint",
    scope: "world",
    config: false,
    default: "none",
    type: String,
    choices: {
      all: "SETTINGS.DND5E.VISIBILITY.Attack.All",
      hideAC: "SETTINGS.DND5E.VISIBILITY.Attack.HideAC",
      none: "SETTINGS.DND5E.VISIBILITY.Attack.None"
    }
  });

  game.settings.register("n5eb", "bloodied", {
    name: "SETTINGS.DND5E.BLOODIED.Name",
    hint: "SETTINGS.DND5E.BLOODIED.Hint",
    scope: "world",
    config: false,
    default: "player",
    type: String,
    choices: {
      all: "SETTINGS.DND5E.BLOODIED.All",
      player: "SETTINGS.DND5E.BLOODIED.Player",
      none: "SETTINGS.DND5E.BLOODIED.None"
    }
  });

  game.settings.register("n5eb", "challengeVisibility", {
    name: "SETTINGS.DND5E.VISIBILITY.Challenge.Name",
    hint: "SETTINGS.DND5E.VISIBILITY.Challenge.Hint",
    scope: "world",
    config: false,
    default: "player",
    type: String,
    choices: {
      all: "SETTINGS.DND5E.VISIBILITY.Challenge.All",
      player: "SETTINGS.DND5E.VISIBILITY.Challenge.Player",
      none: "SETTINGS.DND5E.VISIBILITY.Challenge.None"
    }
  });

  game.settings.register("n5eb", "concealItemDescriptions", {
    name: "SETTINGS.DND5E.VISIBILITY.ItemDescriptions.Name",
    hint: "SETTINGS.DND5E.VISIBILITY.ItemDescriptions.Hint",
    scope: "world",
    config: false,
    default: false,
    type: Boolean
  });

  // Primary Group
  game.settings.register("n5eb", "primaryParty", {
    name: "Primary Party",
    scope: "world",
    config: false,
    default: null,
    type: PrimaryPartySetting,
    onChange: s => ui.actors.render()
  });

  // Control hints
  game.settings.register("n5eb", "controlHints", {
    name: "DND5E.Controls.Name",
    hint: "DND5E.Controls.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  // Character sheet skill presentation
  game.settings.register("n5eb", "colorAbilityAbbreviations", {
    name: "SETTINGS.DND5E.SHEET.AbilityColors.Name",
    hint: "SETTINGS.DND5E.SHEET.AbilityColors.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: rerenderOpenActorSheets
  });

  game.settings.register("n5eb", "sortSkillsByAbility", {
    name: "SETTINGS.DND5E.SHEET.SortSkillsByAbility.Name",
    hint: "SETTINGS.DND5E.SHEET.SortSkillsByAbility.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: rerenderOpenActorSheets
  });

  // NPC sheet default skills
  game.settings.register("n5eb", "defaultSkills", {
    name: "SETTINGS.DND5E.DEFAULTSKILLS.Name",
    hint: "SETTINGS.DND5E.DEFAULTSKILLS.Hint",
    type: new foundry.data.fields.SetField(
      new foundry.data.fields.StringField({
        choices: () => CONFIG.DND5E.skills
      })
    ),
    default: [],
    config: true
  });

  registerDnd5eCompatibilitySettingAliases();
  cacheSettings();
}

/* -------------------------------------------- */

/**
 * Cache various World settings to improve performance.
 */
function cacheSettings() {
  dnd5e.settings = {};
  for ( const setting of game.settings.settings.values() ) {
    const { key, namespace, onChange, requiresReload, scope } = setting;
    if ( (scope !== "world") || (namespace !== "n5eb") ) continue;
    dnd5e.settings[key] = game.settings.get(namespace, key);
    if ( !requiresReload ) setting.onChange = (value, ...args) => {
      dnd5e.settings[key] = value;
      onChange?.(value, ...args);
    };
  }
}

/* -------------------------------------------- */

/**
 * Register additional settings after modules have had a chance to initialize to give them a chance to modify choices.
 */
export function registerDeferredSettings() {
  game.settings.register("n5eb", "theme", {
    name: "SETTINGS.DND5E.THEME.Name",
    hint: "SETTINGS.DND5E.THEME.Hint",
    scope: "client",
    config: false,
    default: "",
    type: String,
    choices: {
      "": "SHEETS.DND5E.THEME.Automatic",
      ...CONFIG.DND5E.themes
    },
    onChange: s => setTheme(document.body, s)
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    setTheme(document.body, game.settings.get("n5eb", "theme"));
  });
  matchMedia("(prefers-contrast: more)").addEventListener("change", () => {
    setTheme(document.body, game.settings.get("n5eb", "theme"));
  });

  // Hook into core color scheme setting.
  const setting = game.settings.get("core", "uiConfig");
  const settingConfig = game.settings.settings.get("core.uiConfig");
  const { onChange } = settingConfig ?? {};
  if ( onChange ) settingConfig.onChange = (s, ...args) => {
    onChange(s, ...args);
    setTheme(document.body, s.colorScheme);
  };
  setTheme(document.body, setting.colorScheme);
}

/* -------------------------------------------- */

/**
 * Update configuration data when legacy rules are set.
 */
export function applyLegacyRules() {
  const DND5E = CONFIG.DND5E;

  // Set half-casters to round down.
  DND5E.spellcasting.spell.progression.half.roundUp = false;

  // Adjust Wild Shape and Polymorph presets.
  for ( const preset of ["polymorph", "wildshape"] ) {
    DND5E.transformation.presets[preset].settings.keep.delete("hp");
    DND5E.transformation.presets[preset].settings.keep.delete("languages");
    DND5E.transformation.presets[preset].settings.keep.delete("type");
    delete DND5E.transformation.presets[preset].settings.tempFormula;
  }

  // Stunned stops movement in legacy & surprised doesn't provide initiative disadvantage.
  DND5E.conditionEffects.noMovement.add("stunned");
  DND5E.conditionEffects.initiativeAdvantage.delete("invisible");
  DND5E.conditionEffects.initiativeDisadvantage.delete("incapacitated");
  DND5E.conditionEffects.initiativeDisadvantage.delete("surprised");

  // Incapacitated creatures within 2 size categories still cannot be moved through in legacy
  delete DND5E.conditionTypes.incapacitated.neverBlockMovement;

  // Adjust references.
  Object.assign(DND5E.rules, LEGACY.RULES);
  for ( const [cat, value] of Object.entries(LEGACY.REFERENCES) ) {
    Object.entries(value).forEach(([k, v]) => DND5E[cat][k].reference = v);
  }

  // Adjust base item IDs.
  for ( const [cat, value] of Object.entries(LEGACY.IDS) ) {
    if ( cat === "focusTypes" ) Object.entries(value).forEach(([k, v]) => DND5E[cat][k].itemIds = v);
    else if ( cat === "tools" ) Object.entries(value).forEach(([k, v]) => DND5E[cat][k].id = v);
    else DND5E[cat] = value;
  }

  // Swap spell lists.
  DND5E.SPELL_LISTS = LEGACY.SPELL_LISTS;
}

/* -------------------------------------------- */

/**
 * Set the theme on an element, removing the previous theme class in the process.
 * @param {HTMLElement} element     Body or sheet element on which to set the theme data.
 * @param {string} [theme=""]       Theme key to set.
 * @param {Set<string>} [flags=[]]  Additional theming flags to set.
 */
export function setTheme(element, theme="", flags=new Set()) {
  if ( foundry.utils.getType(theme) === "Object" ) theme = theme.applications;
  element.className = element.className.replace(/\bdnd5e-(theme|flag)-[\w-]+\b/g, "");

  // Primary Theme
  if ( !theme && (element === document.body) ) {
    if ( matchMedia("(prefers-color-scheme: dark)").matches ) theme = "dark";
    if ( matchMedia("(prefers-color-scheme: light)").matches ) theme = "light";
  }
  if ( theme ) {
    element.classList.add(`dnd5e-theme-${theme.slugify()}`);
    element.dataset.theme = theme;
  }
  else delete element.dataset.theme;

  // Additional Flags
  if ( (element === document.body) && matchMedia("(prefers-contrast: more)").matches ) flags.add("high-contrast");
  for ( const flag of flags ) element.classList.add(`dnd5e-flag-${flag.slugify()}`);
  element.dataset.themeFlags = Array.from(flags).join(" ");
}
