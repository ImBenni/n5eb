import { getClassmodArtsSpellcastingCards } from "../../classmod-arts.mjs";
import { formatNumber } from "../../utils.mjs";
import AdvancementManager from "../advancement/advancement-manager.mjs";
import CompendiumBrowser from "../compendium-browser.mjs";
import ContextMenu5e from "../context-menu.mjs";
import BaseActorSheet from "./api/base-actor-sheet.mjs";
import Item5e from "../../documents/item.mjs";
import * as Trait from "../../documents/actor/trait.mjs";

const TextEditor = foundry.applications.ux.TextEditor.implementation;
const MAX_WILL_OF_FIRE = 3;

/**
 * @import { FavoriteData5e } from "../../data/abstract/_types.mjs";
 * @import { ActorFavorites5e } from "../../data/actor/_types.mjs";
 * @import { FacilityOccupants } from "../../data/item/_types.mjs";
 */

/**
 * Extension of base actor sheet for characters.
 */
export default class CharacterActorSheet extends BaseActorSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    actions: {
      addDowntimeActivity: CharacterActorSheet.#addDowntimeActivity,
      adjustDowntimeWeeks: CharacterActorSheet.#adjustDowntimeWeeks,
      claimDowntimeCraftingResult: CharacterActorSheet.#claimDowntimeCraftingResult,
      completeDowntimeActivity: CharacterActorSheet.#completeDowntimeActivity,
      deleteFavorite: CharacterActorSheet.#deleteFavorite,
      deleteDowntimeActivity: CharacterActorSheet.#deleteDowntimeActivity,
      deleteOccupant: CharacterActorSheet.#deleteOccupant,
      findItem: CharacterActorSheet.#findItem,
      manageDowntimePayment: CharacterActorSheet.#manageDowntimePayment,
      reopenDowntimeActivity: CharacterActorSheet.#reopenDowntimeActivity,
      rollDowntimeActivity: CharacterActorSheet.#rollDowntimeActivity,
      setSpellcastingAbility: CharacterActorSheet.#setSpellcastingAbility,
      spendDowntimeWeek: CharacterActorSheet.#spendDowntimeWeek,
      toggleDeathTray: CharacterActorSheet.#toggleDeathTray,
      useFacility: CharacterActorSheet.#useFacility,
      useFavorite: CharacterActorSheet.#useFavorite
    },
    classes: ["character", "vertical-tabs"],
    position: {
      width: 800,
      height: 1000
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    header: {
      template: "systems/n5eb/templates/actors/character-header.hbs"
    },
    sidebar: {
      container: { classes: ["main-content"], id: "main" },
      template: "systems/n5eb/templates/actors/character-sidebar.hbs"
    },
    details: {
      classes: ["col-2"],
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/character-details.hbs",
      scrollable: [""]
    },
    inventory: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/character-inventory.hbs",
      templates: [
        "systems/n5eb/templates/inventory/inventory.hbs", "systems/n5eb/templates/inventory/activity.hbs",
        "systems/n5eb/templates/inventory/encumbrance.hbs", "systems/n5eb/templates/inventory/containers.hbs"
      ],
      scrollable: [""]
    },
    features: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/character-features.hbs",
      templates: ["systems/n5eb/templates/inventory/inventory.hbs", "systems/n5eb/templates/inventory/activity.hbs"],
      scrollable: [""]
    },
    spells: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/creature-spells.hbs",
      templates: ["systems/n5eb/templates/inventory/inventory.hbs", "systems/n5eb/templates/inventory/activity.hbs"],
      scrollable: [""]
    },
    effects: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/actor-effects.hbs",
      scrollable: [""]
    },
    downtime: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/character-downtime.hbs",
      scrollable: [""]
    },
    biography: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/character-biography.hbs",
      scrollable: [""]
    },
    bastion: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/character-bastion.hbs",
      scrollable: [""]
    },
    specialTraits: {
      classes: ["flexcol"],
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/creature-special-traits.hbs",
      scrollable: [""]
    },
    abilityScores: {
      template: "systems/n5eb/templates/actors/character-ability-scores.hbs"
    },
    warnings: {
      template: "systems/n5eb/templates/actors/parts/actor-warnings-dialog.hbs"
    },
    tabs: {
      id: "tabs",
      classes: ["tabs-right"],
      template: "systems/n5eb/templates/shared/sidebar-tabs.hbs"
    }
  };

  /* -------------------------------------------- */

  /**
   * Proficiency class names.
   * @enum {string}
   */
  static PROFICIENCY_CLASSES = {
    0: "none",
    0.5: "half",
    1: "full",
    2: "double",
    3: "double",
    4: "double"
  };

  /* -------------------------------------------- */

  /** @override */
  static TABS = [
    { tab: "details", label: "DND5E.Details", icon: "fas fa-cog" },
    { tab: "inventory", label: "DND5E.Inventory", svg: "systems/n5eb/icons/svg/backpack.svg" },
    { tab: "features", label: "DND5E.Features", icon: "fas fa-list" },
    { tab: "spells", label: "TYPES.Item.spellPl", icon: "fas fa-book" },
    { tab: "effects", label: "DND5E.Effects", icon: "fas fa-bolt" },
    { tab: "downtime", label: "N5EB.DOWNTIME.Label", icon: "fas fa-hourglass-half" },
    { tab: "biography", label: "DND5E.Biography", icon: "fas fa-feather" },
    { tab: "bastion", label: "DND5E.Bastion.Label", icon: "fas fa-chess-rook", condition: this.hasBastion },
    { tab: "specialTraits", label: "DND5E.SpecialTraits", icon: "fas fa-star" }
  ];

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Whether the user has manually opened the death save tray.
   * @type {boolean}
   * @protected
   */
  _deathTrayOpen = false;

  /* -------------------------------------------- */

  /** @override */
  _filters = {
    features: { name: "", properties: new Set() },
    effects: { name: "", properties: new Set() },
    downtime: { name: "", properties: new Set() },
    inventory: { name: "", properties: new Set() },
    spells: { name: "", properties: new Set() }
  };

  /* -------------------------------------------- */

  /** @override */
  tabGroups = {
    primary: "details"
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _configureInventorySections(sections) {
    sections.forEach(s => {
      s.minWidth = 250;
      if ( s.id === "weapons" ) {
        s.columns = ["price", "weight", "quantity", "ammoDie", "charges", "roll", "formula", "controls"];
      }
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = {
      ...await super._prepareContext(options),
      abilityRows: {
        bottom: [], top: [], optional: Object.keys(CONFIG.DND5E.abilities).length - 6
      },
      isCharacter: true
    };
    context.spellbook = this._prepareSpellbook(context);
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "abilityScores": return this._prepareAbilityScoresContext(context, options);
      case "bastion": return this._prepareBastionContext(context, options);
      case "biography": return this._prepareBiographyContext(context, options);
      case "details": return this._prepareDetailsContext(context, options);
      case "downtime": return this._prepareDowntimeContext(context, options);
      case "effects": return this._prepareEffectsContext(context, options);
      case "features": return this._prepareFeaturesContext(context, options);
      case "header": return this._prepareHeaderContext(context, options);
      case "inventory": return this._prepareInventoryContext(context, options);
      case "sidebar": return this._prepareSidebarContext(context, options);
      case "specialTraits": return this._prepareSpecialTraitsContext(context, options);
      case "spells": return this._prepareSpellsContext(context, options);
      default: return context;
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the ability scores.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareAbilityScoresContext(context, options) {
    for ( const ability of this._prepareAbilities(context) ) {
      if ( context.abilityRows.bottom.length > 5 ) context.abilityRows.top.push(ability);
      else context.abilityRows.bottom.push(ability);
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the bastion tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareBastionContext(context, options) {
    context.bastion = {
      description: await TextEditor.enrichHTML(this.actor.system.bastion.description, {
        secrets: this.actor.isOwner, relativeTo: this.actor, rollData: context.rollData
      })
    };
    context.defenders = [];
    context.facilities = { basic: { chosen: [] }, special: { chosen: [] } };

    for ( const facility of context.itemCategories.facilities ?? [] ) {
      const ctx = context.itemContext[facility.id] ?? {};
      context.defenders.push(...ctx.defenders.map(({ actor }) => {
        if ( !actor ) return null;
        const { img, name, uuid } = actor;
        return { img, name, uuid, facility: facility.id };
      }).filter(_ => _));
      if ( ctx.isSpecial ) context.facilities.special.chosen.push(ctx);
      else context.facilities.basic.chosen.push(ctx);
    }

    for ( const [type, facilities] of Object.entries(context.facilities) ) {
      const config = CONFIG.DND5E.facilities.advancement[type];
      let [, available] = Object.entries(config).reverse().find(([level]) => {
        return level <= this.actor.system.details.level;
      }) ?? [];
      facilities.value = facilities.chosen.filter(({ free }) => (type === "basic") || !free).length;
      facilities.max = available ?? 0;
      available = (available ?? 0) - facilities.value;
      facilities.available = Array.fromRange(Math.max(0, available)).map(() => {
        return { label: `DND5E.FACILITY.AvailableFacility.${type}.free` };
      });
    }

    if ( !context.facilities.basic.available.length ) {
      context.facilities.basic.available.push({ label: "DND5E.FACILITY.AvailableFacility.basic.build" });
    }

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the downtime tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {Promise<ApplicationRenderContext>}
   * @protected
   */
  async _prepareDowntimeContext(context, options) {
    const downtime = this.actor.system.downtime ?? {};
    const weeks = downtime.weeks ?? {};
    const remaining = Math.max((weeks.available ?? 0) - (weeks.spent ?? 0), 0);
    context.downtime = {
      categories: CONFIG.DND5E.downtimeCategories,
      statuses: CONFIG.DND5E.downtimeStatuses,
      weeks: {
        available: weeks.available ?? 0,
        spent: weeks.spent ?? 0,
        remaining,
        overspent: (weeks.spent ?? 0) > (weeks.available ?? 0),
        notes: await TextEditor.enrichHTML(weeks.notes ?? "", {
          secrets: this.actor.isOwner, relativeTo: this.actor, rollData: context.rollData
        })
      },
      active: [],
      completed: []
    };

    const activities = Array.from(downtime.activities ?? [])
      .map(a => this.#prepareDowntimeActivity(a))
      .sort((a, b) => a.sort - b.sort);

    for ( const activity of activities ) {
      activity.description = await TextEditor.enrichHTML(activity.source.description ?? "", {
        secrets: this.actor.isOwner, relativeTo: this.actor, rollData: context.rollData
      });
      activity.completion = await TextEditor.enrichHTML(activity.source.completion ?? "", {
        secrets: this.actor.isOwner, relativeTo: this.actor, rollData: context.rollData
      });
      activity.notes = await TextEditor.enrichHTML(activity.source.notes ?? "", {
        secrets: this.actor.isOwner, relativeTo: this.actor, rollData: context.rollData
      });
      if ( activity.status === "completed" ) context.downtime.completed.push(activity);
      else context.downtime.active.push(activity);
    }

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);

    // The downtime tab edits only part of the downtime object inline. Preserve actor-local activity instances and
    // hidden week counters when changing sheet modes or submitting unrelated character fields.
    const source = this.actor._source?.system?.downtime ?? this.actor.system._source?.downtime;
    if ( source ) {
      const fields = Object.keys(formData.object ?? {});
      const downtime = foundry.utils.getProperty(submitData, "system.downtime") ?? {};
      if ( !fields.some(field => field.startsWith("system.downtime.activities")) ) {
        downtime.activities = foundry.utils.deepClone(source.activities ?? []);
      }
      downtime.weeks ??= {};
      const weeks = source.weeks ?? {};
      for ( const key of ["available", "spent", "source", "notes"] ) {
        if ( fields.includes(`system.downtime.weeks.${key}`) ) continue;
        if ( key in weeks ) downtime.weeks[key] = weeks[key];
      }
      foundry.utils.setProperty(submitData, "system.downtime", downtime);
    }

    return submitData;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the biography tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareBiographyContext(context, options) {
    const enrichmentOptions = {
      secrets: this.actor.isOwner, relativeTo: this.actor, rollData: context.rollData
    };
    context.enriched = {
      label: "DND5E.Biography",
      value: await TextEditor.enrichHTML(this.actor.system.details.biography.value, enrichmentOptions)
    };

    // Characteristics
    context.characteristics = [
      "alignment", "eyes", "height", "faith", "hair", "weight", "gender", "skin", "age"
    ].map(k => {
      const field = this.actor.system.schema.fields.details.fields[k];
      const name = `system.details.${k}`;
      return {
        name, label: field.label,
        value: foundry.utils.getProperty(this.actor, name) ?? "",
        source: foundry.utils.getProperty(this.actor._source, name) ?? ""
      };
    });

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the details tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareDetailsContext(context, options) {
    const { details, traits } = this.actor.system;

    // Origin
    context.creatureType = {
      class: details.type.value === "custom" ? "none" : "",
      icon: CONFIG.DND5E.creatureTypes[details.type.value]?.icon ?? "icons/svg/mystery-man.svg",
      title: details.type.value === "custom"
        ? details.type.custom
        : CONFIG.DND5E.creatureTypes[details.type.value]?.label,
      reference: CONFIG.DND5E.creatureTypes[details.type.value]?.reference,
      subtitle: details.type.subtype
    };
    if ( details.race instanceof dnd5e.documents.Item5e ) context.species = details.race;
    if ( details.background instanceof dnd5e.documents.Item5e ) context.background = details.background;
    context.labels.size = CONFIG.DND5E.actorSizes[traits.size]?.label ?? traits.size;

    // Saving Throws
    context.saves = {};
    for ( let ability of Object.values(this._prepareAbilities(context)) ) {
      ability = context.saves[ability.key] = { ...ability };
      ability.class = this.constructor.PROFICIENCY_CLASSES[context.editable ? ability.baseProf : ability.proficient];
    }
    if ( this.actor.statuses.has(CONFIG.specialStatusEffects.CONCENTRATING) || context.editable ) {
      context.saves.concentration = {
        isConcentration: true,
        class: "colspan concentration",
        label: game.i18n.localize("DND5E.Concentration"),
        abbr: game.i18n.localize("DND5E.Concentration"),
        save: { value: context.system.attributes.concentration.save }
      };
    }

    // Senses
    context.senses = this._prepareSenses(context);

    // Skills & Tools
    context.colorAbilityAbbreviations = game.settings.get("n5eb", "colorAbilityAbbreviations");
    context.skills = this._prepareSkillsTools(context, "skills");
    context.tools = this._prepareSkillsTools(context, "tools");
    for ( const entry of context.skills.concat(context.tools) ) {
      const key = entry.key;
      entry.class = this.constructor.PROFICIENCY_CLASSES[context.editable ? entry.baseValue : entry.value];
      if ( key in CONFIG.DND5E.skills ) entry.reference = CONFIG.DND5E.skills[key].reference;
      else if ( key in CONFIG.DND5E.tools ) entry.reference = Trait.getBaseItemUUID(CONFIG.DND5E.tools[key].id ?? "");
    }

    // Traits
    context.traits = this._prepareTraits(context);

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareEffectsContext(context, options) {
    context = await super._prepareEffectsContext(context, options);
    context.hasConditions = true;
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the features tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareFeaturesContext(context, options) {
    // Classes
    context.subclasses = context.itemCategories.subclasses ?? [];
    context.classmods = (context.itemCategories.classmods ?? [])
      .sort((lhs, rhs) => rhs.system.levels - lhs.system.levels);
    context.classes = (context.itemCategories.classes ?? [])
      .sort((lhs, rhs) => rhs.system.levels - lhs.system.levels);
    for ( const cls of context.classes ) {
      const ctx = context.itemContext[cls.id] ??= {};
      const subclass = context.subclasses.findSplice(s => s.system.classIdentifier === cls.identifier);
      if ( !subclass ) {
        const subclassAdvancement = cls.advancement.byType.Subclass?.[0];
        if ( subclassAdvancement && (subclassAdvancement.level <= cls.system.levels) ) ctx.needsSubclass = true;
      }
    }

    // List
    const Inventory = customElements.get(this.options.elements.inventory);
    const columns = Inventory.mapColumns([{ id: "uses", order: 200 }, "recovery", "controls"]);
    const sections = [
      { columns, id: "active", label: "DND5E.FeatureActive", order: 100, groups: { activation: "active" }, items: [] },
      { columns, id: "passive", label: "DND5E.FeaturePassive", order: 200, groups: { activation: "passive" } },
      ...Object.values(this.actor.classes ?? {})
        .sort((a, b) => b.system.levels - a.system.levels)
        .map((cls, i) => {
          return {
            columns, id: cls.identifier, order: i * 100, groups: { origin: cls.identifier },
            label: game.i18n.format("DND5E.FeaturesClass", { class: cls.name })
          };
        }),
      ...Object.values(this.actor.classmods ?? {})
        .sort((a, b) => b.system.levels - a.system.levels)
        .map((classmod, i) => {
          return {
            columns, id: classmod.identifier, order: 500 + (i * 100), groups: { origin: classmod.identifier },
            label: game.i18n.format("N5EB.FeaturesClassmod", { classmod: classmod.name })
          };
        }),
      this.actor.system.details.race instanceof Item5e ? {
        columns, id: "species", label: "DND5E.Species.Features", order: 1000, groups: { origin: "species" }
      } : null,
      this.actor.system.details.background instanceof Item5e ? {
        columns, id: "background", label: "DND5E.FeaturesBackground", order: 2000, groups: { origin: "background" }
      } : null,
      { columns, id: "other", label: "DND5E.FeaturesOther", order: 3000, groups: { origin: "other" } }
    ].filter(_ => _);
    sections[0].items = [...(context.itemCategories.features ?? []), ...context.subclasses];
    context.sections = Inventory.prepareSections(sections);
    context.listControls = {
      label: "DND5E.FeatureSearch",
      list: "features",
      filters: [
        { key: "action", label: "DND5E.Action" },
        { key: "bonus", label: "DND5E.BonusAction" },
        { key: "reaction", label: "DND5E.Reaction" },
        { key: "sr", label: "DND5E.REST.Short.Label" },
        { key: "lr", label: "DND5E.REST.Long.Label" },
        { key: "concentration", label: "DND5E.Concentration" },
        { key: "mgc", label: "DND5E.ITEM.Property.Magical" }
      ],
      sorting: [
        { key: "m", label: "SIDEBAR.SortModeManual", dataset: { icon: "fa-solid fa-arrow-down-short-wide" } },
        { key: "a", label: "SIDEBAR.SortModeAlpha", dataset: { icon: "fa-solid fa-arrow-down-a-z" } }
      ],
      grouping: [
        {
          key: "origin",
          label: "DND5E.FilterGroupOrigin",
          dataset: { icon: "fa-solid fa-layer-group", classes: "active" }
        },
        { key: "activation", label: "DND5E.FilterGroupOrigin", dataset: { icon: "fa-solid fa-layer-group" } }
      ]
    };

    // TODO: Add this warning during data preparation instead
    // const message = game.i18n.format("DND5E.SubclassMismatchWarn", {
    //   name: subclass.name, class: subclass.system.classIdentifier
    // });
    // context.warnings.push({ message, type: "warning" });
    context.showClassDrop = !context.classes.length || this.isEditMode;
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the header.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareHeaderContext(context, options) {
    if ( this.actor.limited ) {
      context.portrait = await this._preparePortrait(context);
      return context;
    }

    // Classes Label
    context.labels.class = Object.values(this.actor.classes).sort((a, b) => {
      return b.system.levels - a.system.levels;
    }).map(c => `${c.name} ${c.system.levels}`).join(" / ");

    // Experience & Epic Boons
    if ( context.system.details.xp.boonsEarned !== undefined ) {
      const pluralRules = new Intl.PluralRules(game.i18n.lang);
      context.epicBoonsEarned = game.i18n.format(
        `DND5E.ExperiencePoints.Boons.${pluralRules.select(context.system.details.xp.boonsEarned ?? 0)}`,
        { number: formatNumber(context.system.details.xp.boonsEarned ?? 0, { signDisplay: "always" }) }
      );
    }

    // Will of Fire
    const willOfFire = Math.clamp(Math.floor(Number(context.system.attributes.inspiration) || 0), 0, MAX_WILL_OF_FIRE);
    const willOfFireLabel = game.i18n.localize("N5EB.WillOfFire.Label");
    context.willOfFire = Array.fromRange(MAX_WILL_OF_FIRE, 1).map(n => {
      const filled = willOfFire >= n;
      const label = game.i18n.format("N5EB.WillOfFire.Pip", { n, max: MAX_WILL_OF_FIRE });
      const classes = ["pip"];
      if ( filled ) classes.push("filled");
      return { n, filled, label, tooltip: willOfFireLabel, classes: classes.join(" ") };
    });

    // Visibility
    context.showExperience = game.settings.get("n5eb", "levelingMode") !== "noxp";
    context.showRests = game.user.isGM || (this.actor.isOwner && game.settings.get("n5eb", "allowRests"));

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareInventoryContext(context, options) {
    context.itemCategories.inventory = context.itemCategories.inventory?.filter(i => i.type !== "container");
    context = await super._prepareInventoryContext(context, options);
    context.size = {
      label: CONFIG.DND5E.actorSizes[this.actor.system.traits.size]?.label ?? this.actor.system.traits.size,
      abbr: CONFIG.DND5E.actorSizes[this.actor.system.traits.size]?.abbreviation ?? "—",
      mod: this.actor.system.attributes.encumbrance.mod
    };
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering context for the sidebar.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareSidebarContext(context, options) {
    const { attributes } = this.actor.system;
    context.portrait = await this._preparePortrait(context);

    // Death Saves
    const plurals = new Intl.PluralRules(game.i18n.lang, { type: "ordinal" });
    context.death = {
      open: this._deathTrayOpen
    };
    for ( const deathSave of ["success", "failure"] ) {
      context.death[deathSave] = [];
      for ( let i = 1; i < 4; i++ ) {
        const n = deathSave === "failure" ? i : 4 - i;
        const i18nKey = `DND5E.DeathSave${deathSave.titleCase()}Label`;
        const filled = attributes.death[deathSave] >= n;
        const classes = ["pip"];
        if ( filled ) classes.push("filled");
        classes.push(deathSave);
        context.death[deathSave].push({
          n, filled,
          tooltip: i18nKey,
          label: game.i18n.localize(`${i18nKey}N.${plurals.select(n)}`),
          classes: classes.join(" ")
        });
      }
    }

    // Exhaustion
    if ( CONFIG.DND5E.conditionTypes.exhaustion ) {
      const max = CONFIG.DND5E.conditionTypes.exhaustion.levels;
      const deathAt = CONFIG.DND5E.conditionTypes.exhaustion.deathAt ?? max;
      context.exhaustion = Array.fromRange(max, 1).reduce((acc, n) => {
        const label = game.i18n.format("DND5E.ExhaustionLevel", { n });
        const classes = ["pip"];
        const filled = attributes.exhaustion >= n;
        if ( filled ) classes.push("filled");
        if ( n >= deathAt ) classes.push("death");
        const pip = { n, label, filled, tooltip: label, classes: classes.join(" ") };

        if ( n <= max / 2 ) acc.left.push(pip);
        else acc.right.push(pip);
        return acc;
      }, { left: [], right: [] });
    }

    // Favorites
    context.favorites = await this._prepareFavorites();

    // Speed
    context.speed = Object.entries(CONFIG.DND5E.movementTypes).reduce((obj, [k, { hidden, label }]) => {
      if ( hidden ) return obj;
      const value = attributes.movement[k];
      if ( (k === "fly") && attributes.movement.hover ) {
        label = game.i18n.format("DND5E.MOVEMENT.HoverSpeed", { speed: label });
      }
      if ( value > obj.value ) Object.assign(obj, { label, value });
      return obj;
    }, { label: CONFIG.DND5E.movementTypes.walk?.label, value: 0 });

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareSpellsContext(context, options) {
    context = await super._prepareSpellsContext(context, options);

    // Jutsu Casting
    const { attributes } = this.actor.system;
    context.spellcasting = Object.entries(CONFIG.DND5E.jutsuCastingTypes).map(([key, config]) => {
      const casting = attributes.jutsu[key];
      return {
        key,
        label: config.label,
        ability: {
          ability: casting.ability,
          label: casting.abilityLabel,
          mod: casting.mod
        },
        attack: casting.attack,
        save: casting.dc,
        concentration: {
          mod: attributes.concentration.save,
          tooltip: game.i18n.format("DND5E.AbilityConfigure", { ability: game.i18n.localize("DND5E.Concentration") })
        }
      };
    });
    context.spellcasting.push(...getClassmodArtsSpellcastingCards(this.actor));
    context.jutsuKnown = attributes.jutsu.known;

    return context;
  }

  /* -------------------------------------------- */
  /*  Actor Preparation Helpers                   */
  /* -------------------------------------------- */

  /**
   * Prepare favorites for display.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @returns {Promise<object>}
   * @protected
   */
  async _prepareFavorites(context) {
    // Legacy resources
    const resources = Object.entries(this.actor.system.resources).reduce((arr, [k, r]) => {
      const { value, max, sr, lr, label } = r;
      const source = this.actor._source.system.resources[k];
      if ( label && max ) arr.push({
        id: `resources.${k}`,
        type: "resource",
        img: "icons/svg/upgrade.svg",
        resource: { value, max, source },
        css: "uses",
        title: label,
        subtitle: [
          sr ? game.i18n.localize("DND5E.AbbreviationSR") : null,
          lr ? game.i18n.localize("DND5E.AbbreviationLR") : null
        ].filterJoin(" &bull; ")
      });
      return arr;
    }, []);

    return resources.concat(await this.actor.system.favorites.reduce(async (arr, f) => {
      const { id, type, sort } = f;
      const favorite = await fromUuid(id, { relative: this.actor });
      if ( !favorite && ((type === "item") || (type === "effect") || (type === "activity")) ) return arr;
      if ( favorite?.dependentOrigin?.active === false ) return arr;
      arr = await arr;

      let data;
      if ( type === "item" ) data = await favorite.system.getFavoriteData();
      else if ( (type === "effect") || (type === "activity") ) data = await favorite.getFavoriteData();
      else data = await this._getFavoriteData(type, id);
      if ( !data ) return arr;
      let {
        img, title, subtitle, value, uses, quantity, modifier, passive,
        save, range, reference, toggle, suppressed, level
      } = data;

      if ( foundry.utils.getType(save?.ability) === "Set" ) save = {
        ...save, ability: save.ability.size > 2
          ? game.i18n.localize("DND5E.AbbreviationDC")
          : Array.from(save.ability).map(k => CONFIG.DND5E.abilities[k]?.abbreviation).filterJoin(" / ")
      };

      const css = [];
      if ( uses?.max ) {
        css.push("uses");
        uses.value = Math.round(uses.value);
      }
      else if ( modifier !== undefined ) css.push("modifier");
      else if ( save?.dc ) css.push("save");
      else if ( value !== undefined ) css.push("value");

      if ( toggle === false ) css.push("disabled");
      if ( uses?.max > 99 ) css.push("uses-sm");
      if ( modifier !== undefined ) {
        const value = Number(modifier.replace?.(/\s+/g, "") ?? modifier);
        if ( !isNaN(value) ) modifier = value;
      }

      const rollableClass = [];
      if ( this.isEditable && (type !== "slots") ) rollableClass.push("rollable");
      if ( type === "skill" ) rollableClass.push("skill-name");
      else if ( type === "tool" ) rollableClass.push("tool-name");

      if ( suppressed ) subtitle = game.i18n.localize("DND5E.Suppressed");
      const itemId = type === "item" ? favorite.id : type === "activity" ? favorite.item.id : null;
      arr.push({
        id, img, type, title, value, uses, sort, save, modifier, passive, range, reference, suppressed, level, itemId,
        draggable: ["item", "effect"].includes(type),
        effectId: type === "effect" ? favorite.id : null,
        parentId: (type === "effect") && (favorite.parent !== favorite.target) ? favorite.parent.id: null,
        activityId: type === "activity" ? favorite.id : null,
        key: (type === "skill") || (type === "tool") ? id : null,
        toggle: toggle === undefined ? null : { applicable: true, value: toggle },
        quantity: quantity > 1 ? quantity : "",
        rollableClass: rollableClass.filterJoin(" "),
        css: css.filterJoin(" "),
        bareName: type === "slots",
        subtitle: Array.isArray(subtitle) ? subtitle.filterJoin(" &bull; ") : subtitle
      });
      return arr;
    }, [])).sort((a, b) => a.sort - b.sort);
  }

  /* -------------------------------------------- */

  /**
   * Prepare data for a favorited entry.
   * @param {"skill"|"tool"|"slots"} type  The type of favorite.
   * @param {string} id                    The favorite's identifier.
   * @returns {Promise<FavoriteData5e|void>}
   * @protected
   */
  async _getFavoriteData(type, id) {
    // Spell slots
    if ( type === "slots" ) {
      const { value, max, level, type: method } = this.actor.system.spells?.[id] ?? {};
      const model = CONFIG.DND5E.spellcasting[method];
      const uses = { value, max, name: `system.spells.${id}.value` };
      if ( !model || model.isSingleLevel ) return {
        uses, level, method,
        title: game.i18n.localize(`DND5E.SpellSlots${id.capitalize()}`),
        subtitle: [
          game.i18n.localize(`DND5E.SpellLevel${level}`),
          game.i18n.localize(`DND5E.Abbreviation${model?.isSR ? "SR" : "LR"}`)
        ],
        img: model?.img || CONFIG.DND5E.spellcasting.pact.img
      };

      const plurals = new Intl.PluralRules(game.i18n.lang, { type: "ordinal" });
      return {
        uses, level, method,
        title: game.i18n.format(`DND5E.SpellSlotsN.${plurals.select(level)}`, { n: level }),
        subtitle: game.i18n.localize(`DND5E.Abbreviation${model.isSR ? "SR" : "LR"}`),
        img: model.img.replace("{id}", id)
      };
    }

    // Skills & Tools
    else {
      const data = this.actor.system[`${type}s`]?.[id];
      if ( !data ) return;
      const { total, ability, passive } = data ?? {};
      const subtitle = game.i18n.format("DND5E.AbilityPromptTitle", {
        ability: CONFIG.DND5E.abilities[ability].label
      });
      let img;
      let title;
      let reference;
      if ( type === "tool" ) {
        reference = Trait.getBaseItemUUID(CONFIG.DND5E.tools[id]?.id ?? "");
        ({ img, name: title } = Trait.getBaseItem(reference, { indexOnly: true }));
      }
      else if ( type === "skill" ) ({ icon: img, label: title, reference } = CONFIG.DND5E.skills[id]);
      return { img, title, subtitle, modifier: total, passive, reference };
    }
  }

  /* -------------------------------------------- */
  /*  Item Preparation Helpers                    */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _assignItemCategories(item) {
    switch ( item.type ) {
      case "background": return new Set(["background"]);
      case "class": return new Set(["classes"]);
      case "classmod": return new Set(["classmods", "features"]);
      case "facility": return new Set(["facilities"]);
      case "race": return new Set(["species"]);
      case "subclass": return new Set(["subclasses"]);
      default: return super._assignItemCategories(item);
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare context for a facility.
   * @param {Item5e} item  Item being prepared for display.
   * @param {object} ctx   Item specific context.
   * @protected
   */
  async _prepareItemFacility(item, ctx) {
    const { id, img, labels, name, system } = item;
    const { building, craft, defenders, disabled, free, hirelings, progress, size, trade, type } = system;
    const subtitle = [
      building.built ? CONFIG.DND5E.facilities.sizes[size].label : game.i18n.localize("DND5E.FACILITY.Build.Unbuilt")
    ];
    if ( trade.stock.max ) subtitle.push(`${trade.stock.value ?? 0} &sol; ${trade.stock.max}`);
    Object.assign(ctx, {
      id, labels, name, building, disabled, free, progress,
      craft: craft.item ? await fromUuid(craft.item) : null,
      creatures: await this._prepareItemFacilityLivestock(trade),
      defenders: await this._prepareItemFacilityOccupants(defenders),
      executing: CONFIG.DND5E.facilities.orders[progress.order]?.icon,
      hirelings: await this._prepareItemFacilityOccupants(hirelings),
      img: foundry.utils.getRoute(img),
      isSpecial: type.value === "special",
      subtitle: subtitle.join(" &bull; ")
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare facility livestock for display.
   * @param {object} trade  Facility trade information.
   * @returns {Promise<object[]>}
   * @protected
   */
  async _prepareItemFacilityLivestock(trade) {
    const creatures = await this._prepareItemFacilityOccupants(trade.creatures);
    const pending = trade.pending.creatures;
    return [
      ...(await Promise.all((pending ?? []).map(async (uuid, index) => {
        return { index, actor: await fromUuid(uuid), pending: true };
      }))),
      ...creatures
    ];
  }

  /* -------------------------------------------- */

  /**
   * Prepare facility occupants for display.
   * @param {FacilityOccupants} occupants  The occupants.
   * @returns {Promise<object[]>}
   * @protected
   */
  _prepareItemFacilityOccupants(occupants) {
    const { max, value } = occupants;
    return Promise.all(Array.fromRange(max).map(async index => {
      const uuid = value[index];
      if ( uuid ) return { index, actor: await fromUuid(uuid) };
      return { empty: true };
    }));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareItemFeature(item, ctx) {
    if ( item.type === "facility" ) return this._prepareItemFacility(item, ctx);

    await super._prepareItemFeature(item, ctx);

    const [originId] = (item.getFlag("n5eb", "advancementRoot") ?? item.getFlag("n5eb", "advancementOrigin"))
      ?.split(".") ?? [];
    const group = item.parent.items.get(originId);
    ctx.groups.origin = "other";
    switch ( group?.type ) {
      case "race": ctx.groups.origin = "species"; break;
      case "background": ctx.groups.origin = "background"; break;
      case "class": ctx.groups.origin = group.identifier; break;
      case "subclass": ctx.groups.origin = group.class?.identifier ?? "other"; break;
      case "classmod": ctx.groups.origin = group.identifier; break;
    }

    ctx.groups.activation = item.system.properties?.has("trait") || !item.system.activities?.size
      ? "passive"
      : "active";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareItemPhysical(item, ctx) {
    ctx.concealDetails = !game.user.isGM && (item.system.identified === false);
    ctx.isStack = Number.isNumeric(item.system.quantity) && (item.system.quantity !== 1);

    if ( item.system.attunement ) ctx.attunement = item.system.attuned ? {
      icon: "fa-sun",
      cls: "attuned",
      title: "DND5E.AttunementAttuned"
    } : {
      icon: "fa-sun",
      cls: "not-attuned",
      title: CONFIG.DND5E.attunementTypes[item.system.attunement]
    };

    return super._prepareItemPhysical(item, ctx);
  }

  /* -------------------------------------------- */
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);

    // Apply special context menus for items outside inventory elements
    const featuresElement = this.element.querySelector(`[data-tab="features"] ${this.options.elements.inventory}`);
    if ( featuresElement ) new ContextMenu5e(
      this.element, ".pills-lg [data-item-id], .favorites [data-item-id], .facility[data-item-id]", [],
      { onOpen: (...args) => featuresElement._onOpenContextMenu(...args), jQuery: false }
    );
    const inventoryElement = this.element.querySelector(`[data-tab="inventory"] ${this.options.elements.inventory}`);
    if ( inventoryElement ) new ContextMenu5e(
      this.element, ".containers [data-item-id]", [],
      { onOpen: (...args) => featuresElement._onOpenContextMenu(...args), jQuery: false }
    );
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    if ( !this.actor.limited ) {
      this._renderAttunement(context, options);
      this._renderSpellbook(context, options);
    }

    // Show death tray at 0 HP
    const renderContext = options.renderContext ?? options.action;
    const renderData = options.renderData ?? options.data;
    const isUpdate = (renderContext === "update") || (renderContext === "updateActor");
    const hp = foundry.utils.getProperty(renderData ?? {}, "system.attributes.hp.value");
    if ( isUpdate && (hp === 0) ) this._toggleDeathTray(true);

    this._boundDowntimeEditActivityClick ??= this._onDowntimeEditActivityClick.bind(this);
    this._downtimeEditListenerDocument?.removeEventListener("click", this._boundDowntimeEditActivityClick, true);
    this._downtimeEditListenerDocument?.removeEventListener("mousedown", this._boundDowntimeEditActivityClick, true);
    this._downtimeEditListenerDocument?.removeEventListener("pointerdown", this._boundDowntimeEditActivityClick, true);
    this._downtimeEditListenerDocument = this.element.ownerDocument;
    this._downtimeEditListenerDocument.addEventListener("click", this._boundDowntimeEditActivityClick, true);
    this._downtimeEditListenerDocument.addEventListener("mousedown", this._boundDowntimeEditActivityClick, true);
    this._downtimeEditListenerDocument.addEventListener("pointerdown", this._boundDowntimeEditActivityClick, true);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onClose(options) {
    this._downtimeEditListenerDocument?.removeEventListener("click", this._boundDowntimeEditActivityClick, true);
    this._downtimeEditListenerDocument?.removeEventListener("mousedown", this._boundDowntimeEditActivityClick, true);
    this._downtimeEditListenerDocument?.removeEventListener("pointerdown", this._boundDowntimeEditActivityClick, true);
    this._downtimeEditListenerDocument = null;
    await super._onClose(options);
  }

  /* -------------------------------------------- */

  /**
   * Open downtime activity editing before the sheet form handles the click.
   * @param {PointerEvent} event  Triggering click event.
   * @protected
   */
  _onDowntimeEditActivityClick(event) {
    const target = event.target.closest?.('[data-downtime-edit="true"]');
    if ( !target || !this.element.contains(target) ) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if ( this._downtimeEditActivityOpening ) return;
    this._downtimeEditActivityOpening = true;
    Promise.resolve(CharacterActorSheet.#editDowntimeActivity.call(this, event, target))
      .finally(() => setTimeout(() => this._downtimeEditActivityOpening = false, 0));
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle adding a downtime activity.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|void>}
   */
  static async #addDowntimeActivity(event, target) {
    if ( !this.actor.isOwner ) return;
    const mode = target.dataset.mode ?? "custom";
    if ( mode === "edit" ) return CharacterActorSheet.#editDowntimeActivity.call(this, event, target);
    if ( mode === "compendium" ) {
      const filters = { locked: { types: new Set(["downtime"]) } };
      const result = await CompendiumBrowser.selectOne({ filters, tab: "downtime" }, this._detachOptions());
      const item = result ? await fromUuid(result) : null;
      if ( item ) return this.#createDowntimeActivityFromItem(item);
      return;
    }

    const activity = this.#newDowntimeActivity({
      custom: true,
      name: game.i18n.localize("N5EB.DOWNTIME.CustomActivity")
    });
    return this.#updateDowntimeActivities([...this.#getDowntimeActivities(), activity]);
  }

  /* -------------------------------------------- */

  /**
   * Handle adjusting available downtime weeks.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|void>}
   */
  static async #adjustDowntimeWeeks(event, target) {
    if ( !this.actor.isOwner ) return;
    const delta = Number(target.dataset.delta ?? 0);
    if ( !Number.isFinite(delta) || !delta ) return;
    const weeks = this.#getDowntimeData().weeks;
    const available = Math.max(0, Number(weeks.available ?? 0) + delta);
    return this.#updateDowntime({ weeks: { available } });
  }

  /* -------------------------------------------- */

  /**
   * Handle completing a downtime activity.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|void>}
   */
  static async #completeDowntimeActivity(event, target) {
    if ( !this.actor.isOwner ) return;
    return this.#patchDowntimeActivity(target, activity => {
      activity.status = "completed";
      activity.completedAt = new Date().toISOString();
    });
  }

  /* -------------------------------------------- */

  /**
   * Claim a crafted downtime target as an owned actor item.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|Item5e[]|void>}
   */
  static async #claimDowntimeCraftingResult(event, target) {
    if ( !this.actor.isOwner ) return;
    const activity = this.#getDowntimeActivity(target);
    if ( !activity || !isCraftingActivity(activity) ) return;
    if ( activity.status !== "completed" ) {
      ui.notifications.warn("N5EB.DOWNTIME.Crafting.NotCompleted", { localize: true });
      return;
    }
    if ( activity.result?.claimed ) {
      ui.notifications.warn("N5EB.DOWNTIME.Crafting.AlreadyClaimed", { localize: true });
      return;
    }
    const item = activity.target?.uuid ? await fromUuid(activity.target.uuid) : null;
    if ( !item ) {
      ui.notifications.warn("N5EB.DOWNTIME.Crafting.NoTarget", { localize: true });
      return;
    }

    const source = item.pack ? game.items.fromCompendium(item, { keepId: false }) : item.toObject();
    delete source._id;
    source.system ??= {};
    source.system.quantity = Math.max(1, Number(source.system.quantity ?? 1));
    foundry.utils.setProperty(source, "flags.n5eb.downtimeCrafting", {
      activityId: activity._id,
      activityName: activity.name,
      templateUuid: activity.templateUuid,
      sourceUuid: item.uuid,
      claimedAt: new Date().toISOString()
    });

    const [created] = await this.actor.createEmbeddedDocuments("Item", [source]);
    if ( !created ) return;
    const activities = this.#getDowntimeActivities();
    const updated = activities.find(a => a._id === activity._id);
    if ( updated ) {
      updated.result = {
        claimed: true,
        itemUuid: created.uuid,
        itemId: created.id,
        claimedAt: new Date().toISOString()
      };
      await this.#updateDowntimeActivities(activities);
    }
    ui.notifications.info(game.i18n.format("N5EB.DOWNTIME.Crafting.Claimed", {
      item: created.name, activity: activity.name
    }));
    return [created];
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting a downtime activity.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|void>}
   */
  static async #deleteDowntimeActivity(event, target) {
    if ( !this.actor.isOwner ) return;
    const activity = this.#getDowntimeActivity(target);
    if ( !activity ) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      content: `<p>${game.i18n.format("N5EB.DOWNTIME.DeleteConfirm", { name: activity.name })}</p>`,
      window: { title: "N5EB.DOWNTIME.Delete" },
      position: { width: 400 }
    }, { rejectClose: false });
    if ( !confirmed ) return;
    return this.#updateDowntimeActivities(this.#getDowntimeActivities().filter(a => a._id !== activity._id));
  }

  /* -------------------------------------------- */

  /**
   * Handle editing a downtime activity.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|void>}
   */
  static async #editDowntimeActivity(event, target) {
    if ( !this.actor.isOwner ) return;
    const activity = this.#getDowntimeActivity(target);
    if ( !activity ) return;
    const edited = await this.#promptDowntimeActivity(activity);
    if ( edited ) return this.#patchDowntimeActivity(target, data => foundry.utils.mergeObject(data, edited));
  }

  /* -------------------------------------------- */

  /**
   * Handle reopening a completed downtime activity.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|void>}
   */
  static async #reopenDowntimeActivity(event, target) {
    if ( !this.actor.isOwner ) return;
    return this.#patchDowntimeActivity(target, activity => {
      activity.status = "active";
      activity.completedAt = "";
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling a downtime activity check.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<D20Roll[]|void>}
   */
  static async #rollDowntimeActivity(event, target) {
    const activity = this.#getDowntimeActivity(target);
    const roll = activity?.roll;
    if ( !activity || !roll?.enabled ) return ui.notifications.warn("N5EB.DOWNTIME.Roll.NoRoll", { localize: true });

    const flavor = [
      roll.label || activity.name,
      roll.dc ? game.i18n.format("N5EB.DOWNTIME.Roll.DC", { dc: roll.dc }) : null
    ].filterJoin(" - ");
    const ability = roll.ability || undefined;
    if ( roll.tool ) return this.actor.rollToolCheck({ event, tool: roll.tool, ability }, {}, { flavor });
    if ( roll.skill ) return this.actor.rollSkill({ event, skill: roll.skill, ability }, {}, { flavor });
    if ( roll.ability ) return this.actor.rollAbilityCheck({ event, ability: roll.ability }, {}, { flavor });
    return ui.notifications.warn("N5EB.DOWNTIME.Roll.NoRoll", { localize: true });
  }

  /* -------------------------------------------- */

  /**
   * Handle spending one downtime week.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|void>}
   */
  static async #spendDowntimeWeek(event, target) {
    if ( !this.actor.isOwner ) return;
    const override = target.dataset.override === "true";
    const downtime = this.#getDowntimeData();
    const weeks = downtime.weeks;
    const remaining = Number(weeks.available ?? 0) - Number(weeks.spent ?? 0);
    if ( (remaining <= 0) && !override ) {
      ui.notifications.warn("N5EB.DOWNTIME.Weeks.NoRemaining", { localize: true });
      return;
    }

    const activities = downtime.activities;
    const activity = activities.find(a => a._id === target.closest("[data-activity-id]")?.dataset.activityId);
    if ( !activity ) return;
    activity.progress ??= {};
    const progress = Number(activity.progress.value ?? 0) + 1;
    const max = Number(activity.progress.max ?? 0);
    activity.progress.value = max > 0 ? Math.min(progress, max) : progress;
    return this.#updateDowntime({
      activities,
      weeks: { spent: Math.max(0, Number(weeks.spent ?? 0) + 1) }
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle adding a downtime payment ledger entry.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<Actor5e|void>}
   */
  static async #manageDowntimePayment(event, target) {
    if ( !this.actor.isOwner ) return;
    const activity = this.#getDowntimeActivity(target);
    if ( !activity ) return;
    const summary = getDowntimeCostSummary(activity);
    const entry = await this.#promptDowntimePayment(activity, summary);
    if ( !entry ) return;

    const downtime = this.#getDowntimeData();
    const updated = downtime.activities.find(a => a._id === activity._id);
    if ( !updated ) return;
    updated.cost.ledger.push(entry);
    updated.cost.paid = getDowntimeCostSummary(updated).remaining <= 0;

    const updateData = { "system.downtime": downtime };
    if ( entry.deducted && ["payment", "refund"].includes(entry.type) ) {
      const ryo = Number(this.actor.system.currency?.ryo ?? 0);
      const delta = entry.type === "payment" ? -entry.amount : entry.amount;
      if ( (ryo + delta) < 0 ) {
        ui.notifications.warn("N5EB.DOWNTIME.Payment.InsufficientRyo", { localize: true });
        return;
      }
      updateData["system.currency.ryo"] = ryo + delta;
    }
    return this.actor.update(updateData);
  }

  /* -------------------------------------------- */

  /**
   * Handle removing a favorite.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #deleteFavorite(event, target) {
    const { favoriteId } = target.closest("[data-favorite-id]")?.dataset ?? {};
    if ( favoriteId ) this.actor.system.removeFavorite(favoriteId);
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting an occupant from a facility.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #deleteOccupant(event, target) {
    const { facilityId } = target.closest("[data-facility-id]")?.dataset ?? {};
    const { prop } = target.closest("[data-prop]")?.dataset ?? {};
    const { index } = target.closest("[data-index]")?.dataset ?? {};
    const facility = this.actor.items.get(facilityId);
    if ( !facility || !prop || (index === undefined) ) return;

    // Prompt to clear a pending trade
    if ( target.closest(".occupant-slot.pending") ) {
      const result = await foundry.applications.api.DialogV2.confirm({
        content: `
          <p>
            <strong>${game.i18n.localize("AreYouSure")}</strong> ${game.i18n.localize("DND5E.Bastion.Trade.Invalid")}
          </p>
        `,
        window: {
          icon: "fa-solid fa-coins",
          title: "DND5E.Bastion.Trade.Cancel"
        },
        position: { width: 400 }
      }, { rejectClose: false });
      if ( result ) facility.update({
        system: {
          progress: { max: null, order: "", value: null },
          trade: {
            pending: { creatures: [], operation: null }
          }
        }
      });
    }

    // Remove the occupant
    else {
      let { value } = foundry.utils.getProperty(facility, prop);
      value = value.filter((_, i) => i !== Number(index));
      facility.update({ [`${prop}.value`]: value });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle finding an available item of a given type.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #findItem(event, target) {
    if ( !this.isEditable ) return;
    const { classIdentifier, facilityType, itemType: type } = target.dataset;
    const filters = { locked: { types: new Set([type]) } };

    if ( classIdentifier ) filters.locked.additional = { class: { [classIdentifier]: 1 } };
    if ( type === "class" ) {
      const existingIdentifiers = new Set(Object.keys(this.actor.classes));
      filters.initial = { additional: { properties: { sidekick: -1 } } };
      filters.locked.arbitrary = [{ o: "NOT", v: { k: "system.identifier", o: "in", v: existingIdentifiers } }];
    }
    if ( type === "facility" ) {
      const otherType = facilityType === "basic" ? "special" : "basic";
      filters.locked.additional = {
        type: { [facilityType]: 1, [otherType]: -1 },
        level: { max: this.actor.system.details.level }
      };
    }

    const result = await CompendiumBrowser.selectOne({ filters }, this._detachOptions());
    if ( result ) this._onDropCreateItems(event, [game.items.fromCompendium(await fromUuid(result), { keepId: true })]);
  }

  /* -------------------------------------------- */

  /**
   * Handle setting the character's spellcasting ability.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #setSpellcastingAbility(event, target) {
    const ability = target.closest("[data-ability]")?.dataset.ability;
    this.submit({ updateData: { "system.attributes.spellcasting": ability } });
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the death saves tray.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #toggleDeathTray(event, target) {
    this._toggleDeathTray();
  }

  /* -------------------------------------------- */

  /**
   * Toggle the death save tray.
   * @param {boolean} [open]  Force a particular open state.
   * @protected
   */
  _toggleDeathTray(open) {
    const tray = this.form.querySelector(".death-tray");
    const tab = tray.querySelector(".death-tab");
    tray.classList.toggle("open", open);
    this._deathTrayOpen = tray.classList.contains("open");
    tab.dataset.tooltip = `DND5E.DeathSave${this._deathTrayOpen ? "Hide" : "Show"}`;
    tab.setAttribute("aria-label", game.i18n.localize(tab.dataset.tooltip));
  }

  /* -------------------------------------------- */

  /**
   * Handle using a facility.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #useFacility(event, target) {
    if ( !target.classList.contains("rollable") ) return;
    const { facilityId } = target.closest("[data-facility-id]")?.dataset ?? {};
    const facility = this.actor.items.get(facilityId);
    facility?.use({ legacy: false, chooseActivity: true, event });
  }

  /* -------------------------------------------- */

  /**
   * Handle using a favorited item.
   * @this {CharacterActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #useFavorite(event, target) {
    if ( !this.isEditable || (event.target.tagName === "INPUT") ) return;
    const { favoriteId } = target.closest("[data-favorite-id]").dataset;
    const favorite = await fromUuid(favoriteId, { relative: this.actor });
    if ( (favorite instanceof dnd5e.documents.Item5e) || target.dataset.activityId ) {
      if ( favorite.type === "container" ) this._renderChild(favorite.sheet);
      else favorite.use({ event }, { options: { sheet: this } });
    }
    else if ( favorite instanceof dnd5e.dataModels.activity.BaseActivityData ) {
      if ( favorite.canUse ) favorite.use({ event }, { options: { sheet: this } });
    }
    else if ( favorite instanceof dnd5e.documents.ActiveEffect5e ) favorite.update({ disabled: !favorite.disabled });
    else {
      const { key } = target.closest("[data-key]")?.dataset ?? {};
      if ( key ) {
        if ( target.classList.contains("skill-name") ) this.actor.rollSkill({ event, skill: key });
        else if ( target.classList.contains("tool-name") ) this.actor.rollToolCheck({ event, tool: key });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  _defaultDropBehavior(event, data) {
    if ( (data.type === "Item") && event.target.closest('[data-tab="downtime"]') ) return "copy";
    if ( data.dnd5e?.action === "favorite" || (["Activity", "Item"].includes(data.type)
      && event.target.closest(".favorites")) ) return "link";
    return super._defaultDropBehavior(event, data);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragStart(event) {
    const methods = CONFIG.DND5E.spellcasting;
    const { key } = event.target.closest("[data-key]")?.dataset ?? {};
    const { level, method } = event.target.closest("[data-level]")?.dataset ?? {};
    const isSlots = event.target.closest("[data-favorite-id]") || event.target.classList.contains("items-header");
    let type;
    if ( key in CONFIG.DND5E.skills ) type = "skill";
    else if ( key in CONFIG.DND5E.tools ) type = "tool";
    else if ( methods[method]?.slots && (level !== "0") && isSlots ) type = "slots";
    if ( !type ) return super._onDragStart(event);

    // Add another deferred deactivation to catch the second pointerenter event that seems to be fired on Firefox.
    requestAnimationFrame(() => game.tooltip.deactivate());
    game.tooltip.deactivate();

    const dragData = { dnd5e: { action: "favorite", type } };
    if ( type === "slots" ) dragData.dnd5e.id = methods[method].getSpellSlotKey(Number(level));
    else dragData.dnd5e.id = key;
    event.dataTransfer.setData("application/json", JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = "link";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onDrop(event) {
    if ( !event.target.closest(".favorites") ) return super._onDrop(event);
    const dragData = event.dataTransfer.getData("application/json") || event.dataTransfer.getData("text/plain");
    if ( !dragData ) return super._onDrop(event);
    let data;
    try {
      data = JSON.parse(dragData);
    } catch(e) {
      console.error(e);
      return;
    }
    const { action, type, id } = data.dnd5e ?? {};
    if ( action === "favorite" ) return this._onDropFavorite(event, { type, id });
    if ( data.type === "Activity" ) {
      const activity = await fromUuid(data.uuid);
      if ( activity ) return this._onDropActivity(event, activity);
    }
    return super._onDrop(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onDropActiveEffect(event, effect) {
    if ( !event.target.closest(".favorites") || (effect.target !== this.actor) ) {
      return super._onDropActiveEffect(event, effect);
    }
    const uuid = effect.getRelativeUUID(this.actor);
    return this._onDropFavorite(event, { type: "effect", id: uuid });
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping an Activity onto the sheet.
   * @param {DragEvent} event    The originating drag event.
   * @param {Activity} activity  The dropped Activity document.
   * @returns {Promise<Actor5e|void>}
   * @protected
   */
  async _onDropActivity(event, activity) {
    if ( !event.target.closest(".favorites") || (activity.actor !== this.actor) ) return;
    const uuid = `${activity.item.getRelativeUUID(this.actor)}.Activity.${activity.id}`;
    return this._onDropFavorite(event, { type: "activity", id: uuid });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onDropActor(event, actor) {
    if ( !event.target.closest(".facility-occupants") || !actor.uuid ) return super._onDropActor(event, actor);
    const { facilityId } = event.target.closest("[data-facility-id]").dataset;
    const facility = this.actor.items.get(facilityId);
    if ( !facility ) return;
    const { prop } = event.target.closest("[data-prop]").dataset;
    const { max, value } = foundry.utils.getProperty(facility, prop);
    if ( (value.length + 1) > max ) return;
    return facility.update({ [`${prop}.value`]: [...value, actor.uuid] });
  }

  /* -------------------------------------------- */

  /**
   * Handle an owned item or effect being dropped in the favorites area.
   * @param {DragEvent} event            The triggering event.
   * @param {ActorFavorites5e} favorite  The favorite that was dropped.
   * @returns {Promise<Actor5e>|void}
   * @protected
   */
  _onDropFavorite(event, favorite) {
    if ( this.actor.system.hasFavorite(favorite.id) ) return this._onSortFavorites(event, favorite.id);
    return this.actor.system.addFavorite(favorite);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onDropItem(event, item) {
    if ( event.target.closest('[data-tab="downtime"]') && (item.type === "downtime") ) {
      return this.#createDowntimeActivityFromItem(item);
    }
    if ( event.target.closest('[data-tab="downtime"]') ) {
      const target = event.target.closest("[data-activity-id]");
      if ( target ) return this.#setDowntimeActivityTarget(target, item);
    }
    if ( !event.target.closest(".favorites") || (item.parent !== this.actor) ) return super._onDropItem(event, item);
    const uuid = item.getRelativeUUID(this.actor);
    return this._onDropFavorite(event, { type: "item", id: uuid });
  }

  /* -------------------------------------------- */

  /** @override */
  async _onDropSingleItem(event, itemData, options={}) {
    // Increment the number of class levels a character instead of creating a new item
    if ( itemData.type === "class" ) {
      const charLevel = this.actor.system.details.level;
      itemData.system.levels = Math.min(itemData.system.levels, CONFIG.DND5E.maxLevel - charLevel);
      if ( itemData.system.levels <= 0 ) {
        const err = game.i18n.format("DND5E.MaxCharacterLevelExceededWarn", { max: CONFIG.DND5E.maxLevel });
        ui.notifications.error(err);
        return;
      }

      const cls = this.actor.itemTypes.class.find(c => c.identifier === itemData.system.identifier);
      if ( cls ) {
        const priorLevel = cls.system.levels;
        if ( !game.settings.get("n5eb", "disableAdvancements") ) {
          const manager = AdvancementManager.forLevelChange(this.actor, cls.id, itemData.system.levels);
          if ( manager.steps.length ) {
            manager.render({ force: true });
            return;
          }
        }
        cls.update({ "system.levels": priorLevel + itemData.system.levels });
        return;
      }
    }

    else if ( itemData.type === "classmod" ) {
      itemData.system.levels = Math.min(itemData.system.levels ?? 1, CONFIG.DND5E.maxClassModLevel);
      const classmod = this.actor.itemTypes.classmod.find(c => c.identifier === itemData.system.identifier);
      if ( classmod ) {
        const remaining = Math.max(CONFIG.DND5E.maxClassModLevel - classmod.system.levels, 0);
        const delta = Math.min(itemData.system.levels, remaining);
        if ( delta <= 0 ) {
          ui.notifications.error("N5EB.CLASSMOD.MaxLevelExceeded", { localize: true });
          return;
        }
        if ( !game.settings.get("n5eb", "disableAdvancements") ) {
          const manager = AdvancementManager.forClassModLevelChange(this.actor, classmod.id, delta);
          if ( manager.steps.length ) {
            manager.render({ force: true });
            return;
          }
        }
        classmod.update({ "system.levels": classmod.system.levels + delta });
        return;
      }
    }

    // If a subclass is dropped, ensure it doesn't match another subclass with the same identifier
    else if ( itemData.type === "subclass" ) {
      const other = this.actor.itemTypes.subclass.find(i => i.identifier === itemData.system.identifier);
      if ( other ) {
        const err = game.i18n.format("DND5E.SubclassDuplicateError", { identifier: other.identifier });
        ui.notifications.error(err);
        return;
      }
      const cls = this.actor.itemTypes.class.find(i => i.identifier === itemData.system.classIdentifier);
      if ( cls && cls.subclass ) {
        const err = game.i18n.format("DND5E.SubclassAssignmentError", { class: cls.name, subclass: cls.subclass.name });
        ui.notifications.error(err);
        return;
      }
    }

    return super._onDropSingleItem(event, itemData, options);
  }

  /* -------------------------------------------- */

  /**
   * Handle re-ordering the favorites list.
   * @param {DragEvent} event  The drop event.
   * @param {string} srcId     The identifier of the dropped favorite.
   * @returns {Promise<Actor5e>|void}
   * @protected
   */
  _onSortFavorites(event, srcId) {
    const dropTarget = event.target.closest("[data-favorite-id]");
    if ( !dropTarget ) return;
    let source;
    let target;
    const targetId = dropTarget.dataset.favoriteId;
    if ( srcId === targetId ) return;
    const siblings = this.actor.system.favorites.filter(f => {
      if ( f.id === targetId ) target = f;
      else if ( f.id === srcId ) source = f;
      return f.id !== srcId;
    });
    const updates = foundry.utils.performIntegerSort(source, { target, siblings });
    const favorites = this.actor.system.favorites.reduce((map, f) => map.set(f.id, { ...f }), new Map());
    for ( const { target, update } of updates ) {
      const favorite = favorites.get(target.id);
      foundry.utils.mergeObject(favorite, update);
    }
    return this.actor.update({ "system.favorites": Array.from(favorites.values()) });
  }

  /* -------------------------------------------- */
  /*  Downtime Helpers                            */
  /* -------------------------------------------- */

  /**
   * Set a downtime activity target from a dropped item.
   * @param {HTMLElement} target  Sheet control.
   * @param {Item5e} item         Dropped item.
   * @returns {Promise<Actor5e>|undefined}
   */
  #setDowntimeActivityTarget(target, item) {
    if ( !this.actor.isOwner || !item ) return undefined;
    return this.#patchDowntimeActivity(target, activity => applyDowntimeCraftingTarget(activity, item, this.actor));
  }

  /* -------------------------------------------- */

  /**
   * Build an actor-local downtime activity.
   * @param {object} [overrides={}]  Activity overrides.
   * @returns {object}
   */
  #newDowntimeActivity(overrides={}) {
    const maxSort = this.#getDowntimeActivities().reduce((sort, activity) => Math.max(sort, activity.sort ?? 0), 0);
    return foundry.utils.mergeObject({
      _id: foundry.utils.randomID(),
      identifier: "",
      templateUuid: "",
      sourceId: "",
      custom: false,
      sort: maxSort + CONST.SORT_INTEGER_DENSITY,
      name: game.i18n.localize("N5EB.DOWNTIME.NewActivity"),
      img: "icons/svg/clockwork.svg",
      category: "custom",
      status: "active",
      progress: { value: 0, max: 1 },
      cost: getDefaultDowntimeCost(),
      roll: { enabled: false, ability: "", skill: "", tool: "", dc: 0, label: "" },
      target: { type: "", uuid: "", name: "", img: "" },
      result: { claimed: false, itemUuid: "", itemId: "", claimedAt: "" },
      description: "",
      completion: "",
      notes: "",
      completedAt: ""
    }, overrides, { inplace: false });
  }

  /* -------------------------------------------- */

  /**
   * Get the complete downtime source object with defaults filled in.
   * @param {object} [overrides={}]             Downtime data overrides.
   * @param {object[]} [overrides.activities]   Activity overrides.
   * @param {object} [overrides.weeks]          Week-bank overrides.
   * @returns {object}
   */
  #getDowntimeData({ activities, weeks }={}) {
    const downtime = foundry.utils.deepClone(this.actor._source.system.downtime ?? {});
    const sourceWeeks = downtime.weeks ?? {};
    downtime.weeks = foundry.utils.mergeObject({
      available: 0,
      spent: 0,
      source: "",
      notes: ""
    }, sourceWeeks, { inplace: false });
    if ( weeks ) foundry.utils.mergeObject(downtime.weeks, weeks, { inplace: true });
    downtime.activities = Array.isArray(activities ?? downtime.activities)
      ? (activities ?? downtime.activities).map(normalizeDowntimeActivity)
      : [];
    return downtime;
  }

  /* -------------------------------------------- */

  /**
   * Get actor downtime activities as editable source clones.
   * @returns {object[]}
   */
  #getDowntimeActivities() {
    return this.#getDowntimeData().activities;
  }

  /* -------------------------------------------- */

  /**
   * Get the activity represented by a sheet control.
   * @param {HTMLElement} target  Sheet control.
   * @returns {object|null}
   */
  #getDowntimeActivity(target) {
    const id = target.closest("[data-activity-id]")?.dataset.activityId;
    if ( !id ) return null;
    return this.#getDowntimeActivities().find(a => a._id === id) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Persist the complete downtime object while preserving any untouched sibling data.
   * @param {object} [overrides={}]  Downtime data overrides.
   * @returns {Promise<Actor5e>}
   */
  #updateDowntime(overrides={}) {
    return this.actor.update({ "system.downtime": this.#getDowntimeData(overrides) });
  }

  /* -------------------------------------------- */

  /**
   * Persist the provided downtime activities.
   * @param {object[]} activities  Downtime activities.
   * @returns {Promise<Actor5e>}
   */
  #updateDowntimeActivities(activities) {
    return this.#updateDowntime({ activities });
  }

  /* -------------------------------------------- */

  /**
   * Patch a downtime activity by id.
   * @param {HTMLElement} target  Sheet control.
   * @param {Function} callback   Mutation callback.
   * @returns {Promise<Actor5e>|undefined}
   */
  #patchDowntimeActivity(target, callback) {
    const id = target.closest("[data-activity-id]")?.dataset.activityId;
    if ( !id ) return undefined;
    const activities = this.#getDowntimeActivities();
    const activity = activities.find(a => a._id === id);
    if ( !activity ) return undefined;
    callback(activity);
    return this.#updateDowntimeActivities(activities);
  }

  /* -------------------------------------------- */

  /**
   * Create an actor-local downtime activity from a downtime item template.
   * @param {Item5e} item  Downtime activity template.
   * @returns {Promise<Actor5e>}
   */
  #createDowntimeActivityFromItem(item) {
    const system = item.system ?? {};
    const activity = this.#newDowntimeActivity({
      identifier: system.identifier ?? "",
      templateUuid: item.uuid,
      sourceId: item._stats?.compendiumSource ?? item.uuid,
      custom: false,
      name: item.name,
      img: item.img,
      category: system.category ?? "custom",
      progress: {
        value: 0,
        max: Math.max(1, Number(system.weeks?.max ?? system.weeks?.value ?? 1))
      },
      cost: getDowntimeCostFromTemplate(system.cost),
      roll: {
        enabled: system.roll?.enabled ?? false,
        ability: system.roll?.ability ?? "",
        skill: system.roll?.skill ?? "",
        tool: system.roll?.tool ?? "",
        dc: Number(system.roll?.dc ?? 0),
        label: system.roll?.label ?? ""
      },
      target: {
        type: system.target?.type ?? "",
        uuid: system.target?.uuid ?? "",
        name: "",
        img: ""
      },
      result: { claimed: false, itemUuid: "", itemId: "", claimedAt: "" },
      description: system.description?.value ?? "",
      completion: system.completion ?? "",
      notes: ""
    });
    return this.#updateDowntimeActivities([...this.#getDowntimeActivities(), activity]);
  }

  /* -------------------------------------------- */

  /**
   * Prepare a downtime activity for rendering.
   * @param {object} activity  Downtime activity source.
   * @returns {object}
   */
  #prepareDowntimeActivity(activity) {
    const source = foundry.utils.deepClone(activity);
    const max = Math.max(0, Number(activity.progress?.max ?? 0));
    const value = Math.max(0, Number(activity.progress?.value ?? 0));
    const pct = max ? Math.clamp(Math.round(value * 100 / max), 0, 100) : 100;
    const category = CONFIG.DND5E.downtimeCategories[activity.category];
    const status = CONFIG.DND5E.downtimeStatuses[activity.status] ?? CONFIG.DND5E.downtimeStatuses.active;
    const payment = getDowntimeCostSummary(activity);
    return {
      ...activity,
      source,
      categoryLabel: category?.label ?? game.i18n.localize("N5EB.DOWNTIME.Category.Custom"),
      statusLabel: status.label,
      progress: {
        value, max, pct,
        complete: max ? value >= max : false
      },
      costLabel: payment.costLabel,
      costNote: activity.cost?.note ?? "",
      payment,
      crafting: getDowntimeCraftingProfile(activity),
      rollLabel: getDowntimeRollLabel(activity.roll),
      targetLabel: activity.target?.name || activity.target?.uuid || activity.target?.type || "",
      sort: activity.sort ?? 0
    };
  }

  /* -------------------------------------------- */

  /**
   * Prompt for downtime activity details.
   * @param {object} activity  Existing activity source.
   * @returns {Promise<object|null>}
   */
  async #promptDowntimeActivity(activity) {
    return foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("N5EB.DOWNTIME.Edit"), icon: "fa-solid fa-hourglass-half" },
      classes: ["dnd5e2", "downtime-dialog"],
      content: renderDowntimeActivityPrompt(activity),
      position: { width: 520 },
      rejectClose: false,
      ok: {
        label: game.i18n.localize("DND5E.Confirm"),
        callback: (_event, button) => getDowntimeActivityFormData(button.form, activity)
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Prompt for a downtime payment ledger entry.
   * @param {object} activity  Downtime activity source.
   * @param {object} summary   Prepared cost summary.
   * @returns {Promise<object|null>}
   */
  async #promptDowntimePayment(activity, summary) {
    return foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.format("N5EB.DOWNTIME.Payment.Title", { name: activity.name }), icon: "fa-solid fa-coins" },
      classes: ["dnd5e2", "downtime-payment-dialog"],
      content: renderDowntimePaymentPrompt(activity, summary, this.actor),
      position: { width: 460 },
      rejectClose: false,
      ok: {
        label: game.i18n.localize("N5EB.DOWNTIME.Payment.Record"),
        callback: (_event, button) => getDowntimePaymentFormData(button.form, summary)
      }
    });
  }

  /* -------------------------------------------- */
  /*  Filtering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _filterItem(item, filters) {
    const allowed = super._filterItem(item, filters);
    if ( allowed !== undefined ) return allowed;
    if ( item.type === "container" ) return true;
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  canExpand(item) {
    return !["background", "race", "facility"].includes(item.type) && super.canExpand(item);
  }

  /* -------------------------------------------- */

  /**
   * Determine if the sheet should show a bastion tab.
   * @param {Actor5e} actor
   * @returns {boolean}
   */
  static hasBastion(actor) {
    const { basic, special } = CONFIG.DND5E.facilities.advancement;
    const threshold = Math.min(...Object.keys(basic), ...Object.keys(special));
    return game.settings.get("n5eb", "bastionConfiguration")?.enabled && (actor.system.details.level >= threshold);
  }
}

/* -------------------------------------------- */

/**
 * Normalize an actor-local downtime activity.
 * @param {object} activity  Downtime activity source.
 * @returns {object}
 */
function normalizeDowntimeActivity(activity) {
  const normalized = foundry.utils.mergeObject({
    _id: foundry.utils.randomID(),
    identifier: "",
    templateUuid: "",
    sourceId: "",
    custom: false,
    sort: CONST.SORT_INTEGER_DENSITY,
    name: game.i18n.localize("N5EB.DOWNTIME.NewActivity"),
    img: "icons/svg/clockwork.svg",
    category: "custom",
    status: "active",
    progress: { value: 0, max: 1 },
    cost: getDefaultDowntimeCost(),
    roll: { enabled: false, ability: "", skill: "", tool: "", dc: 0, label: "" },
    target: { type: "", uuid: "", name: "", img: "" },
    result: { claimed: false, itemUuid: "", itemId: "", claimedAt: "" },
    description: "",
    completion: "",
    notes: "",
    completedAt: ""
  }, activity, { inplace: false });
  normalized.result = foundry.utils.mergeObject({
    claimed: false,
    itemUuid: "",
    itemId: "",
    claimedAt: ""
  }, normalized.result ?? {}, { inplace: false });
  normalizeDowntimeCost(normalized);
  return normalized;
}

/* -------------------------------------------- */

/**
 * Apply a dropped item as the target of a downtime activity.
 * @param {object} activity  Downtime activity source.
 * @param {Item5e} item      Dropped item.
 * @param {Actor5e} actor    Actor owning the activity.
 */
function applyDowntimeCraftingTarget(activity, item, actor) {
  const previousTarget = activity.target?.uuid ?? "";
  activity.target = {
    type: item.type,
    uuid: item.uuid,
    name: item.name,
    img: item.img
  };
  if ( previousTarget && (previousTarget !== item.uuid) ) {
    activity.result = { claimed: false, itemUuid: "", itemId: "", claimedAt: "" };
    activity.progress ??= {};
    activity.progress.value = 0;
  }
  activity.result ??= { claimed: false, itemUuid: "", itemId: "", claimedAt: "" };
  if ( !isCraftingActivity(activity) ) return;

  const price = getItemRyoValue(item);
  const seal = getItemSealData(item);
  activity.category = "crafting";
  activity.roll ??= { enabled: false, ability: "", skill: "", tool: "", dc: 0, label: "" };
  activity.cost ??= getDefaultDowntimeCost();
  activity.progress ??= { value: 0, max: 1 };

  if ( seal ) {
    const rankConfig = CONFIG.DND5E.sealRanks[seal.rank] ?? {};
    const downtime = Math.max(1, Number(seal.downtime || rankConfig.downtime || 1));
    const dc = Number(seal.craftingDC || rankConfig.craftingDC || 0);
    activity.identifier ||= "crafting-chakra-enhanced-items";
    activity.progress.max = downtime;
    activity.progress.value = Math.min(Number(activity.progress.value ?? 0), downtime);
    activity.cost.mode = "fixed";
    activity.cost.due = "completion";
    activity.cost.fixed = price;
    activity.cost.value = price;
    activity.cost.per = "activity";
    activity.cost.rank = seal.rank ?? "";
    activity.cost.note = game.i18n.format("N5EB.DOWNTIME.Crafting.SealTargetNote", {
      item: item.name,
      cost: formatRyo(price),
      weeks: downtime,
      dc: dc || "-"
    });
    activity.roll.enabled = true;
    activity.roll.ability = activity.roll.ability || "int";
    activity.roll.skill = activity.roll.skill || "cra";
    activity.roll.dc = dc;
    activity.roll.label = game.i18n.localize("N5EB.DOWNTIME.Crafting.SealRoll");
    activity.completion ||= game.i18n.localize("N5EB.DOWNTIME.Crafting.SealCompletion");
    return;
  }

  const contribution = getDowntimeCraftingContribution(activity, actor);
  const weeks = Math.max(1, Math.ceil(price / contribution));
  const materialCost = Math.ceil(price / 2);
  activity.identifier ||= "crafting-non-enhanced-items";
  activity.progress.max = weeks;
  activity.progress.value = Math.min(Number(activity.progress.value ?? 0), weeks);
  activity.cost.mode = "fixed";
  activity.cost.due = "completion";
  activity.cost.fixed = materialCost;
  activity.cost.value = materialCost;
  activity.cost.per = "activity";
  activity.cost.note = game.i18n.format("N5EB.DOWNTIME.Crafting.TargetNote", {
    item: item.name,
    value: formatRyo(price),
    cost: formatRyo(materialCost),
    weeks,
    contribution: formatRyo(contribution)
  });
  activity.roll.enabled = true;
  activity.roll.ability = activity.roll.ability || "int";
  activity.roll.skill = activity.roll.skill || "cra";
  activity.roll.label ||= game.i18n.localize("N5EB.DOWNTIME.Crafting.Roll");
  activity.completion ||= game.i18n.localize("N5EB.DOWNTIME.Crafting.Completion");
}

/* -------------------------------------------- */

/**
 * Prepare crafting display metadata for a downtime activity.
 * @param {object} activity  Downtime activity source.
 * @returns {object}
 */
function getDowntimeCraftingProfile(activity) {
  const crafting = isCraftingActivity(activity);
  const claimed = Boolean(activity.result?.claimed);
  return {
    active: crafting,
    hasTarget: Boolean(activity.target?.uuid),
    canClaim: crafting && Boolean(activity.target?.uuid) && (activity.status === "completed") && !claimed,
    claimed,
    claimedAt: activity.result?.claimedAt ?? "",
    itemUuid: activity.result?.itemUuid ?? ""
  };
}

/* -------------------------------------------- */

/**
 * Is this activity one of the crafting downtime templates or custom crafting entries?
 * @param {object} activity  Downtime activity source.
 * @returns {boolean}
 */
function isCraftingActivity(activity) {
  const identifier = activity.identifier || activity.sourceId || activity.templateUuid || "";
  return (activity.category === "crafting") || `${identifier}`.includes("crafting");
}

/* -------------------------------------------- */

/**
 * Get an item's Ryo price.
 * @param {Item5e} item  Item being checked.
 * @returns {number}
 */
function getItemRyoValue(item) {
  const price = item.system?.price ?? {};
  return Math.max(0, Number(price.value ?? 0));
}

/* -------------------------------------------- */

/**
 * Get item seal metadata if the item is an Enhancement Seal.
 * @param {Item5e} item  Item being checked.
 * @returns {object|null}
 */
function getItemSealData(item) {
  const seal = item.system?.seal;
  if ( !seal?.target || !seal?.rank ) return null;
  return seal;
}

/* -------------------------------------------- */

/**
 * Determine the Ryo value a crafter contributes each downtime week.
 * @param {object} activity  Downtime activity source.
 * @param {Actor5e} actor    Actor doing the crafting.
 * @returns {number}
 */
function getDowntimeCraftingContribution(activity, actor) {
  const tool = activity.roll?.tool;
  const mastery = tool ? Number(actor.system.tools?.[tool]?.mastery ?? 0) : 0;
  return mastery >= 1 ? 150 : 100;
}

/* -------------------------------------------- */

/**
 * Get the default actor-local downtime cost object.
 * @returns {object}
 */
function getDefaultDowntimeCost() {
  return {
    value: 0,
    denomination: "ryo",
    per: "activity",
    paid: false,
    mode: "none",
    due: "manual",
    fixed: 0,
    perWeek: 0,
    manualTotal: 0,
    dueAmount: 0,
    rank: "",
    rankTable: { e: 0, d: 0, c: 0, b: 0, a: 0, s: 0 },
    override: false,
    reason: "",
    note: "",
    ledger: []
  };
}

/* -------------------------------------------- */

/**
 * Convert downtime template cost data into an actor-local cost object.
 * @param {object} [cost={}]  Template cost data.
 * @returns {object}
 */
function getDowntimeCostFromTemplate(cost={}) {
  const value = Math.max(0, Number(cost.value ?? 0));
  const mode = cost.mode || (cost.per === "week" ? "per-week" : (value ? "fixed" : "none"));
  const data = foundry.utils.mergeObject(getDefaultDowntimeCost(), {
    value,
    denomination: cost.denomination ?? "ryo",
    per: cost.per ?? (mode === "per-week" ? "week" : "activity"),
    paid: false,
    mode,
    due: cost.due || (mode === "per-week" ? "weekly" : (mode === "none" ? "manual" : "completion")),
    fixed: Number(cost.fixed ?? (cost.per === "activity" ? value : 0)) || 0,
    perWeek: Number(cost.perWeek ?? (cost.per === "week" ? value : 0)) || 0,
    manualTotal: Number(cost.manualTotal ?? 0) || 0,
    dueAmount: Number(cost.dueAmount ?? 0) || 0,
    rank: cost.rank ?? "",
    rankTable: cost.rankTable ?? {},
    override: cost.override ?? false,
    reason: cost.reason ?? "",
    note: cost.note ?? "",
    ledger: []
  }, { inplace: false });
  const activity = { cost: data, progress: { value: 0, max: 1 } };
  normalizeDowntimeCost(activity);
  return activity.cost;
}

/* -------------------------------------------- */

/**
 * Normalize downtime cost fields in-place.
 * @param {object} activity  Activity source data.
 */
function normalizeDowntimeCost(activity) {
  activity.cost = foundry.utils.mergeObject(getDefaultDowntimeCost(), activity.cost ?? {}, { inplace: false });
  const { cost } = activity;
  const legacyMode = cost.per === "week" ? "per-week" : (cost.value ? "fixed" : "none");
  cost.mode ||= legacyMode;
  cost.due ||= cost.mode === "per-week" ? "weekly" : (cost.mode === "none" ? "manual" : "completion");
  cost.fixed = Math.max(0, Number(cost.fixed || (cost.per === "activity" ? cost.value : 0)) || 0);
  cost.perWeek = Math.max(0, Number(cost.perWeek || (cost.per === "week" ? cost.value : 0)) || 0);
  cost.manualTotal = Math.max(0, Number(cost.manualTotal ?? 0) || 0);
  cost.dueAmount = Math.max(0, Number(cost.dueAmount ?? 0) || 0);
  cost.rankTable ??= {};
  for ( const rank of ["e", "d", "c", "b", "a", "s"] ) {
    cost.rankTable[rank] = Math.max(0, Number(cost.rankTable[rank] ?? 0) || 0);
  }
  cost.ledger = Array.isArray(cost.ledger) ? cost.ledger.map(normalizeDowntimeLedgerEntry) : [];

  if ( cost.paid && !cost.ledger.length ) {
    const amount = getDowntimeLegacyDue(activity);
    if ( amount > 0 ) cost.ledger.push(normalizeDowntimeLedgerEntry({
      type: "payment",
      amount,
      note: game.i18n.localize("N5EB.DOWNTIME.Payment.LegacyPaid"),
      userName: game.i18n.localize("N5EB.Migration"),
      deducted: false
    }));
  }
}

/* -------------------------------------------- */

/**
 * Normalize a downtime payment ledger entry.
 * @param {object} [entry={}]  Ledger entry source.
 * @returns {object}
 */
function normalizeDowntimeLedgerEntry(entry={}) {
  return foundry.utils.mergeObject({
    _id: foundry.utils.randomID(),
    type: "payment",
    amount: 0,
    note: "",
    user: "",
    userName: "",
    timestamp: "",
    deducted: false
  }, {
    ...entry,
    amount: Math.max(0, Number(entry.amount ?? 0) || 0)
  }, { inplace: false });
}

/* -------------------------------------------- */

/**
 * Prepare a downtime cost summary for rendering and payment dialogs.
 * @param {object} activity  Downtime activity source.
 * @returns {object}
 */
function getDowntimeCostSummary(activity) {
  const normalized = normalizeDowntimeActivity(activity);
  const { cost } = normalized;
  const projected = getDowntimeProjectedCost(normalized);
  const due = getDowntimeDueCost(normalized, projected);
  const perWeek = getDowntimePerWeekCost(normalized);
  const totals = cost.ledger.reduce((totals, entry) => {
    if ( entry.type === "refund" ) totals.refunded += entry.amount;
    else if ( entry.type === "waiver" ) totals.waived += entry.amount;
    else if ( entry.type === "adjustment" ) totals.adjusted += entry.amount;
    else totals.paid += entry.amount;
    return totals;
  }, { paid: 0, waived: 0, refunded: 0, adjusted: 0 });
  const credited = Math.max(0, totals.paid + totals.waived + totals.adjusted - totals.refunded);
  const remaining = Math.max(0, due - credited);
  const status = getDowntimePaymentStatus({ projected, due, remaining, credited, waived: totals.waived });
  return {
    mode: cost.mode,
    dueTiming: cost.due,
    projected,
    due,
    perWeek,
    paid: totals.paid,
    waived: totals.waived,
    refunded: totals.refunded,
    adjusted: totals.adjusted,
    credited,
    remaining,
    status,
    statusLabel: game.i18n.localize(`N5EB.DOWNTIME.Payment.Status.${status}`),
    statusClass: status,
    costLabel: getDowntimeCostLabel(normalized, projected, perWeek),
    amountLabel: game.i18n.format("N5EB.DOWNTIME.Payment.Amount", {
      paid: formatRyo(credited), due: formatRyo(due)
    }),
    projectedLabel: game.i18n.format("N5EB.DOWNTIME.Payment.Projected", { amount: formatRyo(projected) }),
    dueLabel: game.i18n.format("N5EB.DOWNTIME.Payment.Due", { amount: formatRyo(due) }),
    remainingLabel: game.i18n.format("N5EB.DOWNTIME.Payment.Remaining", { amount: formatRyo(remaining) }),
    ledger: cost.ledger.map(prepareDowntimeLedgerEntry).reverse(),
    hasLedger: cost.ledger.length > 0,
    quick: {
      due: remaining,
      full: Math.max(0, projected - credited),
      week: perWeek,
      custom: 0
    }
  };
}

/* -------------------------------------------- */

/**
 * Determine the projected total cost for a downtime activity.
 * @param {object} activity  Downtime activity source.
 * @returns {number}
 */
function getDowntimeProjectedCost(activity) {
  const { cost, progress } = activity;
  switch ( cost.mode ) {
    case "none": return 0;
    case "per-week": return getDowntimePerWeekCost(activity) * Math.max(0, Number(progress?.max ?? 0));
    case "rank-table": return Math.max(0, Number(cost.rankTable?.[cost.rank] ?? 0));
    case "manual": return Math.max(0, Number(cost.manualTotal ?? cost.value ?? 0));
    case "fixed":
    default: return Math.max(0, Number(cost.fixed || cost.value || 0));
  }
}

/* -------------------------------------------- */

/**
 * Determine the cost currently due for a downtime activity.
 * @param {object} activity   Downtime activity source.
 * @param {number} projected  Projected total cost.
 * @returns {number}
 */
function getDowntimeDueCost(activity, projected) {
  const { cost, progress, status } = activity;
  switch ( cost.due ) {
    case "start": return projected;
    case "weekly": return Math.min(projected, getDowntimePerWeekCost(activity) * Math.max(0, Number(progress?.value ?? 0)));
    case "completion": return (status === "completed") || (Number(progress?.value ?? 0) >= Number(progress?.max ?? 1))
      ? projected : 0;
    case "manual": return Math.max(0, Number(cost.dueAmount ?? 0));
    default: return projected;
  }
}

/* -------------------------------------------- */

/**
 * Determine the current per-week cost for an activity.
 * @param {object} activity  Downtime activity source.
 * @returns {number}
 */
function getDowntimePerWeekCost(activity) {
  const { cost } = activity;
  if ( cost.mode === "per-week" ) return Math.max(0, Number(cost.perWeek || cost.value || 0));
  return Math.max(0, Number(cost.perWeek ?? 0));
}

/* -------------------------------------------- */

/**
 * Determine the payment status label key.
 * @param {object} data  Cost summary values.
 * @returns {string}
 */
function getDowntimePaymentStatus(data) {
  if ( !data.projected && !data.due ) return "NoCost";
  if ( data.waived && !data.remaining ) return "Waived";
  if ( !data.remaining && data.due ) return "Paid";
  if ( data.credited ) return "Partial";
  return "Unpaid";
}

/* -------------------------------------------- */

/**
 * Build a short cost label.
 * @param {object} activity   Downtime activity source.
 * @param {number} projected  Projected total cost.
 * @param {number} perWeek    Per-week cost.
 * @returns {string}
 */
function getDowntimeCostLabel(activity, projected, perWeek) {
  const { cost } = activity;
  if ( (cost.mode === "none") || (!projected && !perWeek) ) return game.i18n.localize("N5EB.DOWNTIME.Cost.None");
  if ( cost.mode === "per-week" ) return game.i18n.format("N5EB.DOWNTIME.Cost.PerWeek", {
    cost: formatRyo(perWeek)
  });
  if ( cost.mode === "rank-table" ) return game.i18n.format("N5EB.DOWNTIME.Cost.RankedCost", {
    rank: cost.rank ? game.i18n.localize(CONFIG.DND5E.downtimeRanks[cost.rank]?.label ?? cost.rank) : "-",
    cost: formatRyo(projected)
  });
  if ( cost.mode === "manual" ) return game.i18n.format("N5EB.DOWNTIME.Cost.ManualCost", {
    cost: formatRyo(projected)
  });
  return game.i18n.format("N5EB.DOWNTIME.Cost.Fixed", { cost: formatRyo(projected) });
}

/* -------------------------------------------- */

/**
 * Prepare a payment ledger entry for display.
 * @param {object} entry  Ledger entry.
 * @returns {object}
 */
function prepareDowntimeLedgerEntry(entry) {
  const type = CONFIG.DND5E.downtimePaymentTypes[entry.type]?.label ?? entry.type;
  return {
    ...entry,
    typeLabel: game.i18n.localize(type),
    amountLabel: formatRyo(entry.amount),
    userLabel: entry.userName || game.users.get(entry.user)?.name || "",
    timestampLabel: entry.timestamp ? new Date(entry.timestamp).toLocaleString(game.i18n.lang) : "",
    deductedLabel: entry.deducted ? game.i18n.localize("N5EB.DOWNTIME.Payment.CurrencyChanged") : ""
  };
}

/* -------------------------------------------- */

/**
 * Calculate the old paid flag settlement amount.
 * @param {object} activity  Downtime activity source.
 * @returns {number}
 */
function getDowntimeLegacyDue(activity) {
  const cost = activity.cost ?? {};
  const value = Math.max(0, Number(cost.value ?? 0));
  if ( !value ) return 0;
  if ( cost.per === "week" ) return value * Math.max(0, Number(activity.progress?.value ?? 0));
  return value;
}

/* -------------------------------------------- */

/**
 * Format a Ryo value.
 * @param {number} value  Ryo amount.
 * @returns {string}
 */
function formatRyo(value) {
  return `${new Intl.NumberFormat(game.i18n.lang).format(Math.max(0, Number(value ?? 0)))} ${
    game.i18n.localize("DND5E.CurrencyAbbrRyo")
  }`;
}

/* -------------------------------------------- */

/**
 * Get a human-readable roll label for a downtime activity.
 * @param {object} roll  Roll configuration.
 * @returns {string}
 */
function getDowntimeRollLabel(roll={}) {
  if ( !roll.enabled ) return "";
  const parts = [];
  if ( roll.label ) parts.push(roll.label);
  if ( roll.tool ) parts.push(CONFIG.DND5E.tools[roll.tool]?.label ?? roll.tool);
  else if ( roll.skill ) parts.push(CONFIG.DND5E.skills[roll.skill]?.label ?? roll.skill);
  else if ( roll.ability ) parts.push(CONFIG.DND5E.abilities[roll.ability]?.label ?? roll.ability);
  if ( roll.dc ) parts.push(game.i18n.format("N5EB.DOWNTIME.Roll.DC", { dc: roll.dc }));
  return parts.map(p => game.i18n.localize(p)).filterJoin(" - ");
}

/* -------------------------------------------- */

/**
 * Render the downtime activity edit prompt.
 * @param {object} activity  Downtime activity.
 * @returns {string}
 */
function renderDowntimeActivityPrompt(activity) {
  const a = normalizeDowntimeActivity(activity);
  return `
    <div class="form-group">
      <label>${game.i18n.localize("DND5E.Name")}</label>
      <input type="text" name="name" value="${escapeHTML(a.name)}">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Category.Label")}</label>
      <select name="category">${renderDowntimeOptions(CONFIG.DND5E.downtimeCategories, a.category, "label")}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Status.Label")}</label>
      <select name="status">${renderDowntimeOptions(CONFIG.DND5E.downtimeStatuses, a.status, "label")}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Progress")}</label>
      <div class="form-fields">
        <input type="number" name="progress.value" min="0" step="1" value="${a.progress.value}">
        <span>/</span>
        <input type="number" name="progress.max" min="0" step="1" value="${a.progress.max}">
      </div>
    </div>
    <fieldset>
      <legend>${game.i18n.localize("N5EB.DOWNTIME.Cost.Label")}</legend>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.Mode.Label")}</label>
        <select name="cost.mode">${renderDowntimeOptions(CONFIG.DND5E.downtimePricingModes, a.cost.mode, "label")}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.Due.Label")}</label>
        <select name="cost.due">${renderDowntimeOptions(CONFIG.DND5E.downtimeDueTimings, a.cost.due, "label")}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.FixedValue")}</label>
        <input type="number" name="cost.fixed" min="0" step="1" value="${a.cost.fixed}">
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.PerWeekValue")}</label>
        <input type="number" name="cost.perWeek" min="0" step="1" value="${a.cost.perWeek}">
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.ManualTotal")}</label>
        <input type="number" name="cost.manualTotal" min="0" step="1" value="${a.cost.manualTotal}">
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.DueAmount")}</label>
        <input type="number" name="cost.dueAmount" min="0" step="1" value="${a.cost.dueAmount}">
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Rank.Label")}</label>
        <select name="cost.rank"><option value=""></option>${renderDowntimeOptions(CONFIG.DND5E.downtimeRanks, a.cost.rank, "label")}</select>
      </div>
      <div class="form-group stacked">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.RankTable")}</label>
        <div class="rank-table">
          ${renderDowntimeRankInputs(a.cost.rankTable)}
        </div>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.Override")}</label>
        <input type="checkbox" name="cost.override" ${a.cost.override ? "checked" : ""}>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.OverrideReason")}</label>
        <input type="text" name="cost.reason" value="${escapeHTML(a.cost.reason)}">
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("N5EB.DOWNTIME.Cost.Note")}</label>
        <input type="text" name="cost.note" value="${escapeHTML(a.cost.note)}">
      </div>
    </fieldset>
    <hr>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Roll.Enabled")}</label>
      <input type="checkbox" name="roll.enabled" ${a.roll.enabled ? "checked" : ""}>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Roll.Label")}</label>
      <input type="text" name="roll.label" value="${escapeHTML(a.roll.label)}">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("DND5E.Ability")}</label>
      <select name="roll.ability"><option value=""></option>${renderDowntimeOptions(CONFIG.DND5E.abilities, a.roll.ability, "label")}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("DND5E.Skill")}</label>
      <select name="roll.skill"><option value=""></option>${renderDowntimeOptions(CONFIG.DND5E.skills, a.roll.skill, "label")}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("DND5E.Tool")}</label>
      <select name="roll.tool"><option value=""></option>${renderDowntimeOptions(CONFIG.DND5E.tools, a.roll.tool, "label")}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("DND5E.AbbreviationDC")}</label>
      <input type="number" name="roll.dc" min="0" step="1" value="${a.roll.dc}">
    </div>
    <hr>
    <div class="form-group stacked">
      <label>${game.i18n.localize("DND5E.Description")}</label>
      <textarea name="description" rows="4">${escapeHTML(a.description ?? "")}</textarea>
    </div>
    <div class="form-group stacked">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Completion")}</label>
      <textarea name="completion" rows="3">${escapeHTML(a.completion ?? "")}</textarea>
    </div>
    <div class="form-group stacked">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Notes")}</label>
      <textarea name="notes" rows="3">${escapeHTML(a.notes ?? "")}</textarea>
    </div>
  `;
}

/* -------------------------------------------- */

/**
 * Render rank-table cost inputs.
 * @param {object} rankTable  Rank cost table.
 * @returns {string}
 */
function renderDowntimeRankInputs(rankTable={}) {
  return Object.entries(CONFIG.DND5E.downtimeRanks).map(([rank, config]) => `
    <label>
      <span>${escapeHTML(game.i18n.localize(config.label))}</span>
      <input type="number" name="cost.rankTable.${rank}" min="0" step="1" value="${Number(rankTable[rank] ?? 0)}">
    </label>
  `).join("");
}

/* -------------------------------------------- */

/**
 * Render the payment ledger prompt.
 * @param {object} activity  Downtime activity source.
 * @param {object} summary   Cost summary.
 * @param {Actor5e} actor    Actor being edited.
 * @returns {string}
 */
function renderDowntimePaymentPrompt(activity, summary, actor) {
  const types = game.user.isGM
    ? CONFIG.DND5E.downtimePaymentTypes
    : { payment: CONFIG.DND5E.downtimePaymentTypes.payment };
  const ryo = Number(actor.system.currency?.ryo ?? 0);
  const defaultQuick = summary.quick.due ? "due" : (summary.quick.full ? "full" : "custom");
  const quickOption = (value, label) => `<option value="${value}"${value === defaultQuick ? " selected" : ""}>${label}</option>`;
  return `
    <div class="downtime-payment-summary">
      <strong>${escapeHTML(activity.name)}</strong>
      <span>${escapeHTML(summary.statusLabel)} - ${escapeHTML(summary.amountLabel)}</span>
      <span>${escapeHTML(summary.projectedLabel)}</span>
      <span>${game.i18n.format("N5EB.DOWNTIME.Payment.ActorRyo", { amount: formatRyo(ryo) })}</span>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Payment.Type.Label")}</label>
      <select name="type">${renderDowntimeOptions(types, "payment", "label")}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Payment.Quick.Label")}</label>
      <select name="quick">
        ${quickOption("due", game.i18n.format("N5EB.DOWNTIME.Payment.Quick.Due", { amount: formatRyo(summary.quick.due) }))}
        ${quickOption("full", game.i18n.format("N5EB.DOWNTIME.Payment.Quick.Full", { amount: formatRyo(summary.quick.full) }))}
        ${quickOption("week", game.i18n.format("N5EB.DOWNTIME.Payment.Quick.Week", { amount: formatRyo(summary.quick.week) }))}
        ${quickOption("custom", game.i18n.localize("N5EB.DOWNTIME.Payment.Quick.Custom"))}
      </select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Payment.AmountLabel")}</label>
      <input type="number" name="amount" min="0" step="1" value="${summary.quick[defaultQuick] ?? 0}">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Payment.ChangeCurrency")}</label>
      <input type="checkbox" name="deduct" checked>
    </div>
    <div class="form-group stacked">
      <label>${game.i18n.localize("N5EB.DOWNTIME.Payment.Note")}</label>
      <textarea name="note" rows="2"></textarea>
    </div>
  `;
}

/* -------------------------------------------- */

/**
 * Convert the downtime prompt form into activity data.
 * @param {HTMLFormElement} form  Prompt form.
 * @param {object} activity       Existing activity.
 * @returns {object}
 */
function getDowntimeActivityFormData(form, activity) {
  const formData = new FormData(form);
  const data = normalizeDowntimeActivity(activity);
  data.name = formData.get("name") || data.name;
  data.category = formData.get("category") || "custom";
  data.status = formData.get("status") || "active";
  data.progress.value = Math.max(0, Number(formData.get("progress.value") ?? data.progress.value) || 0);
  data.progress.max = Math.max(0, Number(formData.get("progress.max") ?? data.progress.max) || 0);
  data.cost.denomination = "ryo";
  data.cost.mode = formData.get("cost.mode") || "none";
  data.cost.due = formData.get("cost.due") || "manual";
  data.cost.fixed = Math.max(0, Number(formData.get("cost.fixed") ?? data.cost.fixed) || 0);
  data.cost.perWeek = Math.max(0, Number(formData.get("cost.perWeek") ?? data.cost.perWeek) || 0);
  data.cost.manualTotal = Math.max(0, Number(formData.get("cost.manualTotal") ?? data.cost.manualTotal) || 0);
  data.cost.dueAmount = Math.max(0, Number(formData.get("cost.dueAmount") ?? data.cost.dueAmount) || 0);
  data.cost.rank = formData.get("cost.rank") ?? "";
  for ( const rank of ["e", "d", "c", "b", "a", "s"] ) {
    data.cost.rankTable[rank] = Math.max(0, Number(formData.get(`cost.rankTable.${rank}`) ?? data.cost.rankTable[rank]) || 0);
  }
  data.cost.override = formData.has("cost.override");
  data.cost.reason = formData.get("cost.reason") ?? "";
  data.cost.value = data.cost.mode === "per-week" ? data.cost.perWeek
    : (data.cost.mode === "fixed" ? data.cost.fixed : data.cost.manualTotal);
  data.cost.per = data.cost.mode === "per-week" ? "week" : "activity";
  data.cost.paid = getDowntimeCostSummary(data).remaining <= 0;
  data.cost.note = formData.get("cost.note") ?? "";
  data.roll.enabled = formData.has("roll.enabled");
  data.roll.label = formData.get("roll.label") ?? "";
  data.roll.ability = formData.get("roll.ability") ?? "";
  data.roll.skill = formData.get("roll.skill") ?? "";
  data.roll.tool = formData.get("roll.tool") ?? "";
  data.roll.dc = Math.max(0, Number(formData.get("roll.dc") ?? data.roll.dc) || 0);
  data.description = formData.get("description") ?? "";
  data.completion = formData.get("completion") ?? "";
  data.notes = formData.get("notes") ?? "";
  return data;
}

/* -------------------------------------------- */

/**
 * Convert the downtime payment prompt form into a ledger entry.
 * @param {HTMLFormElement} form  Prompt form.
 * @param {object} summary        Cost summary.
 * @returns {object|null}
 */
function getDowntimePaymentFormData(form, summary) {
  const formData = new FormData(form);
  const type = formData.get("type") || "payment";
  const quick = formData.get("quick") || "due";
  const quickAmount = summary.quick[quick] ?? 0;
  const amount = Math.max(0, Number(quick === "custom" ? formData.get("amount") : quickAmount) || 0);
  if ( amount <= 0 ) {
    ui.notifications.warn("N5EB.DOWNTIME.Payment.NoAmount", { localize: true });
    return null;
  }
  return normalizeDowntimeLedgerEntry({
    type,
    amount,
    note: formData.get("note") ?? "",
    user: game.user.id,
    userName: game.user.name,
    timestamp: new Date().toISOString(),
    deducted: formData.has("deduct") && ["payment", "refund"].includes(type)
  });
}

/* -------------------------------------------- */

/**
 * Render option tags for a downtime prompt select.
 * @param {object} choices     Choice configuration.
 * @param {string} selected    Selected value.
 * @param {string} labelAttr   Choice label attribute.
 * @returns {string}
 */
function renderDowntimeOptions(choices, selected, labelAttr) {
  return Object.entries(choices ?? {}).map(([value, config]) => {
    const label = localizeDowntimeOption(getDowntimeOptionLabel(config, labelAttr, value));
    const isSelected = value === selected ? " selected" : "";
    return `<option value="${escapeHTML(value)}"${isSelected}>${escapeHTML(label)}</option>`;
  }).join("");
}

/* -------------------------------------------- */

/**
 * Resolve a display label from a downtime prompt option config.
 * @param {object|string} config  Option configuration.
 * @param {string} labelAttr      Preferred label attribute.
 * @param {string} fallback       Fallback display value.
 * @returns {string}
 */
function getDowntimeOptionLabel(config, labelAttr, fallback) {
  if ( typeof config === "string" ) return config;
  if ( typeof config?.[labelAttr] === "string" ) return config[labelAttr];
  if ( typeof config?.label === "string" ) return config.label;
  if ( typeof config?.name === "string" ) return config.name;
  return fallback;
}

/* -------------------------------------------- */

/**
 * Localize a downtime prompt label only when it is a translation key.
 * @param {string} label  Label or localization key.
 * @returns {string}
 */
function localizeDowntimeOption(label) {
  return game.i18n.has(label) ? game.i18n.localize(label) : label;
}

/* -------------------------------------------- */

/**
 * Escape HTML for dialog content.
 * @param {string} value  Raw value.
 * @returns {string}
 */
function escapeHTML(value) {
  return Handlebars.escapeExpression(value ?? "");
}
