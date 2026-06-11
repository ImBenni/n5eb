import { getRulesVersion } from "../../enrichers.mjs";
import { getClassmodArtsCastingKey, getClassmodIdentifierFromCastingKey } from "../../classmod-arts.mjs";
import { filteredKeys, formatNumber, simplifyBonus } from "../../utils.mjs";
import ItemDataModel from "../abstract/item-data-model.mjs";
import FormulaField from "../fields/formula-field.mjs";
import IdentifierField from "../fields/identifier-field.mjs";
import ActivationField from "../shared/activation-field.mjs";
import DurationField from "../shared/duration-field.mjs";
import RangeField from "../shared/range-field.mjs";
import TargetField from "../shared/target-field.mjs";
import ActivitiesTemplate from "./templates/activities.mjs";
import ItemDescriptionTemplate from "./templates/item-description.mjs";

const { BooleanField, NumberField, SchemaField, SetField, StringField } = foundry.data.fields;

/**
 * @import { SpellItemSystemData } from "./_types.mjs";
 * @import { ActivitiesTemplateData ItemDescriptionTemplateData } from "./templates/_types.mjs";
 */

/**
 * Data definition for Spell items.
 * @extends {ItemDataModel<ActivitiesTemplate & ItemDescriptionTemplate & SpellItemSystemData>}
 * @mixes ActivitiesTemplateData
 * @mixes ItemDescriptionTemplateData
 * @mixes SpellItemSystemData
 */
export default class SpellData extends ItemDataModel.mixin(ActivitiesTemplate, ItemDescriptionTemplate) {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = [
    "DND5E.ACTIVATION", "DND5E.DURATION", "DND5E.RANGE", "DND5E.SOURCE", "DND5E.TARGET"
  ];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      ability: new StringField({ label: "DND5E.SpellAbility" }),
      activation: new ActivationField(),
      duration: new DurationField(),
      level: new NumberField({ required: true, integer: true, initial: 1, min: 0, label: "DND5E.SpellLevel" }),
      rank: new StringField({ required: true, blank: false, initial: "d", label: "N5EB.JUTSU.Rank.Label" }),
      jutsu: new SchemaField({
        type: new StringField({ required: true, blank: true, initial: "", label: "N5EB.JUTSU.Type.Label" }),
        ability: new StringField({ required: true, blank: true, initial: "", label: "N5EB.JUTSU.AbilityOverride" }),
        components: new SetField(new StringField(), { label: "N5EB.JUTSU.Components" }),
        keywords: new SetField(new StringField(), { label: "N5EB.JUTSU.Keywords" }),
        countsKnown: new BooleanField({ required: true, initial: true, label: "N5EB.JUTSU.CountsKnown" })
      }, { label: "N5EB.JUTSU.Label" }),
      chakra: new SchemaField({
        cost: new FormulaField({ deterministic: true, label: "N5EB.JUTSU.ChakraCost" }),
        scaling: new SchemaField({
          mode: new StringField({
            required: true, blank: false, initial: "none", choices: () => CONFIG.DND5E.jutsuChakraScalingModes,
            label: "N5EB.JUTSU.Scaling.Mode"
          }),
          value: new NumberField({
            required: true, integer: true, initial: 0, min: 0, label: "N5EB.JUTSU.Scaling.Value"
          })
        }, { label: "N5EB.JUTSU.Scaling.Label" }),
        special: new StringField({ required: true, blank: true, initial: "", label: "N5EB.JUTSU.SpecialCost" })
      }, { label: "N5EB.JUTSU.Chakra" }),
      materials: new SchemaField({
        value: new StringField({ required: true, label: "DND5E.SpellMaterialsDescription" }),
        consumed: new BooleanField({ required: true, label: "DND5E.SpellMaterialsConsumed" }),
        cost: new NumberField({ required: true, initial: 0, min: 0, label: "DND5E.SpellMaterialsCost" }),
        supply: new NumberField({ required: true, initial: 0, min: 0, label: "DND5E.SpellMaterialsSupply" })
      }, { label: "DND5E.SpellMaterials" }),
      method: new StringField({ required: true, initial: "", label: "DND5E.SpellPreparation.Method" }),
      prepared: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      properties: new SetField(new StringField(), { label: "DND5E.SpellComponents" }),
      range: new RangeField(),
      school: new StringField({ required: true, blank: true, initial: "", label: "DND5E.SpellSchool" }),
      sourceItem: new IdentifierField({ allowType: true, label: "DND5E.SourceItem.Label" }),
      target: new TargetField()
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    enchantable: true,
    hasEffects: true
  }, { inplace: false }));

  /* -------------------------------------------- */

  /** @override */
  static get compendiumBrowserFilters() {
    return new Map([
      ["level", {
        label: "DND5E.Level",
        type: "range",
        config: {
          keyPath: "system.level",
          min: 0,
          max: Object.keys(CONFIG.DND5E.spellLevels).length - 1
        }
      }],
      ["school", {
        label: "DND5E.School",
        type: "set",
        config: {
          choices: CONFIG.DND5E.spellSchools,
          keyPath: "system.school"
        }
      }],
      ["spelllist", {
        label: "TYPES.JournalEntryPage.spells",
        type: "set",
        createFilter: (filters, value, def) => {
          let include = new Set();
          let exclude = new Set();
          for ( const [k, v] of Object.entries(value ?? {}) ) {
            const list = dnd5e.registry.spellLists.forType(k);
            if ( !list || (v === 0) ) continue;
            if ( v === 1 ) include = include.union(list.identifiers);
            else if ( v === -1 ) exclude = exclude.union(list.identifiers);
          }
          if ( include.size ) filters.push({ k: "system.identifier", o: "in", v: include });
          if ( exclude.size ) filters.push({ o: "NOT", v: { k: "system.identifier", o: "in", v: exclude } });
        },
        config: {
          choices: dnd5e.registry.spellLists.options.reduce((obj, entry) => {
            const [type, identifier] = entry.value.split(":");
            const list = dnd5e.registry.spellLists.forType(type, identifier);
            if ( list?.identifiers.size ) obj[entry.value] = {
              label: entry.label, group: CONFIG.DND5E.spellListTypes[type]
            };
            return obj;
          }, {}),
          collapseGroup: group => group !== CONFIG.DND5E.spellListTypes.class
        }
      }],
      ["properties", this.compendiumBrowserPropertiesFilter("spell")]
    ]);
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Attack classification of this spell.
   * @type {"spell"}
   */
  get attackClassification() {
    return "spell";
  }

  /* -------------------------------------------- */

  /**
   * The identifier of the spellcasting class associated with this spell, resolved through subclass parentage where
   * necessary. Returns an empty string if the spell was not granted by a class or subclass item.
   * @type {string}
   */
  get classIdentifier() {
    if ( !this.sourceItem ) return "";
    const sourceItem = this.parent?.actor?.identifiedItems.get(this.sourceItem)?.first();
    if ( sourceItem?.type === "class" ) return sourceItem.identifier;
    if ( sourceItem?.type === "subclass" ) return sourceItem.system.classIdentifier ?? "";
    return "";
  }

  /* -------------------------------------------- */

  /**
   * The identifier of the classmod associated with this jutsu, if any.
   * @type {string}
   */
  get classmodIdentifier() {
    const sourceIdentifier = getClassmodIdentifierFromCastingKey(this.sourceItem);
    if ( sourceIdentifier ) return sourceIdentifier;
    const sourceItem = this.parent?.actor?.identifiedItems.get(this.sourceItem)?.first();
    return sourceItem?.type === "classmod" ? sourceItem.identifier : "";
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since 5.3
   * @ignore
   */
  get sourceClass() {
    foundry.utils.logCompatibilityWarning("SpellData#sourceClass is deprecated. Please use SpellData#sourceItem "
      + "instead.", { since: "DnD5e 5.3", until: "DnD5e 6.0" });
    return this.classIdentifier ?? "";
  }

  /* -------------------------------------------- */

  /** @override */
  get availableAbilities() {
    if ( this.jutsu.ability ) return new Set([this.jutsu.ability]);
    if ( this.ability ) return new Set([this.ability]);

    const jutsuCasting = this.jutsuCastingType;
    const jutsuAbility = this.parent?.actor?.system.attributes?.jutsu?.[jutsuCasting]?.ability;
    if ( jutsuAbility ) return new Set([jutsuAbility]);

    const spellcasting = this.parent?.actor?.spellcastingClasses[this.classIdentifier]?.spellcasting.ability
      ?? this.parent?.actor?.system.attributes?.spellcasting;
    return new Set(spellcasting ? [spellcasting] : []);
  }

  /* -------------------------------------------- */

  /** @override */
  get canConfigureScaling() {
    return this.level > 0;
  }

  /* -------------------------------------------- */

  /**
   * Whether the spell can be prepared.
   * @type {boolean}
   */
  get canPrepare() {
    return false;
  }

  /* -------------------------------------------- */

  /** @override */
  get canScale() {
    return this.level > 0;
  }

  /* -------------------------------------------- */

  /** @override */
  get canScaleDamage() {
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Properties displayed in chat.
   * @type {string[]}
   */
  get chatProperties() {
    return [
      this.parent.labels.rank,
      this.parent.labels.jutsuType,
      this.parent.labels.chakra,
      this.parent.labels.jutsuComponents?.short,
      ...this.parent.labels.components.tags,
      this.parent.labels.duration
    ].filter(_ => _);
  }

  /* -------------------------------------------- */

  /**
   * Whether this spell counts towards a class' number of prepared spells.
   * @type {boolean}
   */
  get countsPrepared() {
    return false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get _typeAbilityMod() {
    return this.availableAbilities.first() ?? "int";
  }

  /* -------------------------------------------- */

  /** @override */
  get criticalThreshold() {
    return this.parent?.actor?.flags.n5eb?.spellCriticalThreshold ?? Infinity;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a linked activity that granted this spell using the stored `cachedFor` value.
   * @returns {Activity|null}
   */
  get linkedActivity() {
    const relative = this.parent.actor;
    const uuid = this.parent.getFlag("n5eb", "cachedFor");
    if ( !relative || !uuid ) return null;
    const data = foundry.utils.parseUuid(uuid, { relative });
    const [itemId, , activityId] = (data?.embedded ?? []).slice(-3);
    return relative.items.get(itemId)?.system.activities?.get(activityId) ?? null;
    // TODO: Swap back to fromUuidSync once https://github.com/foundryvtt/foundryvtt/issues/11214 is resolved
    // return fromUuidSync(this.parent.getFlag("n5eb", "cachedFor"), { relative, strict: false }) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * The proficiency multiplier for this item.
   * @returns {number}
   */
  get proficiencyMultiplier() {
    return 1;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get scalingIncrease() {
    if ( this.level === 0 ) return Math.floor(((this.parent.actor?.system.cantripLevel?.(this.parent) ?? 0) + 1) / 6);
    const activity = this.linkedActivity;
    if ( !activity?.spell?.level || (activity.spell.level <= this.level) ) return null;
    return activity.spell.level - this.level;
  }

  /* -------------------------------------------- */

  /** @override */
  get tooltipSubtitle() {
    return [this.parent.labels.rank, this.parent.labels.jutsuType];
  }

  /* -------------------------------------------- */

  /**
   * Effective jutsu rank.
   * @type {string}
   */
  get effectiveRank() {
    return this.rank || SpellData.rankForLevel(this.level);
  }

  /* -------------------------------------------- */

  /**
   * The actor casting stat block used by this jutsu.
   * @type {"ninjutsu"|"taijutsu"|"genjutsu"|null}
   */
  get jutsuCastingType() {
    const classmodIdentifier = this.classmodIdentifier;
    if ( classmodIdentifier && this.parent?.actor?.classmods?.[classmodIdentifier] ) {
      return getClassmodArtsCastingKey(classmodIdentifier);
    }
    return CONFIG.DND5E.jutsuTypes[this.jutsu.type]?.casting ?? null;
  }

  /* -------------------------------------------- */

  /**
   * The evaluated chakra cost.
   * @type {number}
   */
  get chakraCost() {
    return this.getChakraCost();
  }

  /* -------------------------------------------- */

  /**
   * The base jutsu rank index, clamped to a known rank.
   * @type {number}
   */
  get baseRankIndex() {
    return Math.max(CONFIG.DND5E.jutsuRankOrder.indexOf(this.effectiveRank), 0);
  }

  /* -------------------------------------------- */

  /**
   * Calculate the number of ranks this jutsu is being cast above its base rank.
   * @param {string} [rank]  Cast rank.
   * @returns {number}
   */
  getRankDelta(rank=this.effectiveRank) {
    const rankIndex = CONFIG.DND5E.jutsuRankOrder.indexOf(rank);
    return Math.max((rankIndex >= 0 ? rankIndex : this.baseRankIndex) - this.baseRankIndex, 0);
  }

  /* -------------------------------------------- */

  /**
   * Calculate the chakra cost for this jutsu at a given rank.
   * @param {object} [options={}]
   * @param {string} [options.rank]  Cast rank.
   * @returns {number}
   */
  getChakraCost({ rank=this.effectiveRank }={}) {
    const adversary = this.parent.actor?.system.details.adversary;
    if ( adversary?.enabled && (adversary.class === "minion") ) return 0;
    if ( adversary?.enabled && adversary.fixedJutsuCost ) {
      return CONFIG.DND5E.adversaryJutsuCosts[rank] ?? 0;
    }

    const rollData = this.parent.actor?.getRollData({ deterministic: true }) ?? {};
    rollData.item ??= {};
    rollData.item.level = SpellData.levelForRank(rank);
    rollData.item.rank = rank;
    rollData.item.rankDelta = this.getRankDelta(rank);

    const baseCost = simplifyBonus(this.chakra.cost, rollData);
    let cost = Number.isFinite(baseCost) ? baseCost : 0;
    if ( this.chakra.scaling?.mode === "rank" ) {
      cost += (Number(this.chakra.scaling.value) || 0) * rollData.item.rankDelta;
    }
    if ( ["ninjutsu", "genjutsu"].includes(this.jutsuCastingType) ) {
      cost += (this.parent.actor?.getConditionRank?.("sealed") ?? 0) * 2;
    }
    return Math.max(0, Math.floor(cost));
  }

  /* -------------------------------------------- */

  /**
   * Calculate the concentration maintain cost for this jutsu at a given rank.
   * @param {object} [options={}]
   * @param {string} [options.rank]  Cast rank.
   * @param {number} [options.cost]  Precalculated cast cost.
   * @returns {number}
   */
  getMaintainCost({ rank=this.effectiveRank, cost=null }={}) {
    cost ??= this.getChakraCost({ rank });
    return Math.max(0, Math.floor((Number(cost) || 0) / 2));
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * @deprecated since 5.1
   * @ignore
   */
  get preparation() {
    foundry.utils.logCompatibilityWarning("SpellData#preparation is deprecated. Please use SpellData#method in "
      + "place of preparation.mode and SpellData#prepared in place of preparation.prepared.",
    { since: "DnD5e 5.1", until: "DnD5e 6.0" });
    if ( this.prepared === 2 ) return { mode: "always", prepared: 1 };
    if ( this.method === "spell" ) return { mode: "prepared", prepared: Boolean(this.prepared) };
    return { mode: this.method, prepared: Boolean(this.prepared) };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    SpellData.#migrateLegacyN5eBJutsu(source);
    ActivitiesTemplate.migrateActivities(source);
    SpellData.#migrateActivation(source);
    SpellData.#migrateJutsuData(source);
    SpellData.#migrateTarget(source);
    SpellData.#migratePreparation(source);
    SpellData.#migrateSourceItem(source);
  }

  /* -------------------------------------------- */

  /**
   * Migrate the component object to be 'properties' instead.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static _migrateComponentData(source) {
    const components = filteredKeys(source.system?.components ?? {});
    if ( components.length ) {
      foundry.utils.setProperty(source, "flags.n5eb.migratedProperties", components);
    }
  }

  /* -------------------------------------------- */

  /**
   * Migrate activation data.
   * Added in DnD5e 4.0.0.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateActivation(source) {
    if ( source.activation?.cost ) source.activation.value = source.activation.cost;
  }

  /* -------------------------------------------- */

  /**
   * Migrate old N5eB jutsu fields into the current v14 jutsu structure.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateLegacyN5eBJutsu(source) {
    const schoolMap = {
      buki: "bukijutsu",
      gen: "genjutsu",
      hi: "ninjutsu",
      nin: "ninjutsu",
      tai: "taijutsu"
    };
    const componentMap = {
      chakramolding: "cm",
      chakraseals: "cs",
      handseals: "hs",
      mobility: "m",
      molding: "cm",
      ninjatool: "nt",
      ninjatools: "nt",
      weapon: "w",
      weapons: "w"
    };
    const keywordMap = {
      bukijutsu: "bukijutsu",
      chain: "chain",
      clash: "clash",
      clone: "clone",
      combo: "combo",
      combination: "combination",
      construct: "construct",
      fire: "fire",
      fuinjutsu: "fuinjutsu",
      genjutsu: "genjutsu",
      hijutsu: "hijutsu",
      kinjutsu: "kinjutsu",
      lightning: "lightning",
      medical: "medical",
      ninjutsu: "ninjutsu",
      sensory: "sensory",
      taijutsu: "taijutsu",
      water: "water",
      wind: "wind",
      earth: "earth"
    };

    const getKeys = value => {
      if ( Array.isArray(value) ) return value;
      if ( value instanceof Set ) return Array.from(value);
      if ( foundry.utils.getType(value) === "Object" ) return filteredKeys(value);
      return [];
    };

    const oldProperties = getKeys(source.properties);
    const oldKeywords = getKeys(source.keywords);
    source.jutsu ??= {};
    const components = new Set(getKeys(source.jutsu.components));
    const keywords = new Set([...getKeys(source.jutsu.keywords), ...oldKeywords]);

    const jutsuType = schoolMap[source.school];
    if ( jutsuType ) {
      if ( !source.jutsu.type ) source.jutsu.type = jutsuType;
      keywords.add(jutsuType);
      if ( source.school === "hi" ) keywords.add("hijutsu");
      source.school = jutsuType === "genjutsu" ? "ill" : "trs";
    }

    for ( const property of oldProperties ) {
      const component = componentMap[property];
      if ( component ) components.add(component);
      const keyword = keywordMap[property];
      if ( keyword ) keywords.add(keyword);
    }

    if ( "chakraCost" in source ) {
      source.chakra ??= {};
      if ( !source.chakra.cost ) source.chakra.cost = `${source.chakraCost ?? ""}`;
      delete source.chakraCost;
    }
    SpellData.#migrateChakraScaling(source);

    source.jutsu.components = Array.from(components);
    source.jutsu.keywords = Array.from(keywords);
    source.properties = oldProperties.filter(p => ["concentration", "material", "ritual", "somatic", "vocal"].includes(p));
    delete source.keywords;

    source.actionType = {
      abil: "abil",
      mgak: "msak",
      mnak: "msak",
      mtak: "msak",
      rgak: "rsak",
      rnak: "rsak",
      rtak: "rsak"
    }[source.actionType] ?? source.actionType;
  }

  /* -------------------------------------------- */

  /**
   * Migrate old N5eB chakra scaling values into the structured scaling schema.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateChakraScaling(source) {
    source.chakra ??= {};
    const current = source.chakra.scaling;
    if ( current?.mode ) {
      delete source.chakraScaling;
      return;
    }

    const legacy = source.chakraScaling ?? SpellData.#parseLegacyChakraScaling(source.chakra.special);
    if ( legacy ) {
      const mode = `${legacy.mode ?? ""}`.toLowerCase();
      const value = Number(legacy.value ?? 0);
      if ( (mode === "level") && Number.isFinite(value) && (value > 0) ) {
        source.chakra.scaling = { mode: "rank", value: Math.floor(value) };
        if ( SpellData.#isLegacyScalingNote(source.chakra.special) ) source.chakra.special = "";
      } else {
        source.chakra.scaling = { mode: "none", value: 0 };
        if ( SpellData.#isLegacyScalingNote(source.chakra.special) ) source.chakra.special = "";
      }
    } else if ( source.chakra.special && Number.isNumeric(source.chakra.special) ) {
      source.chakra.scaling = { mode: "rank", value: Math.floor(Number(source.chakra.special)) };
      source.chakra.special = "";
    } else {
      source.chakra.scaling = { mode: "none", value: 0 };
    }
    delete source.chakraScaling;
  }

  /* -------------------------------------------- */

  /**
   * Parse an old chakra scaling value stored as text.
   * @param {*} value  Candidate value.
   * @returns {object|null}
   */
  static #parseLegacyChakraScaling(value) {
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
   */
  static #isLegacyScalingNote(value) {
    if ( !value ) return false;
    const trimmed = `${value}`.trim();
    return Number.isNumeric(trimmed) || /^\{.*"mode".*"value".*\}$/.test(trimmed);
  }

  /* -------------------------------------------- */

  /**
   * Derive jutsu compatibility data from legacy spell level data.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateJutsuData(source) {
    if ( !("rank" in source) && ("level" in source) ) source.rank = SpellData.rankForLevel(source.level);
  }

  /* -------------------------------------------- */

  /**
   * Migrate target data.
   * Added in DnD5e 4.0.0.
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateTarget(source) {
    if ( !("target" in source) ) return;
    source.target.affects ??= {};
    source.target.template ??= {};

    if ( "units" in source.target ) source.target.template.units = source.target.units;
    if ( "width" in source.target ) source.target.template.width = source.target.width;

    const type = source.target.type ?? source.target.template.type ?? source.target.affects.type;
    if ( type in CONFIG.DND5E.areaTargetTypes ) {
      if ( "type" in source.target ) source.target.template.type = type;
      if ( "value" in source.target ) source.target.template.size = source.target.value;
    } else if ( type in CONFIG.DND5E.individualTargetTypes ) {
      if ( "type" in source.target ) source.target.affects.type = type;
      if ( "value" in source.target ) source.target.affects.count = source.target.value;
    }
  }

  /* -------------------------------------------- */

  /**
   * Migrate preparation data.
   * @since 5.1.0
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migratePreparation(source) {
    if ( source.preparation === undefined ) return;
    if ( source.preparation.mode === "always" ) {
      if ( !("method" in source) ) source.method = "spell";
      if ( !("prepared" in source) ) source.prepared = 2;
    } else {
      if ( !("method" in source) ) {
        if ( source.preparation.mode === "prepared" ) source.method = "spell";
        else if ( source.preparation.mode ) source.method = source.preparation.mode;
      }
      if ( (typeof source.preparation.prepared === "boolean") && !("prepared" in source) ) {
        source.prepared = Number(source.preparation.prepared);
      }
    }
    delete source.preparation;
  }

  /* -------------------------------------------- */

  /**
   * Migrate sourceClass to sourceItem.
   * @since 5.3.0
   * @param {object} source  The candidate source data from which the model will be constructed.
   */
  static #migrateSourceItem(source) {
    if ( "sourceClass" in source ) {
      if ( source.sourceClass ) source.sourceItem = `class:${source.sourceClass}`;
      delete source.sourceClass;
    }
  }

  /* -------------------------------------------- */

  /**
   * Convert legacy spell level to jutsu rank.
   * @param {number} level  Legacy spell level.
   * @returns {string}
   */
  static rankForLevel(level) {
    level = Math.clamp(Number(level) || 0, 0, 9);
    return CONFIG.DND5E.jutsuRankBySpellLevel[level] ?? "d";
  }

  /* -------------------------------------------- */

  /**
   * Convert jutsu rank to the compatibility spell level.
   * @param {string} rank  Jutsu rank.
   * @returns {number}
   */
  static levelForRank(rank) {
    return CONFIG.DND5E.jutsuSpellLevelByRank[rank] ?? 1;
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.prepareDescriptionData();
    this.properties.add("mgc");
    this.duration.concentration = this.properties.has("concentration");

    const labels = this.parent.labels ??= {};
    const rank = this.effectiveRank;
    const rankConfig = CONFIG.DND5E.jutsuRanks[rank];
    labels.rank = rankConfig?.label ?? rank;
    labels.rankAbbr = rankConfig?.abbreviation ?? rank.toUpperCase();
    labels.level = labels.rank;
    labels.school = CONFIG.DND5E.spellSchools[this.school]?.label;
    labels.jutsuType = CONFIG.DND5E.jutsuTypes[this.jutsu.type]?.label ?? game.i18n.localize("N5EB.JUTSU.Unclassified");
    labels.chakraCost = this.chakraCost;
    labels.chakra = labels.chakraCost ? game.i18n.format("N5EB.JUTSU.ChakraCostLabel", {
      cost: formatNumber(labels.chakraCost)
    }) : "";
    labels.maintainCost = this.getMaintainCost({ cost: labels.chakraCost });
    if ( this.properties.has("material") ) labels.materials = this.materials.value;

    labels.components = this.properties.reduce((obj, c) => {
      const config = this.validProperties.has(c) ? CONFIG.DND5E.itemProperties[c] : null;
      if ( !config ) return obj;
      const { abbreviation: abbr, label, icon } = config;
      // Only add properties to display arrays if they have displayable content
      if ( config.isTag ) {
        // Tag properties: add to tags if has label
        if ( label ) obj.tags.push(label);
        if ( abbr || icon ) obj.all.push({ abbr, icon, tag: true });
      } else if ( abbr ) {
        // VSM properties: only add if has abbreviation
        obj.vsm.push(abbr);
        obj.all.push({ abbr, icon, tag: false });
      }
      // Properties with neither abbreviation nor isTag are silently ignored for display
      return obj;
    }, { all: [], vsm: [], tags: [] });
    labels.components.vsm = game.i18n.getListFormatter({ style: "narrow" }).format(labels.components.vsm);
    labels.components.full = labels.materials ? game.i18n.format("DND5E.SpellComponentsMaterial", {
      components: labels.components.vsm, materials: labels.materials
    }) : labels.components.vsm;

    const componentLabels = Array.from(this.jutsu.components ?? []).map(component => {
      const config = CONFIG.DND5E.jutsuComponents[component];
      if ( !config ) return null;
      return { key: component, label: config.label, abbreviation: config.abbreviation };
    }).filter(_ => _);
    labels.jutsuComponents = {
      all: componentLabels,
      short: game.i18n.getListFormatter({ style: "narrow" }).format(componentLabels.map(c => c.abbreviation)),
      full: game.i18n.getListFormatter().format(componentLabels.map(c => c.label))
    };

    const keywordLabels = Array.from(this.jutsu.keywords ?? []).map(keyword => {
      const config = CONFIG.DND5E.jutsuKeywords[keyword];
      if ( !config ) return null;
      return { key: keyword, label: config.label, limited: config.limited };
    }).filter(_ => _);
    labels.jutsuKeywords = {
      all: keywordLabels,
      short: game.i18n.getListFormatter().format(keywordLabels.map(k => k.label))
    };

    const uuid = this.parent._stats.compendiumSource ?? this.parent.uuid;
    Object.defineProperty(labels, "classes", {
      get() {
        return Array.from(dnd5e.registry.spellLists.forSpell(uuid))
          .filter(list => list.metadata.type === "class")
          .map(list => list.name)
          .sort((lhs, rhs) => lhs.localeCompare(rhs, game.i18n.lang));
      },
      configurable: true
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareFinalData() {
    const rollData = this.parent.getRollData({ deterministic: true });
    const labels = this.parent.labels ??= {};
    this.prepareFinalActivityData(rollData);
    ActivationField.prepareData.call(this, rollData, labels);
    DurationField.prepareData.call(this, rollData, labels);
    RangeField.prepareData.call(this, rollData, labels);
    TargetField.prepareData.call(this, rollData, labels);

    // Count preparations.
    if ( this.classIdentifier && this.countsPrepared ) {
      const sourceClass = this.parent.actor.spellcastingClasses[this.classIdentifier];
      const sourceSubclass = sourceClass?.subclass;
      if ( sourceClass ) sourceClass.system.spellcasting.preparation.value++;
      if ( sourceSubclass ) sourceSubclass.system.spellcasting.preparation.value++;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getCardData(enrichmentOptions={}) {
    const context = await super.getCardData(enrichmentOptions);
    context.isSpell = true;
    const { activation, chakra, duration, jutsuComponents, jutsuType, rank, range, target } = this.parent.labels;
    context.properties = [rank, jutsuType, chakra, jutsuComponents?.short, activation, duration, range, target]
      .filter(_ => _);
    if ( !this.properties.has("material") ) delete context.materials;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getFavoriteData() {
    return foundry.utils.mergeObject(await super.getFavoriteData(), {
      subtitle: [this.parent.labels.rank, this.parent.labels.jutsuType, this.parent.labels.chakra],
      modifier: this.parent.labels.modifier,
      range: this.range,
      save: this.activities.getByType("save")[0]?.save
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getSheetData(context) {
    context.source.rank ??= this.effectiveRank;
    context.source.jutsu ??= foundry.utils.deepClone(this.jutsu);
    context.source.chakra ??= foundry.utils.deepClone(this.chakra);
    context.source.chakra.scaling ??= foundry.utils.deepClone(this.chakra.scaling);
    context.properties.active = [
      ...(this.parent.labels?.jutsuComponents?.all ?? []).map(c => c.label),
      ...(this.parent.labels?.jutsuKeywords?.all ?? []).map(k => k.label),
      ...(context.labels.classes ?? [])
    ];
    context.subtitles = [
      { label: context.labels.rank },
      { label: context.labels.jutsuType },
      { label: context.labels.chakra }
    ];

    context.parts = ["dnd5e.details-spell", "dnd5e.field-uses"];
    context.sourceItemLocked = false;

    // Default Ability & Spellcasting Classes
    if ( this.parent.actor ) {
      // Get spell source item.
      const sourceItem = this.sourceItem
        ? this.parent.actor.identifiedItems.get(this.sourceItem)?.first()
        : null;

      const jutsuCasting = this.jutsuCastingType;
      const casting = this.parent.actor.system.attributes?.jutsu?.[jutsuCasting];
      const ability = CONFIG.DND5E.abilities[
        casting?.ability
          ?? this.parent.actor.spellcastingClasses[this.classIdentifier]?.spellcasting.ability
          ?? this.parent.actor.system.attributes?.spellcasting
      ]?.label?.toLowerCase();
      if ( casting?.isClassmodArts ) context.defaultAbility = game.i18n.localize("N5EB.CLASSMOD.ArtsFormula");
      else if ( ability ) context.defaultAbility = game.i18n.format("DND5E.DefaultSpecific", { default: ability });
      else context.defaultAbility = game.i18n.localize("DND5E.Default");
      context.spellcastingClasses = Object.entries(this.parent.actor.spellcastingClasses ?? {})
        .map(([value, cls]) => ({ value: `class:${value}`, label: cls.name }));
      context.spellcastingClasses.push(...Object.entries(this.parent.actor.classmods ?? {})
        .map(([value, classmod]) => ({ value: `classmod:${value}`, label: classmod.name })));

      // Spells granted by non-class/classmod Items are locked.
      if ( !["class", "classmod"].includes(sourceItem?.type) ) {
        let grantingItem = sourceItem;

        // Fallback to detecting from flags.
        if ( !grantingItem ) {
          // Check for advancement-granted spells.
          const advancementOrigin = this.parent.getFlag("n5eb", "advancementOrigin");
          if ( advancementOrigin ) {
            const [itemId] = advancementOrigin.split(".");
            grantingItem = this.parent.actor.items.get(itemId);
          }

          // Check for item-granted spells.
          grantingItem ??= this.linkedActivity?.item;
        }

        if ( grantingItem ) {
          context.spellcastingClasses.push({
            value: `${grantingItem.type}:${grantingItem.identifier}`,
            label: grantingItem.name
          });

          if ( !this.sourceItem ) context.source.sourceItem = `${grantingItem.type}:${grantingItem.identifier}`;

          if ( !["class", "classmod"].includes(grantingItem.type) ) {
            context.sourceItemLocked = true;
            context.sourceItemHint = "DND5E.SourceItem.LockedHint";
          }
        }
      }
    }

    // Activation
    context.activationTypes = [
      ...Object.entries(CONFIG.DND5E.activityActivationTypes).map(([value, { label, group }]) => {
        return { value, label, group };
      }),
      { value: "", label: "DND5E.NoneActionLabel" }
    ];

    // Duration
    context.durationUnits = [
      ...Object.entries(CONFIG.DND5E.specialTimePeriods).map(([value, label]) => ({ value, label })),
      ...Object.entries(CONFIG.DND5E.scalarTimePeriods).map(([value, label]) => {
        return { value, label, group: "DND5E.DurationTime" };
      }),
      ...Object.entries(CONFIG.DND5E.permanentTimePeriods).map(([value, label]) => {
        return { value, label, group: "DND5E.DurationPermanent" };
      })
    ];

    // Targets
    context.targetTypes = [
      ...Object.entries(CONFIG.DND5E.individualTargetTypes).map(([value, { label }]) => {
        return { value, label, group: "DND5E.TargetTypeIndividual" };
      }),
      ...Object.entries(CONFIG.DND5E.areaTargetTypes).map(([value, { label }]) => {
        return { value, label, group: "DND5E.TargetTypeArea" };
      })
    ];
    context.scalarTarget = this.target.affects.type
      && (CONFIG.DND5E.individualTargetTypes[this.target.affects.type]?.scalar !== false);
    context.affectsPlaceholder = game.i18n.localize(`DND5E.TARGET.Count.${
      this.target?.template?.type ? "Every" : "Any"}`);
    context.dimensions = this.target.template.dimensions;
    // TODO: Ensure this behaves properly with enchantments, will probably need source target data

    // Range
    context.rangeTypes = [
      ...Object.entries(CONFIG.DND5E.rangeTypes).map(([value, label]) => ({ value, label })),
      ...Object.entries(CONFIG.DND5E.movementUnits).map(([value, { label }]) => {
        return { value, label, group: "DND5E.RangeDistance" };
      })
    ];

    // Spellcasting
    context.canPrepare = this.canPrepare;
    context.jutsuRankOptions = CONFIG.DND5E.jutsuRankOrder.map(rank => ({
      value: rank,
      label: CONFIG.DND5E.jutsuRanks[rank].label
    }));
    context.jutsuChakraScalingModeOptions = Object.entries(CONFIG.DND5E.jutsuChakraScalingModes)
      .map(([value, label]) => ({ value, label }));
    context.jutsuTypeOptions = Object.entries(CONFIG.DND5E.jutsuTypes).map(([value, { label }]) => ({ value, label }));
    context.jutsuComponentOptions = Object.entries(CONFIG.DND5E.jutsuComponents).map(([value, { label }]) => ({
      value, label, selected: this.jutsu.components.has(value)
    }));
    const genjutsuStimuli = new Set(["visual", "auditory", "inhaled", "tactile", "unaware"]);
    const keywordOptions = Object.entries(CONFIG.DND5E.jutsuKeywords).map(([value, { label }]) => ({
      value, label, selected: this.jutsu.keywords.has(value)
    }));
    context.jutsuKeywordOptions = keywordOptions.filter(option => !genjutsuStimuli.has(option.value));
    context.genjutsuStimulusOptions = keywordOptions.filter(option => genjutsuStimuli.has(option.value));
    const stimuliExpandId = "system.jutsu.keywords.genjutsuStimuli";
    const hasStimulus = context.genjutsuStimulusOptions.some(option => option.selected);
    const storedStimuliExpanded = context.expanded?.[stimuliExpandId];
    context.genjutsuStimuli = {
      expandId: stimuliExpandId,
      selectedCount: context.genjutsuStimulusOptions.filter(option => option.selected).length,
      expanded: (this.jutsu.type === "genjutsu") || hasStimulus || (storedStimuliExpanded === true)
    };
    context.spellcastingMethods = Object.values(CONFIG.DND5E.spellcasting).map(({ key, label }) => {
      return { label, value: key };
    });
    if ( this.method && !(this.method in CONFIG.DND5E.spellcasting) ) {
      context.spellcastingMethods.push({ label: this.method, value: this.method });
    }
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  static onDropCreate(event, actor, itemData) {
    if ( !actor?.system.isCreature ) return;

    // Determine the section it is dropped on, if any.
    let header = event.target.closest(".items-header"); // Dropped directly on the header.
    if ( !header ) {
      const list = event.target.closest(".item-list"); // Dropped inside an existing list.
      header = list?.previousElementSibling;
    }
    const { method, rank } = header?.closest("[data-rank], [data-level]")?.dataset ?? {};

    // Determine the actor's spell slot progressions, if any.
    const spellcastKeys = Object.keys(CONFIG.DND5E.spellcasting);
    const progs = Object.values(actor.classes).reduce((acc, cls) => {
      const type = cls.spellcasting?.type;
      if ( spellcastKeys.includes(type) ) acc.add(type);
      return acc;
    }, new Set());

    const { system } = itemData;
    if ( rank in CONFIG.DND5E.jutsuRanks ) {
      system.rank = rank;
      system.level = SpellData.levelForRank(rank);
    }
    const methods = CONFIG.DND5E.spellcasting;
    if ( methods[method] ) system.method = method;
    else if ( progs.size ) system.method = progs.first();
    else if ( actor.system.attributes.spell?.level ) system.method = "spell";
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  getRollData(...options) {
    const data = super.getRollData(...options);
    data.item.level = data.item.level + (this.parent.getFlag("n5eb", "scaling")
      ?? (this.level !== 0 ? this.scalingIncrease : 0));
    data.item.rank = CONFIG.DND5E.jutsuRankBySpellLevel[Math.clamp(data.item.level, 0, 9)] ?? this.effectiveRank;
    data.item.rankDelta = this.getRankDelta(data.item.rank);
    data.item.rankValue = CONFIG.DND5E.jutsuRankValues[data.item.rank] ?? 0;
    data.item.chakraCost = this.getChakraCost({ rank: data.item.rank });
    data.item.maintainCost = this.getMaintainCost({ rank: data.item.rank, cost: data.item.chakraCost });
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  async toEmbed(config, options={}) {
    const description = await super.toEmbed(config, options);
    config.details ??= config.values.includes("details");
    if ( !config.details ) return description;

    const details = document.createElement("div");
    details.classList.add("item-entry-details");
    const labels = this.parent.labels;
    const rulesVersion = getRulesVersion(config, { ...options, relativeTo: this.parent });

    const tag = document.createElement("p");
    tag.classList.add("item-entry-tag");
    const classes = labels.classes;
    tag.innerText = [labels.rank, labels.jutsuType].filterJoin(" ");
    if ( (rulesVersion === "2024") && classes?.length ) {
      tag.innerText = game.i18n.format("DND5E.SPELL.Embed.Tag.Classes", {
        classes: game.i18n.getListFormatter({ type: "unit" }).format(classes),
        levelSchool: tag.innerText
      });
    }
    details.append(tag);

    let castingTime = rulesVersion === "2014" ? labels.legacyActivation : labels.ritualActivation;
    if ( (this.activation.type === "reaction") && this.activation.condition ) castingTime = game.i18n.format(
      "DND5E.SPELL.Embed.CastingTimeTrigger", { castingTime, trigger: this.activation.condition }
    );
    const specifics = [
      ["DND5E.SpellCastTime", castingTime],
      ["DND5E.SpellHeader.Range", labels.description.range || labels.range],
      ["N5EB.JUTSU.Components", labels.jutsuComponents.full],
      ["N5EB.JUTSU.Chakra", labels.chakra],
      ["DND5E.Duration", labels.concentrationDuration]
    ];
    const dl = document.createElement("dl");
    dl.classList.add("item-entry-specifics");
    for ( const [label, description] of specifics ) {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      dt.innerText = game.i18n.localize(label);
      const dd = document.createElement("dd");
      dd.innerText = description;
      div.append(dt, dd);
      dl.append(div);
    }
    details.append(dl);

    const template = document.createElement("template");
    template.append(details, ...description);

    /**
     * A hook event that fires after an embedded spell with details is rendered.
     * @function dnd5e.renderEmbeddedSpell
     * @memberof hookEvents
     * @param {Item5e} item                     Spell being embedded.
     * @param {HTMLTemplateElement} template    Template whose children will be embedded.
     * @param {DocumentHTMLEmbedConfig} config  Configuration for embedding behavior.
     * @param {EnrichmentOptions} options       Original enrichment options.
     */
    Hooks.call("dnd5e.renderEmbeddedSpell", this.parent, template, config, options);

    return template.children;
  }

  /* -------------------------------------------- */
  /*  Socket Event Handlers                       */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    if ( !this.parent.isEmbedded ) return;
    const system = data.system ?? {};

    // Set as prepared for NPCs, and not prepared for PCs
    if ( this.parent.actor?.system.isCreature && !("prepared" in system) ) {
      this.updateSource({ prepared: Number(this.parent.actor.system.isNPC || (this.level < 1)) });
    }

    if ( ["atwill", "innate"].includes(system.method) || this.sourceItem ) return;
    const classes = new Set(Object.keys(this.parent.actor.spellcastingClasses));
    if ( !classes.size ) return;

    // Set the source class, and ensure the preparation mode matches if adding a prepared spell to an alt class
    const setClass = cls => {
      this.updateSource({ sourceItem: `class:${cls}`, method: this.parent.actor.classes[cls].spellcasting.type });
    };

    // If preparation mode matches an alt spellcasting type and matching class exists, set as that class
    if ( (system.method !== "spell") && (system.method in CONFIG.DND5E.spellcasting) ) {
      const altClasses = classes.filter(i => this.parent.actor.classes[i].spellcasting.type === system.method);
      if ( altClasses.size === 1 ) setClass(altClasses.first());
      return;
    }

    // If only a single spellcasting class is present, use that
    if ( classes.size === 1 ) {
      setClass(classes.first());
      return;
    }

    // Create intersection of spellcasting classes and classes that offer the spell
    const spellClasses = new Set(
      dnd5e.registry.spellLists.forSpell(this.parent._stats.compendiumSource).map(l => l.metadata.identifier)
    );
    const intersection = classes.intersection(spellClasses);
    if ( intersection.size === 1 ) setClass(intersection.first());
  }
}
