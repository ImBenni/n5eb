import ChakraAdvancement from "../../documents/advancement/chakra.mjs";
import ScaleValueAdvancement from "../../documents/advancement/scale-value.mjs";
import TraitAdvancement from "../../documents/advancement/trait.mjs";
import { formatIdentifier, simplifyBonus } from "../../utils.mjs";
import ItemDataModel from "../abstract/item-data-model.mjs";
import FormulaField from "../fields/formula-field.mjs";
import SpellcastingField from "./fields/spellcasting-field.mjs";
import AdvancementTemplate from "./templates/advancement.mjs";
import ItemDescriptionTemplate from "./templates/item-description.mjs";
import StartingEquipmentTemplate from "./templates/starting-equipment.mjs";

const { BooleanField, NumberField, SchemaField, SetField, StringField } = foundry.data.fields;
const JUTSU_KNOWN_SCALE_ID = "jutsu-known";
const JUTSU_MAX_RANK_SCALE_ID = "jutsu-max-rank";
const JUTSU_MAX_RANK_SCALE_ALIASES = new Set([
  JUTSU_MAX_RANK_SCALE_ID,
  "highest-rank-jutsu-known",
  "max-rank",
  "highest-rank-known"
]);

/**
 * @import { ClassItemSystemData } from "./_types.mjs";
 * @import {
 *   AdvancementTemplateData, ItemDescriptionTemplateData, StartingEquipmentTemplateData
 * } from "./templates/_types.mjs";
 */

/**
 * Data definition for Class items.
 * @extends {ItemDataModel<
 *   AdvancementTemplate & ItemDescriptionTemplate & StartingEquipmentTemplate & ClassItemSystemData
 * >}
 * @mixes AdvancementTemplateData
 * @mixes ItemDescriptionTemplateData
 * @mixes StartingEquipmentTemplateData
 * @mixes ClassItemSystemData
 */
export default class ClassData extends ItemDataModel.mixin(
  AdvancementTemplate, ItemDescriptionTemplate, StartingEquipmentTemplate
) {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DND5E.CLASS", "DND5E.SOURCE"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      hd: new SchemaField({
        additional: new FormulaField({ deterministic: true, required: true }),
        denomination: new StringField({
          required: true, initial: "d6", blank: false,
          validate: v => /d\d+/.test(v), validationError: "must be a dice value in the format d#"
        }),
        spent: new NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 })
      }),
      cd: new SchemaField({
        additional: new FormulaField({ deterministic: true, required: true }),
        denomination: new StringField({
          required: true, initial: "d6", blank: false,
          validate: v => /d\d+/.test(v), validationError: "must be a dice value in the format d#"
        }),
        spent: new NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 })
      }),
      levels: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
      primaryAbility: new SchemaField({
        value: new SetField(new StringField()),
        all: new BooleanField({ initial: true })
      }),
      properties: new SetField(new StringField()),
      jutsu: new SchemaField({
        known: new FormulaField({ deterministic: true, label: "N5EB.JUTSU.Known" }),
        maxRank: new StringField({ required: true, blank: true, initial: "", label: "N5EB.JUTSU.MaxRank" }),
        abilities: new SchemaField({
          ninjutsu: new StringField({ required: true, blank: false, initial: "int", label: "N5EB.JUTSU.NinjutsuAbility" }),
          genjutsu: new StringField({ required: true, blank: false, initial: "wis", label: "N5EB.JUTSU.GenjutsuAbility" }),
          taijutsu: new StringField({ required: true, blank: false, initial: "str", label: "N5EB.JUTSU.TaijutsuAbility" })
        }, { label: "N5EB.JUTSU.CastingAbilities" })
      }, { label: "N5EB.JUTSU.ClassCasting" }),
      spellcasting: new SpellcastingField()
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static get compendiumBrowserFilters() {
    return new Map([
      ["hasSpellcasting", {
        label: "DND5E.CompendiumBrowser.Filters.HasSpellcasting",
        type: "boolean",
        createFilter: (filters, value, def) => {
          if ( value === 0 ) return;
          const filter = { k: "system.spellcasting.progression", v: "none" };
          if ( value === -1 ) filters.push(filter);
          else filters.push({ o: "NOT", v: filter });
        }
      }],
      ["properties", this.compendiumBrowserPropertiesFilter("class")]
    ]);
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    AdvancementTemplate.migrateAdvancement(source);
    ClassData.#migrateHitDice(source);
    ClassData.#migrateChakraDice(source);
    ClassData.#migrateLevels(source);
    ClassData.#migrateSpellcastingData(source);
  }

  /* -------------------------------------------- */

  /**
   * Migrate the hit dice data.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateHitDice(source) {
    if ( ("hitDice" in source) && (!source.hd || !("denomination" in source.hd)) ) {
      source.hd ??= {};
      source.hd.denomination = source.hitDice;
      delete source.hitDice;
    }

    if ( ("hitDiceUsed" in source) && (!source.hd || !("spent" in source.hd)) ) {
      source.hd ??= {};
      source.hd.spent = source.hitDiceUsed ?? 0;
      delete source.hitDiceUsed;
    }
  }

  /* -------------------------------------------- */

  /**
   * Migrate legacy chakra dice data without synthesizing sibling fields during sparse updates.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateChakraDice(source) {
    if ( ("chakraDice" in source) && (!source.cd || !("denomination" in source.cd)) ) {
      source.cd ??= {};
      source.cd.denomination = source.chakraDice;
      delete source.chakraDice;
    }

    if ( ("chakraDiceUsed" in source) && (!source.cd || !("spent" in source.cd)) ) {
      source.cd ??= {};
      source.cd.spent = source.chakraDiceUsed ?? 0;
      delete source.chakraDiceUsed;
    }
  }

  /* -------------------------------------------- */

  /**
   * Migrate the class levels.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateLevels(source) {
    if ( typeof source.levels !== "string" ) return;
    if ( source.levels === "" ) source.levels = 1;
    else if ( Number.isNumeric(source.levels) ) source.levels = Number(source.levels);
  }

  /* -------------------------------------------- */

  /**
   * Migrate the class's spellcasting string to object.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateSpellcastingData(source) {
    if ( foundry.utils.getType(source.spellcasting) === "Object" ) {
      const legacy = source.spellcasting;
      const abilities = ["ninjutsu", "genjutsu", "taijutsu"].reduce((obj, key) => {
        if ( legacy[key] ) obj[key] = legacy[key];
        return obj;
      }, {});
      if ( Object.keys(abilities).length ) {
        source.jutsu ??= {};
        source.jutsu.abilities ??= {};
        Object.assign(source.jutsu.abilities, abilities);
        source.spellcasting = {
          progression: legacy.progression || "none",
          ability: legacy.ability || abilities.ninjutsu || "",
          preparation: legacy.preparation ?? { formula: "" }
        };
      }
    }

    if ( source.spellcasting?.progression === "" ) source.spellcasting.progression = "none";
    if ( typeof source.spellcasting !== "string" ) return;
    source.spellcasting = {
      progression: source.spellcasting,
      ability: ""
    };
  }

  /* -------------------------------------------- */

  /**
   * Add chakra advancement to full class item source data once.
   * @param {object} source  The candidate item source data from which the class document will be constructed.
   */
  static _migrateChakraAdvancement(source) {
    const advancement = source.system?.advancement;
    if ( !("name" in source) || !advancement
      || foundry.utils.getProperty(source, "flags.n5eb.migratedChakraAdvancement") ) return;

    const advancements = Object.values(advancement);
    if ( advancements.some(a => a?.type === "Chakra") ) {
      foundry.utils.setProperty(source, "flags.n5eb.migratedChakraAdvancement", true);
      foundry.utils.setProperty(source, "flags.n5eb.persistSourceMigration", true);
      return;
    }
    if ( !advancements.some(a => a?.type === "HitPoints") ) return;

    const created = new ChakraAdvancement({ type: "Chakra" });
    advancement[created.id] = created.toObject();
    foundry.utils.setProperty(source, "flags.n5eb.migratedChakraAdvancement", true);
    foundry.utils.setProperty(source, "flags.n5eb.persistSourceMigration", true);
  }

  /* -------------------------------------------- */

  /**
   * Migrate legacy class jutsu limit fields into reserved scale values once.
   * @param {object} source  The candidate item source data from which the class document will be constructed.
   */
  static _migrateJutsuProgression(source) {
    const system = source.system;
    const advancement = system?.advancement;
    if ( !("name" in source) || !advancement
      || foundry.utils.getProperty(source, "flags.n5eb.migratedJutsuProgression") ) return;

    const jutsu = system.jutsu;
    const legacyKnown = jutsu?.known;
    const legacyRank = normalizeJutsuRank(jutsu?.maxRank);
    const hasLegacyKnown = (legacyKnown !== undefined) && (legacyKnown !== null) && (`${legacyKnown}`.trim() !== "");
    if ( !hasLegacyKnown && !legacyRank ) return;

    const existing = Object.values(advancement).reduce((ids, data) => {
      if ( data?.type !== "ScaleValue" ) return ids;
      const identifier = data.configuration?.identifier || formatIdentifier(data.title ?? "");
      ids.add(identifier);
      return ids;
    }, new Set());

    const known = Number(legacyKnown);
    if ( hasLegacyKnown && Number.isFinite(known) && !existing.has(JUTSU_KNOWN_SCALE_ID) ) {
      const created = createJutsuScaleAdvancement({
        identifier: JUTSU_KNOWN_SCALE_ID,
        title: game.i18n.localize("N5EB.JUTSU.Known"),
        type: "number",
        scale: { 1: { value: known } }
      });
      advancement[created._id] = created;
    }

    if ( legacyRank && !existing.has(JUTSU_MAX_RANK_SCALE_ID) ) {
      const created = createJutsuScaleAdvancement({
        identifier: JUTSU_MAX_RANK_SCALE_ID,
        title: game.i18n.localize("N5EB.JUTSU.HighestRankKnown"),
        type: "jutsuRank",
        scale: { 1: { value: legacyRank } }
      });
      advancement[created._id] = created;
    }

    foundry.utils.setProperty(source, "flags.n5eb.migratedJutsuProgression", true);
    foundry.utils.setProperty(source, "flags.n5eb.persistSourceMigration", true);
  }

  /* -------------------------------------------- */

  /**
   * Migrate the class's saves & skills into TraitAdvancements.
   * @param {object} source  The candidate source data from which the model will be constructed.
   * @protected
   */
  static _migrateTraitAdvancement(source) {
    const system = source.system;
    if ( !system?.advancement || Object.values(system.advancement).find(a => a?.type === "Trait") ) return;
    let needsMigration = false;

    if ( system.saves?.length ) {
      const savesData = {
        type: "Trait",
        level: 1,
        configuration: {
          grants: system.saves.map(t => `saves:${t}`)
        }
      };
      savesData.value = {
        chosen: savesData.configuration.grants
      };
      const created = new TraitAdvancement(savesData);
      system.advancement[created.id] = created.toObject();
      delete system.saves;
      needsMigration = true;
    }

    if ( system.skills?.choices?.length ) {
      const skillsData = {
        type: "Trait",
        level: 1,
        configuration: {
          choices: [{
            count: system.skills.number ?? 1,
            pool: system.skills.choices.map(t => `skills:${t}`)
          }]
        }
      };
      if ( system.skills.value?.length ) {
        skillsData.value = {
          chosen: system.skills.value.map(t => `skills:${t}`)
        };
      }
      const created = new TraitAdvancement(skillsData);
      system.advancement[created.id] = created.toObject();
      delete system.skills;
      needsMigration = true;
    }

    if ( needsMigration ) foundry.utils.setProperty(source, "flags.n5eb.persistSourceMigration", true);
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
    this.spellcasting.preparation.value = 0;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.prepareDescriptionData();
    this.tier = Math.ceil((this.levels - 4) / 6) + 1;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareFinalData() {
    this.isOriginalClass = this.parent.isOriginalClass;
    const rollData = this.parent.getRollData({ deterministic: true });
    SpellcastingField.prepareData.call(this, rollData);
    this.hd.additional = this.hd.additional ? Roll.create(this.hd.additional, rollData).evaluateSync().total : 0;
    this.hd.max = Math.max(this.levels + this.hd.additional, 0);
    this.hd.value = Math.max(this.hd.max - this.hd.spent, 0);
    this.cd.additional = this.cd.additional ? Roll.create(this.cd.additional, rollData).evaluateSync().total : 0;
    this.cd.max = Math.max(this.levels + this.cd.additional, 0);
    this.cd.value = Math.max(this.cd.max - this.cd.spent, 0);
    this.jutsu.knownValue = getJutsuKnownValue(this.parent, rollData);
    this.jutsu.hasKnownLimit = Number.isFinite(this.jutsu.knownValue);
    this.jutsu.maxRankValue = getJutsuMaxRank(this.parent);
    this.jutsu.maxRankLabel = this.jutsu.maxRankValue
      ? game.i18n.localize(CONFIG.DND5E.jutsuRanks[this.jutsu.maxRankValue]?.label)
      : "";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getFavoriteData() {
    const context = await super.getFavoriteData();
    if ( this.parent.subclass ) context.subtitle = this.parent.subclass.name;
    context.value = this.levels;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getSheetData(context) {
    context.subtitles = [{ label: game.i18n.localize(CONFIG.Item.typeLabels.class) }];
    context.singleDescription = true;
    context.source.jutsu ??= foundry.utils.deepClone(this.jutsu);
    context.source.jutsu.abilities ??= foundry.utils.deepClone(this.jutsu.abilities);
    context.source.spellcasting ??= foundry.utils.deepClone(this.spellcasting);
    context.jutsuProgression = {
      known: this.jutsu.hasKnownLimit ? this.jutsu.knownValue : null,
      maxRank: this.jutsu.maxRankLabel,
      hasKnownLimit: this.jutsu.hasKnownLimit,
      hasMaxRank: !!this.jutsu.maxRankValue
    };

    context.parts = ["dnd5e.details-class", "dnd5e.details-spellcasting", "dnd5e.details-starting-equipment"];
    context.hitDieOptions = CONFIG.DND5E.hitDieTypes.map(d => ({ value: d, label: d }));
    context.chakraDieOptions = CONFIG.DND5E.chakraDieTypes.map(d => ({ value: d, label: d }));
    context.jutsuRankOptions = CONFIG.DND5E.jutsuRankOrder.map(rank => ({
      value: rank,
      label: CONFIG.DND5E.jutsuRanks[rank].label
    }));
    context.primaryAbilities = Object.entries(CONFIG.DND5E.abilities).map(([value, data]) => ({
      value, label: data.label, selected: this.primaryAbility.value.has(value)
    }));
  }

  /* -------------------------------------------- */
  /*  Socket Event Handlers                       */
  /* -------------------------------------------- */

  /** @override */
  _advancementToCreate(options) {
    return [
      { type: "HitPoints" },
      { type: "Chakra" },
      {
        type: "ScaleValue",
        title: game.i18n.localize("N5EB.JUTSU.Known"),
        configuration: { identifier: JUTSU_KNOWN_SCALE_ID, type: "number", scale: {} }
      },
      {
        type: "ScaleValue",
        title: game.i18n.localize("N5EB.JUTSU.HighestRankKnown"),
        configuration: { identifier: JUTSU_MAX_RANK_SCALE_ID, type: "jutsuRank", scale: {} }
      },
      { type: "Subclass", level: 3 },
      { type: "AbilityScoreImprovement", level: 4 },
      { type: "AbilityScoreImprovement", level: 8 },
      { type: "AbilityScoreImprovement", level: 12 },
      { type: "AbilityScoreImprovement", level: 16 },
      { type: "AbilityScoreImprovement", level: 19 }
    ];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    await this.preCreateAdvancement(data, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);
    const actor = this.parent.actor;
    if ( !actor || (userId !== game.user.id) ) return;

    if ( actor.system.isCharacter ) {
      const pc = actor.items.get(actor.system.details.originalClass);
      if ( !pc ) await actor._assignPrimaryClass();
    }

    if ( !actor.system.attributes?.spellcasting && this.parent.spellcasting?.ability ) {
      await actor.update({ "system.attributes.spellcasting": this.parent.spellcasting.ability });
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    if ( (await super._preUpdate(changed, options, user)) === false ) return false;
    if ( !("levels" in (changed.system ?? {})) ) return;

    // Check to make sure the updated class level isn't below zero
    if ( changed.system.levels <= 0 ) {
      ui.notifications.warn("DND5E.MaxClassLevelMinimumWarn", { localize: true });
      changed.system.levels = 1;
    }

    // Check to make sure the updated class level doesn't exceed level cap
    if ( changed.system.levels > CONFIG.DND5E.maxLevel ) {
      ui.notifications.warn(game.i18n.format("DND5E.MaxClassLevelExceededWarn", { max: CONFIG.DND5E.maxLevel }));
      changed.system.levels = CONFIG.DND5E.maxLevel;
    }

    if ( !this.parent.actor?.system.isCharacter ) return;

    // Check to ensure the updated character doesn't exceed level cap
    const newCharacterLevel = this.parent.actor.system.details.level + (changed.system.levels - this.levels);
    if ( newCharacterLevel > CONFIG.DND5E.maxLevel ) {
      ui.notifications.warn(game.i18n.format("DND5E.MaxCharacterLevelExceededWarn", { max: CONFIG.DND5E.maxLevel }));
      changed.system.levels -= newCharacterLevel - CONFIG.DND5E.maxLevel;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( userId !== game.user.id ) return;
    if ( this.parent.id === this.parent.actor?.system.details?.originalClass ) {
      this.parent.actor._assignPrimaryClass();
    }
  }
}

/* -------------------------------------------- */

/**
 * Create a ScaleValue advancement source for reserved jutsu progression.
 * @param {object} data             Scale value construction data.
 * @param {string} data.identifier  Scale value identifier.
 * @param {string} data.title       Scale value title.
 * @param {string} data.type        Scale value type.
 * @param {object} data.scale       Scale rows.
 * @returns {object}
 */
function createJutsuScaleAdvancement({ identifier, title, type, scale }) {
  return new ScaleValueAdvancement({
    type: "ScaleValue",
    title,
    configuration: { identifier, type, scale }
  }).toObject();
}

/* -------------------------------------------- */

/**
 * Retrieve the current jutsu known value for a class.
 * @param {Item5e} item       Class item.
 * @param {object} rollData   Roll data for legacy formulas.
 * @returns {number|null}
 */
function getJutsuKnownValue(item, rollData) {
  const scaled = item.scaleValues?.[JUTSU_KNOWN_SCALE_ID]?.value;
  if ( Number.isFinite(scaled) ) return scaled;
  const legacy = item.system.jutsu?.known;
  if ( legacy ) return simplifyBonus(legacy, rollData);
  return null;
}

/* -------------------------------------------- */

/**
 * Retrieve the current highest jutsu rank for a class.
 * @param {Item5e} item  Class item.
 * @returns {string}
 */
function getJutsuMaxRank(item) {
  const scaleValues = item.scaleValues ?? {};
  const reserved = normalizeJutsuRank(scaleValues[JUTSU_MAX_RANK_SCALE_ID]?.value);
  if ( reserved ) return reserved;

  for ( const identifier of JUTSU_MAX_RANK_SCALE_ALIASES ) {
    const rank = normalizeJutsuRank(scaleValues[identifier]?.value);
    if ( rank ) return rank;
  }

  const level = item.system.levels ?? 0;
  for ( const advancement of item.advancement?.byType?.ScaleValue ?? [] ) {
    const identifier = advancement.identifier;
    if ( !JUTSU_MAX_RANK_SCALE_ALIASES.has(identifier) && (advancement.configuration.type !== "jutsuRank") ) {
      continue;
    }
    const rank = normalizeJutsuRank(advancement.valueForLevel(level)?.value);
    if ( rank ) return rank;
  }

  return normalizeJutsuRank(item.system.jutsu?.maxRank);
}

/* -------------------------------------------- */

/**
 * Normalize user-facing jutsu rank values into internal rank keys.
 * @param {string} value  Value to normalize.
 * @returns {string}
 */
function normalizeJutsuRank(value) {
  if ( typeof value !== "string" ) return "";
  const lower = value.trim().toLowerCase().replace(/-?rank$/, "");
  if ( lower in CONFIG.DND5E.jutsuRanks ) return lower;
  return Object.entries(CONFIG.DND5E.jutsuRanks).find(([, config]) => {
    return [config.label, config.abbreviation].some(label => game.i18n.localize(label).toLowerCase() === lower);
  })?.[0] ?? "";
}
