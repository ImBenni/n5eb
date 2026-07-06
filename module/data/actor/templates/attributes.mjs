import ActiveEffect5e from "../../../documents/active-effect.mjs";
import Proficiency from "../../../documents/actor/proficiency.mjs";
import {
  getClassmodArtsCastingKey, getClassmodArtsColor, getClassmodArtsLabel, isClassmodArtsCastingKey
} from "../../../classmod-arts.mjs";
import * as Seals from "../../../seals.mjs";
import {
  convertLength, defaultUnits, formatIdentifier, getJutsuProgressionFromDescription, replaceFormulaData, simplifyBonus
} from "../../../utils.mjs";
import AdvantageModeField from "../../fields/advantage-mode-field.mjs";
import FormulaField from "../../fields/formula-field.mjs";
import MovementField from "../../shared/movement-field.mjs";
import RollConfigField from "../../shared/roll-config-field.mjs";
import SensesField from "../../shared/senses-field.mjs";

const { NumberField, SchemaField, StringField } = foundry.data.fields;
const JUTSU_KNOWN_SCALE_ID = "jutsu-known";
const JUTSU_KNOWN_SCALE_ALIASES = new Set([
  JUTSU_KNOWN_SCALE_ID,
  "jutsus-known",
  "spells-known"
]);
const JUTSU_MAX_RANK_SCALE_ID = "jutsu-max-rank";
const JUTSU_MAX_RANK_SCALE_ALIASES = new Set([
  JUTSU_MAX_RANK_SCALE_ID,
  "highest-rank-jutsu-known",
  "max-rank",
  "highest-rank-known"
]);

/**
 * @import { ActorRollData } from "../../../documents/_types.mjs";
 * @import {
 *   ArmorClassData, AttributesCommonData, AttributesCreatureData, ChakraPointsData, HitPointsData
 * } from "./_types.mjs";
 */

/**
 * Shared contents of the attributes schema between various actor types.
 */
export default class AttributesFields {
  /**
   * Armor class fields shared between characters, NPCs, and vehicles.
   * @type {ArmorClassData}
   */
  static get armorClass() {
    return {
      calc: new StringField({ initial: "default", label: "DND5E.ArmorClassCalculation" }),
      flat: new NumberField({ required: true, integer: true, min: 0, label: "DND5E.ArmorClassFlat" }),
      formula: new FormulaField({ deterministic: true, label: "DND5E.ArmorClassFormula" })
    };
  }

  /* -------------------------------------------- */
  /**
   * Hit points fields shared between NPCs, objects, and vehicles.
   * @type {HitPointsData}
   */
  static get hitPoints() {
    return {
      dt: new NumberField({ integer: true, min: 0, label: "DND5E.DamageThreshold" }),
      max: new NumberField({ nullable: true, integer: true, min: 0, initial: null, label: "DND5E.HitPointsMax" }),
      temp: new NumberField({ integer: true, initial: 0, min: 0, label: "DND5E.HitPointsTemp" }),
      tempmax: new NumberField({
        integer: true, initial: 0, label: "DND5E.HitPointsTempMax", hint: "DND5E.HitPointsTempMaxHint"
      }),
      value: new NumberField({ nullable: true, integer: true, min: 0, initial: null, label: "DND5E.HitPointsCurrent" })
    };
  }

  /* -------------------------------------------- */

  /**
   * Chakra point fields shared between characters and NPCs.
   * @type {ChakraPointsData}
   */
  static get chakraPoints() {
    return {
      max: new NumberField({ nullable: true, integer: true, min: 0, initial: null, label: "N5EB.ChakraMax" }),
      temp: new NumberField({ integer: true, initial: 0, min: 0, label: "N5EB.ChakraTemp" }),
      tempmax: new NumberField({ integer: true, initial: 0,
        label: "N5EB.ChakraTempMax", hint: "N5EB.ChakraTempMaxHint" }),
      formula: new FormulaField({ required: true, label: "N5EB.ChakraFormula" }),
      value: new NumberField({ nullable: true, integer: true, min: 0, initial: null, label: "N5EB.ChakraCurrent" })
    };
  }

  /* -------------------------------------------- */

  /**
   * Jutsu casting fields for a creature.
   * @param {string} ability  Default ability.
   * @returns {object}
   */
  static jutsuCasting(ability) {
    return {
      ability: new StringField({ required: true, blank: false, initial: ability, label: "N5EB.JUTSU.CastingAbility" }),
      bonuses: new SchemaField({
        attack: new FormulaField({ deterministic: true, required: true, label: "N5EB.JUTSU.AttackBonus" }),
        dc: new FormulaField({ deterministic: true, required: true, label: "N5EB.JUTSU.DCBonus" })
      }, { label: "DND5E.Bonuses" })
    };
  }

  /* -------------------------------------------- */

  /**
   * Fields shared between characters, NPCs, and vehicles.
   * @type {AttributesCommonData}
   */
  static get common() {
    return {
      ac: new SchemaField(this.armorClass, { label: "DND5E.ArmorClass" }),
      init: new RollConfigField({
        ability: "",
        bonus: new FormulaField({ required: true, label: "DND5E.InitiativeBonus" })
      }, { label: "DND5E.Initiative" }),
      movement: new MovementField()
    };
  }

  /* -------------------------------------------- */

  /**
   * Fields shared between characters and NPCs.
   * @type {AttributesCreatureData}
   */
  static get creature() {
    return {
      attunement: new SchemaField({
        max: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 3, label: "DND5E.AttunementMax"
        })
      }, { label: "DND5E.Attunement" }),
      senses: new SensesField(),
      spellcasting: new StringField({ required: true, blank: true, label: "DND5E.SpellAbility" }),
      jutsu: new SchemaField({
        ninjutsu: new SchemaField(this.jutsuCasting("int"), { label: "N5EB.JUTSU.Type.Ninjutsu" }),
        taijutsu: new SchemaField(this.jutsuCasting("str"), { label: "N5EB.JUTSU.Type.Taijutsu" }),
        genjutsu: new SchemaField(this.jutsuCasting("wis"), { label: "N5EB.JUTSU.Type.Genjutsu" }),
        known: new SchemaField({
          value: new NumberField({ integer: true, min: 0, initial: 0, label: "N5EB.JUTSU.Known" }),
          max: new NumberField({ integer: true, min: 0, initial: 0, label: "N5EB.JUTSU.KnownMax" }),
          maxRank: new StringField({ required: true, blank: true, initial: "", label: "N5EB.JUTSU.MaxRank" })
        }, { label: "N5EB.JUTSU.Known" })
      }, { label: "N5EB.JUTSU.Casting" }),
      exhaustion: new NumberField({
        required: true, nullable: false, integer: true, min: 0, initial: 0, label: "DND5E.Exhaustion"
      }),
      concentration: new RollConfigField({
        ability: "",
        bonuses: new SchemaField({
          save: new FormulaField({ required: true, label: "DND5E.ConcentrationBonus" })
        }),
        limit: new NumberField({ integer: true, min: 0, initial: 2, label: "DND5E.ConcentrationLimit" })
      }, { label: "DND5E.Concentration" }),
      loyalty: new SchemaField({
        value: new NumberField({ integer: true, min: 0, max: 20, label: "DND5E.Loyalty" })
      })
    };
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /**
   * Migrate the old init.value and incorporate it into init.bonus.
   * @param {object} source  The source attributes object.
   * @internal
   */
  static _migrateInitiative(source) {
    const init = source?.init;
    if ( !init?.value || (typeof init?.bonus === "string") ) return;
    if ( init.bonus ) init.bonus += init.value < 0 ? ` - ${init.value * -1}` : ` + ${init.value}`;
    else init.bonus = `${init.value}`;
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /**
   * Initialize derived AC fields for Active Effects to target.
   * @this {CharacterData|NPCData|VehicleData}
   */
  static prepareBaseArmorClass() {
    const ac = this.attributes.ac;
    ac.armor = 10;
    ac.shield = ac.cover = 0;
    ac.min = ac.bonus = "";
    delete ac.n5eb;
    delete ac.equippedArmor;
    delete ac.equippedShield;
  }

  /* -------------------------------------------- */

  /**
   * Initialize base encumbrance fields to be targeted by active effects.
   * @this {CharacterData|NPCData|VehicleData}
   */
  static prepareBaseEncumbrance() {
    const encumbrance = this.attributes.encumbrance ??= {};
    encumbrance.multipliers = { encumbered: "1", heavilyEncumbered: "1", maximum: "1", overall: "1" };
    encumbrance.bonuses = { encumbered: "", heavilyEncumbered: "", maximum: "", overall: "" };
  }

  /* -------------------------------------------- */

  /**
   * Prepare a character's AC value from their equipped armor and shield.
   * @this {CharacterData|NPCData|VehicleData}
   * @param {ActorRollData} rollData  The Actor's roll data.
   */
  static prepareArmorClass(rollData) {
    const ac = this.attributes.ac;

    // Apply automatic migrations for older data structures
    let cfg = CONFIG.DND5E.armorClasses[ac.calc];
    if ( !cfg ) {
      ac.calc = "flat";
      if ( Number.isNumeric(ac.value) ) ac.flat = Number(ac.value);
      cfg = CONFIG.DND5E.armorClasses.flat;
    }

    // Identify Equipped Items
    const { armors, shields } = this.parent.itemTypes.equipment.reduce((obj, equip) => {
      if ( !equip.system.equipped || !(equip.system.type.value in CONFIG.DND5E.armorTypes)) return obj;
      if ( equip.system.type.value === "shield" ) obj.shields.push(equip);
      else obj.armors.push(equip);
      return obj;
    }, { armors: [], shields: [] });

    // Set stealth disadvantage
    if ( Seals.hasArmorProperty(armors[0], "bulky") ) {
      AdvantageModeField.setMode(this, "skills.ste.roll.mode", -1);
    }

    ac.label = !["custom", "flat"].includes(ac.calc) ? CONFIG.DND5E.armorClasses[ac.calc]?.label : null;

    // Determine base AC
    switch ( ac.calc ) {

      // Flat AC (no additional bonuses)
      case "flat":
        ac.value = Math.max(0, Number(ac.flat) - (this.parent.getExhaustionPenalty?.() ?? 0));
        return;

      // Natural AC (includes bonuses)
      case "natural":
        ac.base = Number(ac.flat);
        break;

      default:
        let formula = ac.calc === "custom" ? ac.formula : cfg.formula;
        if ( armors.length ) {
          if ( armors.length > 1 ) this.parent._preparationWarnings.push({
            message: game.i18n.localize("DND5E.WarnMultipleArmor"), type: "warning"
          });
          const armor = armors[0];
          ac.equippedArmor = armor;
          if ( Seals.isArmorItem(armor) ) {
            const proficient = Seals.isArmorProficient(this.parent, armor);
            const armorBonus = proficient ? Seals.getArmorBonus(armor) : 0;
            const dex = proficient ? Seals.getArmorDexBonus(armor, this.abilities.dex?.mod ?? 0) : 0;
            const prof = proficient ? Math.floor((this.attributes.prof ?? 0) / 2) : 0;
            ac.n5eb = {
              armorBonus,
              dex,
              prof,
              proficient,
              dr: proficient ? Seals.getArmorDamageReduction(armor) : 0,
              slots: Seals.getSealSlots(armor)
            };
            ac.armor = 10 + armorBonus + prof;
            ac.dex = dex;
            ac.base = 10 + armorBonus + dex + prof;
            if ( !proficient ) this.parent._preparationWarnings.push({
              message: game.i18n.format("N5EB.ARMOR.Warning.NonProficient", {
                actor: this.parent.name,
                armor: armor.name
              }),
              type: "warning"
            });
            break;
          } else {
            const armorData = armor.system.armor;
            const isHeavy = armor.system.type.value === "heavy";
            ac.armor = armorData.value ?? ac.armor;
            ac.dex = isHeavy ? 0 : Math.min(armorData.dex ?? Infinity, this.abilities.dex?.mod ?? 0);
          }
        }
        else ac.dex = this.abilities.dex?.mod ?? 0;

        if ( !ac.equippedArmor ) ac.label = null;

        if ( !ac.n5eb ) {
          rollData.attributes.ac = ac;
          try {
            const replaced = replaceFormulaData(formula, rollData, {
              actor: this, missing: null, property: game.i18n.localize("DND5E.ArmorClass")
            });
            ac.base = replaced ? new Roll(replaced).evaluateSync().total : 0;
          } catch(err) {
            this.parent._preparationWarnings.push({
              message: game.i18n.format("DND5E.WarnBadACFormula", { formula }), link: "armor", type: "error"
            });
            const replaced = Roll.replaceFormulaData(CONFIG.DND5E.armorClasses.default.formula, rollData);
            ac.base = new Roll(replaced).evaluateSync().total;
          }
        }
        break;
    }

    // Equipped Shield
    if ( shields.length ) {
      if ( shields.length > 1 ) this.parent._preparationWarnings.push({
        message: game.i18n.localize("DND5E.WarnMultipleShields"), type: "warning"
      });
      ac.shield = shields[0].system.armor.value ?? 0;
      ac.equippedShield = shields[0];
    }

    // Compute cover.
    ac.cover = Math.max(ac.cover, this.parent.coverBonus);

    // Compute total AC and return
    ac.min = simplifyBonus(ac.min, rollData);
    ac.bonus = simplifyBonus(ac.bonus, rollData);
    const exhaustionPenalty = this.parent.getExhaustionPenalty?.() ?? 0;
    const conditionPenalty = this.parent.getConditionACPenalty?.() ?? 0;
    ac.value = Math.max(0, Math.max(ac.min, ac.base + ac.shield + ac.bonus + ac.cover)
      - exhaustionPenalty - conditionPenalty);
  }

  /* -------------------------------------------- */

  /**
   * Prepare concentration data for an Actor.
   * @this {CharacterData|NPCData}
   * @param {ActorRollData} rollData  The Actor's roll data.
   */
  static prepareConcentration(rollData) {
    const { concentration } = this.attributes;
    const abilityId = concentration.ability || "con";
    const skill = this.skills?.ccl;
    const ability = this.abilities?.[abilityId] || {};
    const bonus = simplifyBonus(concentration.bonuses.save, rollData);
    concentration.save = (skill?.total ?? ability.check?.value ?? 0) + bonus;
  }

  /* -------------------------------------------- */

  /**
   * Calculate encumbrance details for an Actor.
   * @this {CharacterData|NPCData|VehicleData}
   * @param {ActorRollData} rollData           The Actor's roll data.
   * @param {object} [options]
   * @param {Function} [options.validateItem]  Determine whether an item's weight should count toward encumbrance.
   */
  static prepareEncumbrance(rollData, { validateItem }={}) {
    const config = CONFIG.DND5E.encumbrance;
    const encumbrance = this.attributes.encumbrance ??= {};
    const { attributes } = this;

    // Get the total Bulk from top-level carried items and the best capacity bonus from each storage tool type.
    const storageBonuses = new Map();
    let bulk = 0;
    for ( const item of this.parent.items ) {
      if ( item.container || !(validateItem?.(item) ?? true) ) continue;
      bulk += item.system.totalWeightIn?.("bulk") ?? 0;
      const storage = item.getFlag?.("n5eb", "bulk");
      const bonus = Number(storage?.capacityBonus ?? 0);
      if ( !bonus || !item.system.equipped ) continue;
      const key = storage.capacityType || item.system.identifier || item.id;
      storageBonuses.set(key, Math.max(storageBonuses.get(key) ?? 0, bonus));
    }

    const storage = Array.from(storageBonuses.values()).reduce((total, bonus) => total + bonus, 0);
    const strMod = Math.max(0, this.abilities.str?.mod ?? 0);
    const base = (config.bulk?.base ?? 10) + (strMod * (config.bulk?.perStrengthModifier ?? 2));

    const capacityBonus = simplifyBonus(encumbrance.bonuses?.maximum, rollData)
      + simplifyBonus(encumbrance.bonuses?.overall, rollData);
    const capacityMultiplier = simplifyBonus(encumbrance.multipliers?.maximum ?? "1", rollData)
      * simplifyBonus(encumbrance.multipliers?.overall ?? "1", rollData);
    const maximum = this.isVehicle
      ? (attributes.capacity?.cargo?.value || Infinity)
      : Math.max(0, ((base + storage + capacityBonus) * capacityMultiplier).toNearest(0.1));
    const encumbered = bulk > maximum;

    // Populate final Encumbrance values
    encumbrance.bulk = true;
    encumbrance.value = bulk.toNearest(0.1);
    encumbrance.base = this.isVehicle ? 0 : base;
    encumbrance.storage = storage;
    encumbrance.thresholds = {
      encumbered: maximum,
      heavilyEncumbered: maximum,
      maximum
    };
    encumbrance.max = maximum;
    encumbrance.mod = capacityMultiplier.toNearest(0.1);
    encumbrance.stops = {
      encumbered: 100,
      heavilyEncumbered: 100
    };
    encumbrance.pct = Number.isFinite(maximum) ? Math.clamp((encumbrance.value * 100) / maximum, 0, 100) : 0;
    encumbrance.encumbered = encumbered;
  }

  /* -------------------------------------------- */

  /**
   * Adjust exhaustion level based on Active Effects.
   * @this {CharacterData|NPCData}
   */
  static prepareExhaustionLevel() {
    const exhaustion = this.parent.effects.get(ActiveEffect5e.ID.EXHAUSTION);
    const level = exhaustion?.getFlag("n5eb", "exhaustionLevel")
      ?? exhaustion?.getFlag("n5eb", "condition.rank");
    this.attributes.exhaustion = Number.isFinite(level) ? level : 0;
  }

  /* -------------------------------------------- */

  /**
   * Calculate maximum hit points, taking an provided advancement into consideration.
   * @param {object} hp                 HP object to calculate.
   * @param {object} [options={}]
   * @param {HitPointsAdvancement[]} [options.advancement=[]]  Advancement items from which to get hit points per-level.
   * @param {number} [options.bonus=0]  Additional bonus to add atop the calculated value.
   * @param {number} [options.mod=0]    Modifier for the ability to add to hit points from advancement.
   * @this {ActorDataModel}
   */
  static prepareHitPoints(hp, { advancement=[], mod=0, bonus=0 }={}) {
    const base = advancement.reduce((total, advancement) => total + advancement.getAdjustedTotal(mod), 0);
    hp.max = (hp.max ?? 0) + base + bonus;
    if ( this.parent.hasConditionEffect("halfHealth") ) hp.max *= 0.5;
    hp.max = Math.floor(hp.max);

    hp.effectiveMax = Math.max(hp.max + (hp.tempmax ?? 0), 0);
    hp.value = Math.min(hp.value, hp.effectiveMax);
    hp.damage = hp.effectiveMax - hp.value;
    hp.pct = Math.clamp(hp.effectiveMax ? (hp.value / hp.effectiveMax) * 100 : 0, 0, 100);
  }

  /* -------------------------------------------- */

  /**
   * Calculate maximum chakra points, taking an provided advancement into consideration.
   * @param {object} chakra           Chakra object to calculate.
   * @param {object} [options={}]
   * @param {ChakraAdvancement[]} [options.advancement=[]]  Advancement items from which to get chakra per-level.
   * @param {number} [options.bonus=0]  Additional bonus to add atop the calculated value.
   * @param {number} [options.mod=0]    Modifier for the ability to add to chakra from advancement.
   */
  static prepareChakraPoints(chakra, { advancement=[], mod=0, bonus=0 }={}) {
    const base = advancement.reduce((total, advancement) => total + advancement.getAdjustedTotal(mod), 0);
    chakra.max = Math.max(Math.floor((chakra.max ?? 0) + base + bonus), 0);
    chakra.temp = Math.max(Math.floor(chakra.temp ?? 0), 0);
    chakra.tempmax = Math.floor(chakra.tempmax ?? 0);
    chakra.effectiveMax = Math.max(chakra.max + chakra.tempmax, 0);
    chakra.value = Math.min(Math.max(Math.floor(chakra.value ?? 0), 0), chakra.effectiveMax);
    chakra.damage = chakra.effectiveMax - chakra.value;
    chakra.pct = Math.clamp(chakra.effectiveMax ? (chakra.value / chakra.effectiveMax) * 100 : 0, 0, 100);
  }

  /* -------------------------------------------- */

  /**
   * Prepare the initiative data for an actor.
   * @this {CharacterData|NPCData|VehicleData}
   * @param {ActorRollData} rollData  The Actor's roll data.
   */
  static prepareInitiative(rollData) {
    const init = this.attributes.init ??= {};
    const flags = this.parent.flags.n5eb ?? {};
    const globalCheckBonus = simplifyBonus(this.bonuses?.abilities?.check, rollData);

    // Compute initiative modifier
    const abilityId = init.ability || CONFIG.DND5E.defaultAbilities.initiative;
    const ability = this.abilities?.[abilityId] || {};
    init.mod = ability.mod ?? 0;

    // Initiative proficiency
    const isLegacy = dnd5e.settings.rulesVersion === "legacy";
    const prof = this.attributes.prof ?? 0;
    const joat = flags.jackOfAllTrades && isLegacy;
    const ra = this.parent._isRemarkableAthlete(abilityId);
    const alert = flags.initiativeAlert && !isLegacy;
    init.prof = new Proficiency(prof, alert ? 1 : (joat || ra) ? 0.5 : 0, !ra);

    // Adjust rolling mode
    if ( (flags.remarkableAthlete && !isLegacy) || this.parent.hasConditionEffect("initiativeAdvantage") ) {
      AdvantageModeField.setMode(this, "attributes.init.roll.mode", 1);
    }
    if ( this.parent.hasConditionEffect("initiativeDisadvantage") ) {
      AdvantageModeField.setMode(this, "attributes.init.roll.mode", -1);
    }

    // Total initiative includes all numeric terms
    const initBonus = simplifyBonus(init.bonus, rollData);
    const abilityBonus = simplifyBonus(ability.bonuses?.check, rollData);
    const quality = this.attributes.quality?.value ?? 0;
    init.total = init.mod + initBonus + abilityBonus + globalCheckBonus + quality
      + (flags.initiativeAlert && isLegacy ? 5 : 0)
      + (Number.isNumeric(init.prof.term) ? init.prof.flat : 0);
    init.score = CONFIG.DND5E.skillPassive.base + init.total + (init.roll.mode * CONFIG.DND5E.skillPassive.modifier);
  }

  /* -------------------------------------------- */

  /**
   * Modify movement speeds taking exhaustion and any other conditions into account.
   * @this {CharacterData|NPCData}
   * @param {ActorRollData} rollData  The Actor's roll data.
   */
  static prepareMovement(rollData=this.parent.getRollData()) {
    const statuses = this.parent.statuses;
    const noMovement = this.parent.hasConditionEffect("noMovement");
    const crawl = this.parent.hasConditionEffect("crawl");
    for ( const type of Object.keys(CONFIG.DND5E.movementTypes) ) {
      if ( noMovement || (crawl && (type !== "walk")) ) this.attributes.movement[type] = 0;
      else this.attributes.movement[type] = Math.max(0, simplifyBonus(this.attributes.movement[type], rollData));
      if ( type === "walk" ) this.attributes.movement.speed = this.attributes.movement.walk;
    }

    const halfMovement = this.parent.hasConditionEffect("halfMovement");
    const encumbered = statuses.has("encumbered");
    const heavilyEncumbered = statuses.has("heavilyEncumbered");
    const exceedingCarryingCapacity = statuses.has("exceedingCarryingCapacity");
    const units = this.attributes.movement.units ??= defaultUnits("length");
    let reduction = (this.parent.getExhaustionSpeedReduction?.() ?? 0)
      + (this.parent.getConditionSpeedReduction?.() ?? 0);
    reduction = convertLength(reduction, CONFIG.DND5E.defaultUnits.length.imperial, units);
    const ignoreSpeedBonus = (this.parent.getConditionRank?.("slowed") ?? 0) > 0;
    const bonus = ignoreSpeedBonus ? 0 : simplifyBonus(this.attributes.movement.bonus, rollData);
    this.attributes.movement.max = 0;
    for ( const type of Object.keys(CONFIG.DND5E.movementTypes) ) {
      let speed = Math.max(0, this.attributes.movement[type] - reduction);
      if ( speed ) {
        speed = Math.max(0, speed + bonus);
        if ( halfMovement ) speed *= 0.5;
        if ( encumbered && this.attributes.encumbrance?.bulk ) speed *= 0.5;
        else if ( heavilyEncumbered ) {
          speed = Math.max(0, speed - (CONFIG.DND5E.encumbrance.speedReduction.heavilyEncumbered[units] ?? 0));
        } else if ( encumbered ) {
          speed = Math.max(0, speed - (CONFIG.DND5E.encumbrance.speedReduction.encumbered[units] ?? 0));
        }
        if ( exceedingCarryingCapacity && !this.attributes.encumbrance?.bulk ) {
          speed = Math.min(speed, CONFIG.DND5E.encumbrance.speedReduction.exceedingCarryingCapacity[units] ?? 0);
        }
      }
      this.attributes.movement[type] = speed;
      this.attributes.movement.max = Math.max(speed, this.attributes.movement.max);
      if ( type === "walk" ) this.attributes.movement.speed = speed;
    }
    const baseSpeed = this._source.attributes.movement.walk || this.attributes.movement.fromSpecies?.walk;
    this.attributes.movement.slowed = this.attributes.movement.walk <= (simplifyBonus(baseSpeed, rollData) / 2);
    this.attributes.movement.jump = (this.abilities?.str.value ?? 0) / 2;
  }

  /* -------------------------------------------- */

  /**
   * Apply movement and sense changes based on a race item. This method should be called during
   * the `prepareEmbeddedData` step of data preparation.
   * @param {Item5e} race                    Race item from which to get the stats.
   * @param {object} [options={}]
   * @param {boolean} [options.force=false]  Override any values on the actor.
   * @this {CharacterData|NPCData}
   */
  static prepareRace(race, { force=false }={}) {
    for ( const key of Object.keys(CONFIG.DND5E.movementTypes) ) {
      if ( !race.system.movement[key] || (!force && this.attributes.movement[key]) ) continue;
      this.attributes.movement.fromSpecies ??= {};
      this.attributes.movement[key] = this.attributes.movement.fromSpecies[key] = race.system.movement[key];
    }
    if ( race.system.movement.hover ) this.attributes.movement.hover = true;
    if ( force && race.system.movement.units ) this.attributes.movement.units = race.system.movement.units;
    else this.attributes.movement.units ??= race.system.movement.units;

    for ( const key of Object.keys(CONFIG.DND5E.senses) ) {
      if ( !race.system.senses.ranges[key] || (!force && (this.attributes.senses.ranges[key] !== null)) ) continue;
      this.attributes.senses.ranges[key] = race.system.senses.ranges[key];
    }
    this.attributes.senses.special = [this.attributes.senses.special, race.system.senses.special].filterJoin(";");
    if ( force && race.system.senses.units ) this.attributes.senses.units = race.system.senses.units;
    else this.attributes.senses.units ??= race.system.senses.units;
  }

  /* -------------------------------------------- */

  /**
   * Prepare spellcasting DC & modifier.
   * @this {CharacterData|NPCData}
   */
  static prepareSpellcastingAbility() {
    const ability = this.abilities?.[this.attributes.spellcasting];
    this.attributes.spell ??= {};
    this.attributes.spell.abilityLabel = CONFIG.DND5E.abilities[this.attributes.spellcasting]?.label ?? "";
    this.attributes.spell.attack = ability ? ability.attack : this.attributes.prof;
    this.attributes.spell.dc = ability ? ability.dc : 8 + this.attributes.prof;
    this.attributes.spell.mod = ability ? ability.mod : 0;
  }

  /* -------------------------------------------- */

  /**
   * Prepare N5eB jutsu casting statistics and known counters.
   * @this {CharacterData|NPCData}
   * @param {ActorRollData} rollData  The Actor's roll data.
   */
  static prepareJutsuCasting(rollData) {
    const { attributes } = this;
    attributes.jutsu ??= {};

    for ( const [key, config] of Object.entries(CONFIG.DND5E.jutsuCastingTypes) ) {
      const casting = attributes.jutsu[key] ??= {};
      const sourceAbility = foundry.utils.getProperty(this.parent._source, `system.attributes.jutsu.${key}.ability`);
      const classAbility = Object.values(this.parent.classes ?? {})
        .map(cls => cls.system.jutsu?.abilities?.[key])
        .find(ability => ability);
      const abilityId = sourceAbility || classAbility || casting.ability || config.ability;
      const ability = this.abilities?.[abilityId];
      const attackBonus = simplifyBonus(casting.bonuses?.attack, rollData);
      const dcBonus = simplifyBonus(casting.bonuses?.dc, rollData);
      casting.label = config.label;
      casting.ability = abilityId;
      casting.abilityLabel = CONFIG.DND5E.abilities[abilityId]?.label ?? "";
      casting.mod = ability?.mod ?? 0;
      casting.attack = (ability?.attack ?? (casting.mod + (attributes.prof ?? 0))) + attackBonus;
      casting.dc = (ability?.dc ?? (8 + (attributes.prof ?? 0) + casting.mod)) + dcBonus;
    }

    for ( const key of Object.keys(attributes.jutsu) ) {
      if ( isClassmodArtsCastingKey(key) ) delete attributes.jutsu[key];
    }

    for ( const [identifier, classmod] of Object.entries(this.parent.classmods ?? {}) ) {
      const castingKey = getClassmodArtsCastingKey(identifier);
      const casting = attributes.jutsu[castingKey] ??= {};
      const attack = simplifyBonus(
        classmod.system.attackBonus?.value ?? classmod.system.attackBonus?.formula, rollData
      );
      const dc = simplifyBonus(classmod.system.save?.value ?? classmod.system.save?.formula, rollData);
      casting.label = getClassmodArtsLabel(classmod);
      casting.classmod = identifier;
      casting.isClassmodArts = true;
      casting.color = getClassmodArtsColor(classmod);
      casting.ability = "";
      casting.abilityLabel = game.i18n.localize("N5EB.CLASSMOD.ArtsFormula");
      casting.mod = null;
      casting.attack = Number.isFinite(attack) ? attack : 0;
      casting.dc = Number.isFinite(dc) ? dc : 0;
    }

    const known = attributes.jutsu.known ??= {};
    known.value = this.parent.itemTypes.spell.reduce((total, item) => {
      if ( item.getFlag("n5eb", "cachedFor") ) return total;
      return item.system.jutsu?.countsKnown === false ? total : total + 1;
    }, 0);

    const rankOrder = CONFIG.DND5E.jutsuRankOrder;
    const progressionClass = getJutsuProgressionClass(this);
    const progression = getJutsuProgression(progressionClass);
    known.max = progression.known;
    known.hasMax = Number.isFinite(known.max);
    const maxRank = progression.maxRank;
    const max = rankOrder.indexOf(maxRank);
    known.maxRank = maxRank;
    known.maxRankLabel = maxRank ? game.i18n.localize(CONFIG.DND5E.jutsuRanks[maxRank]?.label) : "";

    if ( known.hasMax && (known.value > known.max) ) this.parent._preparationWarnings.push({
      message: game.i18n.format("N5EB.JUTSU.WarnKnownExceeded", {
        value: known.value,
        max: known.max
      }),
      type: "warning"
    });
    if ( max >= 0 ) {
      const overRank = this.parent.itemTypes.spell.find(item => {
        if ( item.system.jutsu?.countsKnown === false ) return false;
        return rankOrder.indexOf(item.system.effectiveRank) > max;
      });
      if ( overRank ) this.parent._preparationWarnings.push({
        message: game.i18n.format("N5EB.JUTSU.WarnMaxRankExceeded", {
          name: overRank.name,
          rank: CONFIG.DND5E.jutsuRanks[overRank.system.effectiveRank]?.label ?? overRank.system.effectiveRank,
          max: known.maxRankLabel
        }),
        type: "warning"
      });
    }
  }

  /* -------------------------------------------- */
  /*  Socket Event Handlers                       */
  /* -------------------------------------------- */

  /**
   * Track changes to HP when updated and set death save status.
   * @this {CharacterData|NPCData|VehicleData}
   * @param {object} changes  The candidate changes to the Document.
   * @param {object} options  Additional options which modify the update request.
   * @param {BaseUser} user   The User requesting the document update.
   */
  static async preUpdateHP(changes, options, user) {
    const isDead = this.attributes.hp.value <= 0;
    if ( isDead && (foundry.utils.getProperty(changes, "system.attributes.hp.value") > 0) ) {
      foundry.utils.setProperty(changes, "system.attributes.death.success", 0);
      foundry.utils.setProperty(changes, "system.attributes.death.failure", 0);
    }
    foundry.utils.setProperty(options, "dnd5e.hp", { ...this.attributes.hp });
  }

  /* -------------------------------------------- */

  /**
   * Display concentration challenge if necessary, set bloodied status, and fire damage hook.
   * @this {CharacterData|NPCData|VehicleData}
   * @param {object} changed  The differential data that was changed relative to the document's prior values.
   * @param {object} options  Additional options which modify the update request.
   * @param {string} userId   The id of the User requesting the document update.
   */
  static async onUpdateHP(changed, options, userId) {
    if ( !changed.system?.attributes?.hp ) return;
    if ( userId === game.userId ) await this.parent.updateBloodied(options);

    const hp = options.dnd5e?.hp;
    if ( !hp || options.isRest || options.isAdvancement ) return;

    const curr = this.attributes.hp;
    const changes = {
      hp: curr.value - hp.value,
      temp: curr.temp - hp.temp
    };
    changes.total = changes.hp + changes.temp;
    if ( !Number.isInteger(changes.total) || (changes.total === 0) ) return;

    this.parent._displayTokenEffect(changes);
    if ( !game.settings.get("n5eb", "disableConcentration") && (userId === game.userId)
      && (options.dnd5e?.concentrationCheck !== false)
      && (changes.total < 0) && ((changes.temp < 0) || (curr.value < curr.effectiveMax)) ) {
      this.parent.challengeConcentration({ dc: this.parent.getConcentrationDC(-changes.total) });
    }

    /**
     * A hook event that fires when an actor is damaged or healed by any means. The actual name
     * of the hook will depend on the change in hit points.
     * @function dnd5e.damageActor
     * @memberof hookEvents
     * @param {Actor5e} actor                                       The actor that had their hit points reduced.
     * @param {{hp: number, temp: number, total: number}} changes   The changes to hit points.
     * @param {object} update                                       The original update delta.
     * @param {string} userId                                       Id of the user that performed the update.
     */
    Hooks.callAll(`dnd5e.${changes.total > 0 ? "heal" : "damage"}Actor`, this.parent, changes, changed, userId);
  }
}

/* -------------------------------------------- */

/**
 * Determine which class controls jutsu known progression.
 * @param {CharacterData|NPCData} system  Actor system data.
 * @returns {Item5e|null}
 */
function getJutsuProgressionClass(system) {
  if ( system.isCharacter ) return system.parent.items.get(system.details.originalClass) ?? null;
  return Object.values(system.parent.classes ?? {}).sort((a, b) => b.system.levels - a.system.levels)[0] ?? null;
}

/* -------------------------------------------- */

/**
 * Retrieve jutsu known progression from a class's reserved scale values, with legacy fallbacks.
 * @param {Item5e|null} cls  Class item.
 * @returns {{known: number|null, maxRank: string}}
 */
function getJutsuProgression(cls) {
  if ( !cls ) return { known: null, maxRank: "" };

  const knownScale = getJutsuKnownScaleValue(cls);
  const legacyKnown = cls.system.jutsu?.known;
  let known = Number.isFinite(knownScale) ? knownScale : null;
  const table = getJutsuProgressionFromDescription(cls);
  if ( !Number.isFinite(known) && Number.isFinite(table.known) ) known = table.known;
  if ( !Number.isFinite(known) && legacyKnown ) {
    known = simplifyBonus(legacyKnown, cls.getRollData({ deterministic: true }));
  }

  return {
    known,
    maxRank: getJutsuMaxRank(cls)
  };
}

/* -------------------------------------------- */

/**
 * Retrieve a reserved or legacy jutsu-known scale value from a class.
 * @param {Item5e} cls  Class item.
 * @returns {number|null}
 */
function getJutsuKnownScaleValue(cls) {
  const scaleValues = cls.scaleValues ?? {};
  for ( const identifier of JUTSU_KNOWN_SCALE_ALIASES ) {
    const value = Number(scaleValues[identifier]?.value);
    if ( Number.isFinite(value) ) return value;
  }

  const level = cls.system.levels ?? 0;
  for ( const advancement of cls.advancement?.byType?.ScaleValue ?? [] ) {
    const identifier = advancement.identifier;
    if ( !JUTSU_KNOWN_SCALE_ALIASES.has(identifier) && (formatIdentifier(advancement.title ?? "") !== JUTSU_KNOWN_SCALE_ID) ) {
      continue;
    }
    const value = Number(advancement.valueForLevel(level)?.value);
    if ( Number.isFinite(value) ) return value;
  }

  return null;
}

/* -------------------------------------------- */

/**
 * Retrieve the current highest jutsu rank from a class's scale values.
 * @param {Item5e} cls  Class item.
 * @returns {string}
 */
function getJutsuMaxRank(cls) {
  const scaleValues = cls.scaleValues ?? {};
  const reserved = normalizeJutsuRank(scaleValues[JUTSU_MAX_RANK_SCALE_ID]?.value);
  if ( reserved ) return reserved;

  for ( const identifier of JUTSU_MAX_RANK_SCALE_ALIASES ) {
    const rank = normalizeJutsuRank(scaleValues[identifier]?.value);
    if ( rank ) return rank;
  }

  const level = cls.system.levels ?? 0;
  for ( const advancement of cls.advancement?.byType?.ScaleValue ?? [] ) {
    const identifier = advancement.identifier;
    if ( !JUTSU_MAX_RANK_SCALE_ALIASES.has(identifier) && (advancement.configuration.type !== "jutsuRank") ) {
      continue;
    }
    const rank = normalizeJutsuRank(advancement.valueForLevel(level)?.value);
    if ( rank ) return rank;
  }

  const tableRank = normalizeJutsuRank(getJutsuProgressionFromDescription(cls).maxRank);
  if ( tableRank ) return tableRank;

  return normalizeJutsuRank(cls.system.jutsu?.maxRank);
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
