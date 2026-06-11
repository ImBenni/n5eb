import { getClassmodArtsSpellcastingCards } from "../../classmod-arts.mjs";
import { formatNumber, getPluralRules, splitSemicolons } from "../../utils.mjs";
import { createCheckboxInput } from "../fields.mjs";
import BaseActorSheet from "./api/base-actor-sheet.mjs";
import AdversaryBuilderConfig from "./config/adversary-builder-config.mjs";
import HabitatConfig from "./config/habitat-config.mjs";
import SummonBuilderConfig from "./config/summon-builder-config.mjs";
import TreasureConfig from "./config/treasure-config.mjs";

const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Extension of base actor sheet for NPCs.
 */
export default class NPCActorSheet extends BaseActorSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    actions: {
      editDescription: NPCActorSheet.#editDescription,
      showAdversaryBuilder: NPCActorSheet.#showAdversaryBuilder,
      showSummonBuilder: NPCActorSheet.#showSummonBuilder
    },
    classes: ["npc", "vertical-tabs"],
    position: {
      width: 700,
      height: 700
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    header: {
      template: "systems/n5eb/templates/actors/npc-header.hbs"
    },
    sidebarCollapser: {
      container: { classes: ["main-content"], id: "main" },
      template: "systems/n5eb/templates/actors/parts/sidebar-collapser.hbs"
    },
    sidebar: {
      container: { classes: ["main-content"], id: "main" },
      template: "systems/n5eb/templates/actors/npc-sidebar.hbs"
    },
    features: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/actor-features.hbs",
      templates: ["systems/n5eb/templates/inventory/inventory.hbs", "systems/n5eb/templates/inventory/activity.hbs"],
      scrollable: [""]
    },
    inventory: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/actor-inventory.hbs",
      templates: [
        "systems/n5eb/templates/inventory/inventory.hbs", "systems/n5eb/templates/inventory/activity.hbs",
        "systems/n5eb/templates/inventory/encumbrance.hbs"
      ],
      scrollable: [""]
    },
    spells: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/creature-spells.hbs",
      scrollable: [""]
    },
    effects: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/actor-effects.hbs",
      scrollable: [""]
    },
    biography: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/npc-biography.hbs",
      scrollable: [""]
    },
    specialTraits: {
      classes: ["flexcol"],
      container: { classes: ["tab-body"], id: "tabs" },
      template: "systems/n5eb/templates/actors/tabs/creature-special-traits.hbs",
      scrollable: [""]
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

  /** @override */
  static TABS = [
    { tab: "features", label: "DND5E.Features", icon: "fas fa-list" },
    { tab: "inventory", label: "DND5E.Inventory", svg: "systems/n5eb/icons/svg/backpack.svg" },
    { tab: "spells", label: "TYPES.Item.spellPl", icon: "fas fa-book" },
    { tab: "effects", label: "DND5E.Effects", icon: "fas fa-bolt" },
    { tab: "biography", label: "DND5E.Biography", icon: "fas fa-feather" },
    { tab: "specialTraits", label: "DND5E.SpecialTraits", icon: "fas fa-star" }
  ];

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Description currently being edited.
   * @type {string|null}
   */
  editingDescriptionTarget = null;

  /* -------------------------------------------- */

  /** @override */
  tabGroups = {
    primary: "features"
  };

  /* -------------------------------------------- */

  /** @override */
  _filters = {
    features: { name: "", properties: new Set() },
    effects: { name: "", properties: new Set() },
    inventory: { name: "", properties: new Set() },
    spells: { name: "", properties: new Set() }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _configureInventorySections(sections) {
    sections.forEach(s => s.minWidth = 200);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = {
      ...await super._prepareContext(options),
      important: !foundry.utils.isEmpty(this.actor.classes) || this.actor.system.traits.important,
      isNPC: true
    };
    context.hasClasses = context.itemCategories.classes?.length;
    context.spellbook = this._prepareSpellbook(context);
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "biography": return this._prepareBiographyContext(context, options);
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
   * Prepare rendering context for the biography tab.
   * @param {ApplicationRenderContext} context  Context being prepared.
   * @param {HandlebarsRenderOptions} options   Options which configure application rendering behavior.
   * @returns {ApplicationRenderContext}
   * @protected
   */
  async _prepareBiographyContext(context, options) {
    if ( this.actor.limited ) return context;

    const enrichmentOptions = {
      secrets: this.actor.isOwner, relativeTo: this.actor, rollData: context.rollData
    };
    context.enriched = {
      public: await TextEditor.enrichHTML(this.actor.system.details.biography.public, enrichmentOptions),
      value: await TextEditor.enrichHTML(this.actor.system.details.biography.value, enrichmentOptions)
    };
    if ( this.editingDescriptionTarget ) context.editingDescription = {
      target: this.editingDescriptionTarget,
      value: foundry.utils.getProperty(this.actor._source, this.editingDescriptionTarget)
    };

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
    const sections = Object.entries(CONFIG.DND5E.activityActivationTypes).reduce((obj, [id, config], i) => {
      const { header: label, passive } = config;
      if ( passive ) return obj;
      obj[id] ??= {
        id, label, order: (i + 1) * 100, items: [], minWidth: 210,
        columns: ["recovery", "uses", "roll", "formula", "controls"]
      };
      return obj;
    }, {});
    sections.passive = {
      id: "passive", label: "DND5E.Features", order: 0, items: [], minWidth: 210,
      columns: ["recovery", "uses", "roll", "formula", "controls"]
    };
    sections.adversaryTraits = {
      id: "adversaryTraits", label: "N5EB.AdversaryTraits", order: -20, items: [], minWidth: 210,
      columns: ["recovery", "uses", "roll", "formula", "controls"]
    };
    sections.adversaryPassives = {
      id: "adversaryPassives", label: "N5EB.AdversaryPassives", order: -10, items: [], minWidth: 210,
      columns: ["recovery", "uses", "roll", "formula", "controls"]
    };
    context.itemCategories.features?.forEach(i => {
      const ctx = context.itemContext[i.id];
      sections[ctx.group]?.items.push(i);
    });
    context.sections = customElements.get(this.options.elements.inventory).prepareSections(Object.values(sections));
    context.listControls = {
      label: "DND5E.FeatureSearch",
      list: "features",
      filters: [
        { key: "action", label: "DND5E.ACTIVATION.Type.Action.Label" },
        { key: "bonus", label: "DND5E.ACTIVATION.Type.BonusAction.Label" },
        { key: "reaction", label: "DND5E.ACTIVATION.Type.Reaction.Label" },
        { key: "legendary", label: "DND5E.ACTIVATION.Type.Legendary.Label" },
        { key: "elite", label: "N5EB.Adversary.EliteAction.Label" },
        { key: "lair", label: "DND5E.ACTIVATION.Type.Lair.Label" }
      ],
      sorting: [
        { key: "m", label: "SIDEBAR.SortModeManual", dataset: { icon: "fa-solid fa-arrow-down-short-wide" } },
        { key: "a", label: "SIDEBAR.SortModeAlpha", dataset: { icon: "fa-solid fa-arrow-down-a-z" } }
      ]
    };
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
    context.portrait = await this._preparePortrait(context);

    if ( this.actor.limited ) {
      const enrichmentOptions = { relativeTo: this.actor, rollData: context.rollData };
      context.enriched = {
        public: await TextEditor.enrichHTML(this.actor.system.details.biography.public, enrichmentOptions)
      };
      return context;
    }

    context.abilities = this._prepareAbilities(context);
    context.classes = context.itemCategories.classes;

    // Legendary Actions & Resistances
    const plurals = getPluralRules({ type: "ordinal" });
    const resources = context.source.resources;
    for ( const res of ["legact", "legres"] ) {
      const { max, value } = resources[res];
      context[res] = Array.fromRange(max, 1).map(n => {
        const i18n = res === "legact" ? "LegendaryAction" : "LegendaryResistance";
        const filled = value >= n;
        const classes = ["pip"];
        if ( filled ) classes.push("filled");
        return {
          n: max - n, filled,
          tooltip: `DND5E.${i18n}.Label`,
          label: game.i18n.format(`DND5E.${i18n}.Ordinal.${plurals.select(n)}`, { n }),
          classes: classes.join(" ")
        };
      });
    }
    context.hasLegendaries = resources.legact.max || resources.legres.max
      || (context.modernRules && resources.lair.value) || (!context.modernRules && resources.lair.initiative);
    const adversary = context.system.details.adversary;
    const specialRoles = Array.from(adversary.specialRoles ?? []).map(key => ({
      key,
      label: CONFIG.DND5E.adversarySpecialRoles[key]?.label ?? key
    })).filter(role => role.key in CONFIG.DND5E.adversarySpecialRoles);
    context.adversary = {
      enabled: adversary.enabled,
      class: {
        key: adversary.class,
        label: CONFIG.DND5E.adversaryClasses[adversary.class]?.label ?? adversary.class
      },
      rank: {
        key: adversary.rank,
        label: CONFIG.DND5E.adversaryRanks[adversary.rank]?.label ?? adversary.rank.toUpperCase(),
        abbreviation: CONFIG.DND5E.adversaryRanks[adversary.rank]?.abbreviation ?? adversary.rank.toUpperCase()
      },
      role: {
        key: adversary.role,
        label: CONFIG.DND5E.adversaryRoles[adversary.role]?.label ?? adversary.role
      },
      discipline: adversary.discipline ? {
        key: adversary.discipline,
        label: CONFIG.DND5E.adversaryDisciplines[adversary.discipline]?.label ?? adversary.discipline
      } : null,
      level: adversary.level,
      specialRoles
    };
    context.hasAdversaryResources = resources.tenacity.max || resources.eliteact.max || adversary.enabled;

    const summon = context.system.details.summon;
    context.summon = {
      enabled: summon.enabled,
      category: {
        key: summon.category,
        label: CONFIG.DND5E.summonCategories[summon.category]?.label ?? summon.category
      },
      rank: {
        key: summon.rank,
        label: CONFIG.DND5E.summonRanks[summon.rank]?.label ?? summon.rank.toUpperCase(),
        abbreviation: CONFIG.DND5E.summonRanks[summon.rank]?.abbreviation ?? summon.rank.toUpperCase()
      },
      role: {
        key: summon.role,
        label: CONFIG.DND5E.summonRoles[summon.role]?.label ?? summon.role
      },
      tribe: summon.tribe ? {
        key: summon.tribe,
        label: CONFIG.DND5E.summonTribes[summon.tribe]?.label ?? summon.tribe
      } : null,
      summonType: summon.summonType ? {
        key: summon.summonType,
        label: CONFIG.DND5E.summonTypes[summon.summonType]?.label ?? summon.summonType
      } : null,
      variant: summon.variant,
      level: summon.level
    };

    // Visibility
    if ( this._mode === this.constructor.MODES.PLAY ) {
      context.showDeathSaves = context.important && !context.system.attributes.hp.value;
      context.showInitiativeScore = dnd5e.settings.rulesVersion === "modern";
    }
    context.showLoyalty = context.important && game.settings.get("n5eb", "loyaltyScore") && game.user.isGM;
    context.showRests = game.user.isGM || (this.actor.isOwner && game.settings.get("n5eb", "allowRests"));

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareInventoryContext(context, options) {
    context = await super._prepareInventoryContext(context, options);
    context.encumbrance = context.system.attributes.encumbrance;
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
    const { attributes, details } = context.system;

    // Gear
    const gear = await this.actor.items.filter(i => i.system.quantity && i.system.properties?.has("gear"));
    if ( gear.length ) context.gear = gear.map(item => {
      const { name, uuid } = item.system.gearPresentationData();
      return {
        draggable: true,
        label: name,
        link: {
          action: "showDocument",
          itemId: item.id,
          quantity: item.system.quantity,
          uuid
        },
        value: item.system.quantity > 1 ? item.system.quantity : undefined
      };
    }).sort((lhs, rhs) => lhs.label.localeCompare(rhs.label, game.i18n.lang));

    // Habitat
    if ( details.habitat.value.length || details.habitat.custom ) {
      const { habitat } = details;
      const any = details.habitat.value.find(({ type }) => type === "any");
      context.habitat = [
        ...habitat.value.map(({ type, subtype }) => {
          let { label } = CONFIG.DND5E.habitats[type] ?? {};
          if ( label && (!any || (type === "any")) ) {
            if ( subtype ) label = game.i18n.format("DND5E.Habitat.Subtype", { type: label, subtype });
            return { label };
          }
          return null;
        }, []).filter(_ => _),
        ...splitSemicolons(habitat.custom).map(label => ({ label }))
      ].sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    }

    // Senses
    context.senses = this._prepareSenses(context);
    if ( this.actor.system.skills.prc ) context.senses.push({
      key: "passivePerception",
      label: game.i18n.localize("DND5E.PassivePerception"),
      value: this.actor.system.skills.prc.passive
    });

    // Skills & Tools
    const skillSetting = game.settings.get("n5eb", "defaultSkills");
    context.skills = this._prepareSkillsTools(context, "skills")
      .filter(v => v.prof.multiplier || skillSetting.has(v.key) || v.bonuses.check || v.bonuses.passive);
    context.tools = this._prepareSkillsTools(context, "tools");

    // Speed
    context.speed = [
      ...Object.entries(CONFIG.DND5E.movementTypes).filter(([, m]) => !m.hidden).map(([k, { label }]) => {
        const value = attributes.movement[k];
        if ( !value ) return null;
        const data = { label, value };
        if ( (k === "fly") && attributes.movement.hover ) data.icons = [{
          icon: "fas fa-cloud", label: game.i18n.localize("DND5E.MOVEMENT.Hover")
        }];
        return data;
      }),
      ...splitSemicolons(attributes.movement.special).map(label => ({ label }))
    ].filter(_ => _);

    // Traits
    context.traits = this._prepareTraits(context);

    // Treasure
    if ( details?.treasure?.value.size ) {
      const any = details.treasure.value.has("any");
      context.treasure = Array.from(details.treasure.value)
        .map(id => {
          const { label } = CONFIG.DND5E.treasure[id] ?? {};
          if ( label && (!any || (id === "any")) ) return { label };
          return null;
        }, [])
        .filter(_ => _)
        .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    }

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareSpecialTraitsContext(context, options) {
    context = await super._prepareSpecialTraitsContext(context, options);

    const { fields } = this.document.system.schema;
    context.flags.sections.unshift({
      label: game.i18n.localize("DND5E.NPC.Label"),
      fields: [{
        field: fields.traits.fields.important,
        input: createCheckboxInput,
        name: "system.traits.important",
        value: context.source.traits.important
      }, {
        label: "DND5E.NPC.FIELDS.attributes.price.label",
        hint: "DND5E.NPC.FIELDS.attributes.price.hint",
        fields: [{
          field: fields.attributes.fields.price.fields.value,
          name: "system.attributes.price.value",
          value: context.source.attributes.price.value
        }, {
          choices: CONFIG.DND5E.currencies,
          field: fields.attributes.fields.price.fields.denomination,
          name: "system.attributes.price.denomination",
          value: context.source.attributes.price.denomination
        }]
      }]
    });

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareSpellsContext(context, options) {
    context = await super._prepareSpellsContext(context, options);

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

  /** @inheritDoc */
  async _renderFrame(options) {
    const html = await super._renderFrame(options);
    this._renderSourceFrame(html);
    html.querySelector(".header-elements")?.insertAdjacentHTML("beforeend", '<div class="cr-xp"></div>');
    return html;
  }

  /* -------------------------------------------- */
  /*  Item Preparation Helpers                    */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _assignItemCategories(item) {
    if ( ["class", "subclass"].includes(item.type) ) return new Set(["classes"]);
    const categories = super._assignItemCategories(item);
    if ( item.type === "weapon" ) categories.add("features");
    return categories;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareItem(item, ctx) {
    await super._prepareItem(item, ctx);
    if ( item.system.type?.value === "adversaryTrait" ) {
      ctx.group = "adversaryTraits";
      return;
    }
    if ( item.system.type?.value === "adversaryPassive" ) {
      ctx.group = "adversaryPassives";
      return;
    }
    const isPassive = item.system.properties?.has("trait")
      || CONFIG.DND5E.activityActivationTypes[item.system.activities?.contents[0]?.activation.type]?.passive;
    ctx.group = isPassive ? "passive" : item.system.activities?.contents[0]?.activation.type || "passive";
  }

  /* -------------------------------------------- */
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);

    if ( !this.actor.limited ) {
      this._renderCreateInventory();
      this._renderAttunement(context, options);
      this._renderSpellbook(context, options);
    }

    const elements = this.element.querySelector(".header-elements .cr-xp");
    if ( !elements || this.actor.limited ) return;
    const xp = this.actor.system.details.xp.value;
    elements.innerText = xp === null ? "" : game.i18n.format("DND5E.ExperiencePoints.Format", {
      value: formatNumber(xp)
    });

    if ( this.editingDescriptionTarget ) {
      this.element.querySelectorAll("prose-mirror").forEach(editor => editor.addEventListener("save", () => {
        this.editingDescriptionTarget = null;
        this.render();
      }));
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _addDocumentItemTypes(tab) {
    const types = super._addDocumentItemTypes(tab);
    if ( tab === "features" ) types.push("weapon");
    return types;
  }

  /* -------------------------------------------- */

  /**
   * Handle expanding the description editor.
   * @this {NPCActorSheet}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static #editDescription(event, target) {
    if ( target.ariaDisabled ) return;
    this.editingDescriptionTarget = target.dataset.target;
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Open the adversary builder.
   * @this {NPCActorSheet}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static #showAdversaryBuilder(event, target) {
    this._renderChild(new AdversaryBuilderConfig({ document: this.actor }));
  }

  /* -------------------------------------------- */

  /**
   * Open the summon builder.
   * @this {NPCActorSheet}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static #showSummonBuilder(event, target) {
    this._renderChild(new SummonBuilderConfig({ document: this.actor }));
  }

  /* -------------------------------------------- */

  /** @override */
  _showConfiguration(event, target) {
    let app;
    const config = { document: this.actor };
    switch ( target.dataset.config ) {
      case "habitat":
        app = new HabitatConfig(config);
        break;
      case "treasure":
        app = new TreasureConfig(config);
        break;
    }
    if ( app ) {
      this._renderChild(app);
      return false;
    }
  }

  /* -------------------------------------------- */
  /*  Form Handling                               */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);

    // Convert CR
    let cr = submitData.system?.details?.cr;
    if ( (cr === "") || (cr === "—") ) foundry.utils.setProperty(submitData, "system.details.cr", null);
    else {
      cr = { "1/8": 0.125, "⅛": 0.125, "1/4": 0.25, "¼": 0.25, "1/2": 0.5, "½": 0.5 }[cr] || parseFloat(cr);
      if ( Number.isNaN(cr) ) cr = null;
      else foundry.utils.setProperty(submitData, "system.details.cr", cr < 1 ? cr : parseInt(cr));
    }

    return submitData;
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onDragStart(event) {
    const target = event.currentTarget;
    if ( target.classList.contains("pill") ) {
      const dataset = target.querySelector("[data-item-id]")?.dataset ?? {};
      const item = await this.actor.items.get(dataset.itemId)?.system.asGear?.();
      if ( item ) {
        event.dataTransfer.setData("text/plain", JSON.stringify({
          data: item.isEmbedded ? item.toObject() : game.items.fromCompendium(item),
          type: "Item"
        }));
        return;
      }
    }
    return super._onDragStart(event);
  }
}
