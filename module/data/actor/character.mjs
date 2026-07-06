import ChakraDice from "../../documents/actor/chakra-dice.mjs";
import HitDice from "../../documents/actor/hit-dice.mjs";
import Proficiency from "../../documents/actor/proficiency.mjs";
import { defaultUnits, simplifyBonus } from "../../utils.mjs";
import FormulaField from "../fields/formula-field.mjs";
import LocalDocumentField from "../fields/local-document-field.mjs";
import CreatureTypeField from "../shared/creature-type-field.mjs";
import RollConfigField from "../shared/roll-config-field.mjs";
import SensesField from "../shared/senses-field.mjs";
import SimpleTraitField from "./fields/simple-trait-field.mjs";
import AttributesFields from "./templates/attributes.mjs";
import CreatureTemplate from "./templates/creature.mjs";
import DetailsFields from "./templates/details.mjs";
import TraitsFields from "./templates/traits.mjs";

const {
  ArrayField, BooleanField, HTMLField, IntegerSortField, NumberField, SchemaField, SetField, StringField
} = foundry.data.fields;
const MAX_WILL_OF_FIRE = 3;

/**
 * @import { ActorFavorites5e, CharacterActorSystemData, ResourceData } from "./_types.mjs";
 */

/**
 * System data definition for Characters.
 * @extends {CreatureTemplate<CharacterActorSystemData>}
 * @mixes CharacterActorSystemData
 */
export default class CharacterData extends CreatureTemplate {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DND5E.BONUSES"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    supportsAdvancement: true
  }, { inplace: false }));

  /* -------------------------------------------- */

  /** @inheritDoc */
  static _systemType = "character";

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      attributes: new SchemaField({
        ...AttributesFields.common,
        ...AttributesFields.creature,
        hp: new SchemaField({
          ...AttributesFields.hitPoints,
          max: new NumberField({
            nullable: true, integer: true, min: 0, initial: null, label: "DND5E.HitPointsOverride",
            hint: "DND5E.HitPointsOverrideHint"
          }),
          bonuses: new SchemaField({
            level: new FormulaField({ deterministic: true, label: "DND5E.HitPointsBonusLevel" }),
            overall: new FormulaField({ deterministic: true, label: "DND5E.HitPointsBonusOverall" })
          })
        }, { label: "DND5E.HitPoints" }),
        chakra: new SchemaField({
          ...AttributesFields.chakraPoints,
          max: new NumberField({
            nullable: true, integer: true, min: 0, initial: null, label: "N5EB.ChakraOverride",
            hint: "N5EB.ChakraOverrideHint"
          }),
          bonuses: new SchemaField({
            level: new FormulaField({ deterministic: true, label: "N5EB.ChakraBonusLevel" }),
            overall: new FormulaField({ deterministic: true, label: "N5EB.ChakraBonusOverall" })
          })
        }, { label: "N5EB.Chakra" }),
        death: new RollConfigField({
          ability: false,
          success: new NumberField({
            required: true, nullable: false, integer: true, min: 0, initial: 0, label: "DND5E.DeathSaveSuccesses"
          }),
          failure: new NumberField({
            required: true, nullable: false, integer: true, min: 0, initial: 0, label: "DND5E.DeathSaveFailures"
          }),
          bonuses: new SchemaField({
            save: new FormulaField({ required: true, label: "DND5E.DeathSaveBonus" })
          })
        }, { label: "DND5E.DeathSave" }),
        inspiration: new NumberField({
          required: true, nullable: false, integer: true, min: 0, max: MAX_WILL_OF_FIRE, initial: 0,
          label: "N5EB.WillOfFire.Label"
        })
      }, { label: "DND5E.Attributes" }),
      bastion: new SchemaField({
        name: new StringField({ required: true }),
        description: new HTMLField()
      }),
      details: new SchemaField({
        ...DetailsFields.common,
        ...DetailsFields.creature,
        background: new LocalDocumentField(foundry.documents.BaseItem, {
          required: true, fallback: true, label: "DND5E.Background"
        }),
        originalClass: new StringField({ required: true, label: "DND5E.ClassOriginal" }),
        xp: new SchemaField({
          value: new NumberField({
            required: true, nullable: false, integer: true, min: 0, initial: 0, label: "DND5E.ExperiencePoints.Current"
          })
        }, { label: "DND5E.ExperiencePoints.Label" }),
        appearance: new StringField({ required: true, label: "DND5E.Appearance" }),
        trait: new StringField({ required: true, label: "DND5E.PersonalityTraits" }),
        gender: new StringField({ label: "DND5E.Gender" }),
        eyes: new StringField({ label: "DND5E.Eyes" }),
        height: new StringField({ label: "DND5E.Height" }),
        faith: new StringField({ label: "DND5E.Faith" }),
        hair: new StringField({ label: "DND5E.Hair" }),
        skin: new StringField({ label: "DND5E.Skin" }),
        age: new StringField({ label: "DND5E.Age" }),
        weight: new StringField({ label: "DND5E.Weight" })
      }, { label: "DND5E.Details" }),
      traits: new SchemaField({
        ...TraitsFields.common,
        ...TraitsFields.creature,
        affinity: new SimpleTraitField({}, { label: "N5EB.Affinity.Label" }),
        weaponProf: new SimpleTraitField({
          mastery: new SchemaField({
            value: new SetField(new StringField()),
            bonus: new SetField(new StringField())
          })
        }, { label: "DND5E.TraitWeaponProf" }),
        armorProf: new SimpleTraitField({}, { label: "DND5E.TraitArmorProf" })
      }, { label: "DND5E.Traits" }),
      resources: new SchemaField({
        primary: makeResourceField({ label: "DND5E.ResourcePrimary" }),
        secondary: makeResourceField({ label: "DND5E.ResourceSecondary" }),
        tertiary: makeResourceField({ label: "DND5E.ResourceTertiary" })
      }, { label: "DND5E.Resources" }),
      downtime: makeDowntimeField({ label: "N5EB.DOWNTIME.Label" }),
      favorites: new ArrayField(new SchemaField({
        type: new StringField({ required: true, blank: false }),
        id: new StringField({ required: true, blank: false }),
        sort: new IntegerSortField()
      }), { label: "DND5E.Favorites" })
    });
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Whether this Actor type represents a player character.
   * @returns {boolean}
   */
  get isCharacter() {
    return true;
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    CharacterData.#migrateWillOfFire(source);
    AttributesFields._migrateInitiative(source.attributes);
    migrateDowntime(source);
  }

  /* -------------------------------------------- */

  /**
   * Migrate legacy inspiration booleans to the Will of Fire point pool.
   * @param {object} source  Source system data being migrated.
   */
  static #migrateWillOfFire(source) {
    source.attributes ??= {};
    const value = source.attributes.inspiration;
    if ( value === true ) {
      source.attributes.inspiration = 1;
      return;
    }

    if ( (value === false) || (value === undefined) || (value === null) || !Number.isNumeric(value) ) {
      source.attributes.inspiration = 0;
      return;
    }

    source.attributes.inspiration = Math.clamp(Math.floor(Number(value)), 0, MAX_WILL_OF_FIRE);
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    this.attributes.hd = new HitDice(this.parent);
    this.attributes.cd = new ChakraDice(this.parent);
    this.details.level = 0;
    this.attributes.attunement.value = 0;

    for ( const item of this.parent.items ) {
      if ( item.type === "class" ) this.details.level += item.system.levels;
    }

    // Character proficiency bonus
    this.attributes.prof = Proficiency.calculateMod(this.details.level);

    // Experience required for next level
    const { xp, level } = this.details;
    xp.max = level >= CONFIG.DND5E.maxLevel ? Infinity : this.parent.getLevelExp(level || 1);
    xp.min = level ? this.parent.getLevelExp(level - 1) : 0;
    if ( Number.isFinite(xp.max) ) {
      const required = xp.max - xp.min;
      const pct = Math.round((xp.value - xp.min) * 100 / required);
      xp.pct = Math.clamp(pct, 0, 100);
    } else if ( game.settings.get("n5eb", "levelingMode") === "xpBoons" ) {
      const overflow = xp.value - this.parent.getLevelExp(CONFIG.DND5E.maxLevel);
      xp.boonsEarned = Math.max(0, Math.floor(overflow / CONFIG.DND5E.epicBoonInterval));
      const progress = overflow - (CONFIG.DND5E.epicBoonInterval * xp.boonsEarned);
      xp.pct = Math.clamp(Math.round((progress / CONFIG.DND5E.epicBoonInterval) * 100), 0, 100);
    } else {
      xp.pct = 100;
    }

    AttributesFields.prepareBaseArmorClass.call(this);
    AttributesFields.prepareBaseEncumbrance.call(this);
    SensesField._shim(this.attributes.senses);
  }

  /* -------------------------------------------- */

  /**
   * Prepare movement & senses values derived from race item.
   */
  prepareEmbeddedData() {
    super.prepareEmbeddedData();
    if ( this.details.race instanceof Item ) {
      AttributesFields.prepareRace.call(this, this.details.race);
      this.details.type = this.details.race.system.type;
    } else {
      this.details.type = new CreatureTypeField({ swarm: false }).initialize({ value: "humanoid" }, this);
    }
    for ( const key of Object.keys(CONFIG.DND5E.movementTypes) ) this.attributes.movement[key] ??= 0;
    for ( const key of Object.keys(CONFIG.DND5E.senses) ) this.attributes.senses.ranges[key] ??= 0;
    this.attributes.movement.units ??= defaultUnits("length");
    this.attributes.senses.units ??= defaultUnits("length");
  }

  /* -------------------------------------------- */

  /**
   * Prepare remaining character data.
   */
  prepareDerivedData() {
    const rollData = this.parent.getRollData({ deterministic: true });
    const { originalSaves, originalSkills } = this.parent.getOriginalStats();

    this.details.tier = Math.ceil((this.details.level - 4) / 6) + 1;

    AttributesFields.prepareExhaustionLevel.call(this);
    this.prepareAbilities({ rollData, originalSaves });
    this.prepareSkills({ rollData, originalSkills });
    this.prepareTools({ rollData });
    AttributesFields.prepareArmorClass.call(this, rollData);
    AttributesFields.prepareConcentration.call(this, rollData);
    AttributesFields.prepareEncumbrance.call(this, rollData);
    AttributesFields.prepareInitiative.call(this, rollData);
    AttributesFields.prepareMovement.call(this, rollData);
    AttributesFields.prepareSpellcastingAbility.call(this);
    AttributesFields.prepareJutsuCasting.call(this, rollData);
    TraitsFields.prepareLanguages.call(this);
    TraitsFields.prepareResistImmune.call(this);

    // Hit Points
    const hpOptions = {};
    if ( this.attributes.hp.max === null ) {
      hpOptions.advancement = Object.values(this.parent.classes)
        .map(c => c.advancement.byType.HitPoints?.[0]).filter(a => a);
      hpOptions.bonus = (simplifyBonus(this.attributes.hp.bonuses.level, rollData) * this.details.level)
        + simplifyBonus(this.attributes.hp.bonuses.overall, rollData);
      hpOptions.mod = this.abilities[CONFIG.DND5E.defaultAbilities.hitPoints ?? "con"]?.mod ?? 0;
    }
    AttributesFields.prepareHitPoints.call(this, this.attributes.hp, hpOptions);

    // Chakra
    const chakraOptions = {};
    if ( this.attributes.chakra.max === null ) {
      chakraOptions.advancement = Object.values(this.parent.classes)
        .map(c => c.advancement.byType.Chakra?.[0]).filter(a => a);
      chakraOptions.bonus = (simplifyBonus(this.attributes.chakra.bonuses.level, rollData) * this.details.level)
        + simplifyBonus(this.attributes.chakra.bonuses.overall, rollData);
      chakraOptions.mod = this.abilities[CONFIG.DND5E.defaultAbilities.chakraPoints ?? "con"]?.mod ?? 0;
    }
    AttributesFields.prepareChakraPoints.call(this, this.attributes.chakra, chakraOptions);
  }

  /* -------------------------------------------- */
  /*  Socket Event Handlers                       */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    await TraitsFields.preCreateSize.call(this, data, options, user);

    if ( this.parent._stats?.compendiumSource?.startsWith("Compendium.") ) return;
    this.parent.updateSource({
      prototypeToken: {
        actorLink: true,
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        sight: { enabled: true }
      }
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changes, options, user) {
    if ( (await super._preUpdate(changes, options, user)) === false ) return false;
    await AttributesFields.preUpdateHP.call(this, changes, options, user);
    await TraitsFields.preUpdateSize.call(this, changes, options, user);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    AttributesFields.onUpdateHP.call(this, changed, options, userId);
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Level used to determine cantrip scaling.
   * @param {Item5e} spell  Spell for which to fetch the cantrip level.
   * @returns {number}
   */
  cantripLevel(spell) {
    return this.details.level;
  }

  /* -------------------------------------------- */

  /**
   * Checks whether the item with the given relative UUID has been favorited
   * @param {string} favoriteId  The relative UUID of the item to check.
   * @returns {boolean}
   */
  hasFavorite(favoriteId) {
    return !!this.favorites.find(f => f.id === favoriteId);
  }

  /* -------------------------------------------- */

  /**
   * Add a favorite item to this actor.
   * If the given item is already favorite, this method has no effect.
   * @param {ActorFavorites5e} favorite  The favorite to add.
   * @returns {Promise<Actor5e>}
   * @throws If the item intended to be favorited does not belong to this actor.
   */
  addFavorite(favorite) {
    if ( this.hasFavorite(favorite.id) ) return Promise.resolve(this.parent);

    if ( favorite.id.startsWith(".") && fromUuidSync(favorite.id, { relative: this.parent }) === null ) {
      // Assume that an ID starting with a "." is a relative ID.
      throw new Error(`The item with id ${favorite.id} is not owned by actor ${this.parent.id}`);
    }

    let maxSort = 0;
    const favorites = this.favorites.map(f => {
      if ( f.sort > maxSort ) maxSort = f.sort;
      return { ...f };
    });
    favorites.push({ ...favorite, sort: maxSort + CONST.SORT_INTEGER_DENSITY });
    return this.parent.update({ "system.favorites": favorites });
  }

  /* -------------------------------------------- */

  /**
   * Removes the favorite with the given relative UUID or resource ID
   * @param {string} favoriteId  The relative UUID or resource ID of the favorite to remove.
   * @returns {Promise<Actor5e>}
   */
  removeFavorite(favoriteId) {
    if ( favoriteId.startsWith("resources.") ) return this.parent.update({ [`system.${favoriteId}.max`]: 0 });
    const favorites = this.favorites.filter(f => f.id !== favoriteId);
    return this.parent.update({ "system.favorites": favorites });
  }
}

/* -------------------------------------------- */

/**
 * Produce the schema field for a simple trait.
 * @param {object} schemaOptions  Options passed to the outer schema.
 * @returns {ResourceData}
 */
function makeResourceField(schemaOptions={}) {
  return new SchemaField({
    value: new NumberField({required: true, integer: true, initial: 0, labels: "DND5E.ResourceValue"}),
    max: new NumberField({required: true, integer: true, initial: 0, labels: "DND5E.ResourceMax"}),
    sr: new BooleanField({required: true, labels: "DND5E.REST.Short.Recovery"}),
    lr: new BooleanField({required: true, labels: "DND5E.REST.Long.Recovery"}),
    label: new StringField({required: true, labels: "DND5E.ResourceLabel"})
  }, schemaOptions);
}

/* -------------------------------------------- */

/**
 * Produce the schema field for character downtime tracking.
 * @param {object} schemaOptions  Options passed to the outer schema.
 * @returns {SchemaField}
 */
function makeDowntimeField(schemaOptions={}) {
  return new SchemaField({
    weeks: new SchemaField({
      available: new NumberField({
        required: true, nullable: false, integer: true, min: 0, initial: 0,
        label: "N5EB.DOWNTIME.WeeksAvailable"
      }),
      spent: new NumberField({
        required: true, nullable: false, integer: true, min: 0, initial: 0,
        label: "N5EB.DOWNTIME.WeeksSpent"
      }),
      source: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.WeeksSource" }),
      notes: new HTMLField({ required: true, nullable: true, label: "N5EB.DOWNTIME.Notes" })
    }, { label: "N5EB.DOWNTIME.Weeks.Label" }),
    activities: new ArrayField(new SchemaField({
      _id: new StringField({ required: true, blank: false }),
      identifier: new StringField({ required: true, initial: "" }),
      templateUuid: new StringField({ required: true, initial: "" }),
      sourceId: new StringField({ required: true, initial: "" }),
      custom: new BooleanField({ required: true, initial: false }),
      sort: new IntegerSortField(),
      name: new StringField({ required: true, blank: false, initial: "New Downtime Activity" }),
      img: new StringField({ required: true, initial: "icons/svg/clockwork.svg" }),
      category: new StringField({ required: true, blank: false, initial: "custom" }),
      status: new StringField({ required: true, blank: false, initial: "active" }),
      progress: new SchemaField({
        value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        max: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 })
      }),
      cost: new SchemaField({
        value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        denomination: new StringField({ required: true, blank: false, initial: "ryo" }),
        per: new StringField({ required: true, blank: false, initial: "activity" }),
        paid: new BooleanField({ required: true, initial: false }),
        mode: new StringField({ required: true, blank: false, initial: "fixed" }),
        due: new StringField({ required: true, blank: false, initial: "completion" }),
        fixed: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        perWeek: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        manualTotal: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        dueAmount: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        rank: new StringField({ required: true, initial: "" }),
        rankTable: new SchemaField({
          e: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          d: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          c: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          b: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          a: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          s: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
        }),
        override: new BooleanField({ required: true, initial: false }),
        reason: new StringField({ required: true, initial: "" }),
        note: new StringField({ required: true, initial: "" }),
        ledger: new ArrayField(new SchemaField({
          _id: new StringField({ required: true, blank: false }),
          type: new StringField({ required: true, blank: false, initial: "payment" }),
          amount: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          note: new StringField({ required: true, initial: "" }),
          user: new StringField({ required: true, initial: "" }),
          userName: new StringField({ required: true, initial: "" }),
          timestamp: new StringField({ required: true, initial: "" }),
          deducted: new BooleanField({ required: true, initial: false })
        }))
      }),
      roll: new SchemaField({
        enabled: new BooleanField({ required: true, initial: false }),
        ability: new StringField({ required: true, initial: "" }),
        skill: new StringField({ required: true, initial: "" }),
        tool: new StringField({ required: true, initial: "" }),
        dc: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        label: new StringField({ required: true, initial: "" })
      }),
      target: new SchemaField({
        type: new StringField({ required: true, initial: "" }),
        uuid: new StringField({ required: true, initial: "" }),
        name: new StringField({ required: true, initial: "" }),
        img: new StringField({ required: true, initial: "" })
      }),
      result: new SchemaField({
        claimed: new BooleanField({ required: true, initial: false }),
        itemUuid: new StringField({ required: true, initial: "" }),
        itemId: new StringField({ required: true, initial: "" }),
        claimedAt: new StringField({ required: true, initial: "" })
      }),
      description: new HTMLField({ required: true, nullable: true }),
      completion: new HTMLField({ required: true, nullable: true }),
      notes: new HTMLField({ required: true, nullable: true }),
      completedAt: new StringField({ required: true, initial: "" })
    }), { label: "N5EB.DOWNTIME.Activities" })
  }, schemaOptions);
}

/* -------------------------------------------- */

/**
 * Initialize character downtime data without disturbing existing entries.
 * @param {object} source  Source system data.
 */
function migrateDowntime(source) {
  source.downtime ??= {};
  source.downtime.weeks ??= {};
  source.downtime.weeks.available ??= 0;
  source.downtime.weeks.spent ??= 0;
  source.downtime.weeks.source ??= "";
  source.downtime.weeks.notes ??= "";
  if ( !Array.isArray(source.downtime.activities) ) source.downtime.activities = [];
  for ( const activity of source.downtime.activities ) {
    activity._id ||= foundry.utils.randomID();
    activity.identifier ??= "";
    activity.templateUuid ??= "";
    activity.sourceId ??= "";
    activity.custom ??= false;
    activity.name ||= "Downtime Activity";
    activity.img ||= "icons/svg/clockwork.svg";
    activity.category ||= "custom";
    activity.status ||= "active";
    activity.progress ??= {};
    activity.progress.value ??= 0;
    activity.progress.max ??= 1;
    activity.cost ??= {};
    activity.cost.value ??= 0;
    activity.cost.denomination ||= "ryo";
    activity.cost.per ||= "activity";
    activity.cost.paid ??= false;
    migrateDowntimeCost(activity);
    activity.cost.note ??= "";
    activity.roll ??= {};
    activity.roll.enabled ??= false;
    activity.roll.ability ??= "";
    activity.roll.skill ??= "";
    activity.roll.tool ??= "";
    activity.roll.dc ??= 0;
    activity.roll.label ??= "";
    activity.target ??= {};
    activity.target.type ??= "";
    activity.target.uuid ??= "";
    activity.target.name ??= "";
    activity.target.img ??= "";
    activity.result ??= {};
    activity.result.claimed ??= false;
    activity.result.itemUuid ??= "";
    activity.result.itemId ??= "";
    activity.result.claimedAt ??= "";
    activity.description ??= "";
    activity.completion ??= "";
    activity.notes ??= "";
    activity.completedAt ??= "";
  }
}

/* -------------------------------------------- */

/**
 * Initialize structured downtime cost data and migrate old paid flags into a ledger entry.
 * @param {object} activity  Downtime activity source.
 */
function migrateDowntimeCost(activity) {
  const cost = activity.cost;
  const legacyMode = cost.per === "week" ? "per-week" : (cost.value ? "fixed" : "none");
  cost.mode ||= legacyMode;
  cost.due ||= cost.mode === "per-week" ? "weekly" : (cost.mode === "none" ? "manual" : "completion");
  cost.fixed ??= cost.per === "activity" ? Number(cost.value ?? 0) : 0;
  cost.perWeek ??= cost.per === "week" ? Number(cost.value ?? 0) : 0;
  cost.manualTotal ??= 0;
  cost.dueAmount ??= 0;
  cost.rank ??= "";
  cost.rankTable ??= {};
  for ( const rank of ["e", "d", "c", "b", "a", "s"] ) cost.rankTable[rank] ??= 0;
  cost.override ??= false;
  cost.reason ??= "";
  cost.note ??= "";
  cost.ledger = Array.isArray(cost.ledger) ? cost.ledger : [];
  for ( const entry of cost.ledger ) migrateDowntimeLedgerEntry(entry);

  if ( cost.paid && !cost.ledger.length ) {
    const amount = getLegacyDowntimeDue(activity);
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
 * Initialize a downtime payment ledger entry.
 * @param {object} entry  Ledger entry source.
 */
function migrateDowntimeLedgerEntry(entry) {
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
 */
function getLegacyDowntimeDue(activity) {
  const cost = activity.cost ?? {};
  const progress = activity.progress ?? {};
  const value = Math.max(0, Number(cost.value ?? 0));
  if ( !value ) return 0;
  if ( cost.per === "week" ) return value * Math.max(0, Number(progress.value ?? 0));
  return value;
}
