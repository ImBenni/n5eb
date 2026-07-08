import Advancement from "./advancement.mjs";
import ChakraConfig from "../../applications/advancement/chakra-config.mjs";
import ChakraFlow from "../../applications/advancement/chakra-flow.mjs";
import { simplifyBonus } from "../../utils.mjs";

/**
 * Advancement that presents the player with the option to roll chakra at each level or select the average value.
 * Keeps track of player chakra rolls or selection for each class level. **Can only be added to classes and each
 * class can only have one.**
 */
export default class ChakraAdvancement extends Advancement {

  /** @inheritDoc */
  static get metadata() {
    return foundry.utils.mergeObject(super.metadata, {
      order: 11,
      icon: "icons/magic/air/wind-vortex-swirl-blue.webp",
      typeIcon: "systems/n5eb/icons/svg/chakra.svg",
      title: game.i18n.localize("N5EB.ADVANCEMENT.Chakra.Title"),
      hint: game.i18n.localize("N5EB.ADVANCEMENT.Chakra.Hint"),
      multiLevel: true,
      apps: {
        config: ChakraConfig,
        flow: ChakraFlow
      }
    });
  }

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * The amount gained if the average is taken.
   * @type {number}
   */
  get average() {
    return (this.chakraDieValue / 2) + 1;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get levels() {
    return Array.fromRange(CONFIG.DND5E.maxLevel + 1).slice(1);
  }

  /* -------------------------------------------- */

  /**
   * Shortcut to the chakra die used by the class.
   * @returns {string}
   */
  get chakraDie() {
    const denomination = this.actor?.system.isNPC
      ? this.actor.system.attributes.cd.denomination
      : this.item.system.cd.denomination;
    return this.constructor.normalizeDie(denomination);
  }

  /* -------------------------------------------- */

  /**
   * Normalize a chakra die denomination.
   * @param {*} denomination  Candidate die denomination.
   * @returns {string}
   */
  static normalizeDie(denomination) {
    const match = `${denomination ?? ""}`.trim().toLowerCase().match(/^d*(\d+)$/);
    return match ? `d${match[1]}` : "d6";
  }

  /* -------------------------------------------- */

  /**
   * The face value of the chakra die used.
   * @returns {number}
   */
  get chakraDieValue() {
    const value = Number(this.chakraDie.slice(1));
    return Number.isFinite(value) ? value : 6;
  }

  /* -------------------------------------------- */
  /*  Display Methods                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  configuredForLevel(level) {
    return this.valueForLevel(level) !== null;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  titleForLevel(level, { configMode=false, legacyDisplay=false }={}) {
    const chakra = this.valueForLevel(level);
    if ( !chakra || configMode || !legacyDisplay ) return this.title;
    return `${this.title}: <strong>${chakra}</strong>`;
  }

  /* -------------------------------------------- */

  /**
   * Chakra given at the provided level.
   * @param {number} level   Level for which to get chakra.
   * @returns {number|null}  Chakra for level or null if none has been taken.
   */
  valueForLevel(level) {
    return this.constructor.valueForLevel(this.value, this.chakraDieValue, level);
  }

  /* -------------------------------------------- */

  /**
   * Chakra given at the provided level.
   * @param {object} data             Contents of `value` used to determine this value.
   * @param {number} chakraDieValue   Face value of the chakra die used by this advancement.
   * @param {number} level            Level for which to get chakra.
   * @returns {number|null}           Chakra for level or null if none has been taken.
   */
  static valueForLevel(data, chakraDieValue, level) {
    const value = data[level];
    if ( (value === undefined) || (value === null) || (value === "") ) return null;

    if ( value === "max" ) return chakraDieValue;
    if ( value === "avg" ) return (chakraDieValue / 2) + 1;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  /* -------------------------------------------- */

  /**
   * Total chakra provided by this advancement.
   * @returns {number}  Chakra currently selected.
   */
  total() {
    return Object.keys(this.value).reduce((total, level) => total + this.valueForLevel(parseInt(level)), 0);
  }

  /* -------------------------------------------- */

  /**
   * Total chakra taking the provided ability modifier into account, with a minimum of 1 per level.
   * @param {number} mod  Modifier to add per level.
   * @returns {number}    Total chakra plus modifier.
   */
  getAdjustedTotal(mod) {
    return Object.keys(this.value).reduce((total, level) => {
      const value = this.valueForLevel(parseInt(level));
      if ( value === null ) return total;
      return total + Math.max(value + mod, 1);
    }, 0);
  }

  /* -------------------------------------------- */
  /*  Editing Methods                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static availableForItem(item) {
    return !item.advancement.byType.Chakra?.length;
  }

  /* -------------------------------------------- */
  /*  Application Methods                         */
  /* -------------------------------------------- */

  /**
   * Add the ability modifier and any bonuses to the provided chakra value to get the number to apply.
   * @param {number} value  Chakra taken at a given level.
   * @returns {number}      Chakra adjusted with ability modifier and per-level bonuses.
   */
  #getApplicableValue(value) {
    const abilityId = CONFIG.DND5E.defaultAbilities.chakraPoints || "con";
    value = Number(value);
    if ( !Number.isFinite(value) ) return 0;
    const mod = Number(this.actor.system.abilities[abilityId]?.mod ?? 0);
    value = Math.max(Math.floor(value + (Number.isFinite(mod) ? mod : 0)), 1);
    const bonus = Number(simplifyBonus(this.actor.system.attributes.chakra.bonuses?.level, this.actor.getRollData()));
    return value + (Number.isFinite(bonus) ? bonus : 0);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async apply(level, data, options={}) {
    if ( options.initial ) {
      if ( (level === 1) && this.item.isOriginalClass ) data[level] = "max";
      else if ( this.value[level - 1] === "avg" ) data[level] = "avg";
      else if ( this.value[level - 1] === "max" ) data[level] = "max";
    }

    let value = this.constructor.valueForLevel(data, this.chakraDieValue, level);
    if ( value === null ) return;
    if ( this.value[level] !== undefined ) await this.reverse(level);
    this.updateSource({ value: data });
    const current = Number(this.actor.system.attributes.chakra.value);
    this.actor.updateSource({
      "system.attributes.chakra.value": (Number.isFinite(current) ? current : 0) + this.#getApplicableValue(value)
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async automaticApplicationValue(level) {
    if ( (level === 1) && this.item.isOriginalClass ) return { [level]: "max" };
    if ( this.value[level - 1] === "avg" ) return { [level]: "avg" };
    if ( this.value[level - 1] === "max" ) return { [level]: "max" };
    return false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async restore(level, data, options={}) {
    await this.apply(level, data, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async reverse(level, options={}) {
    let value = this.valueForLevel(level);
    if ( value === null ) return;
    const source = { [level]: this.value[level] };
    this.updateSource({ [`value.-=${level}`]: null });
    const current = Number(this.actor.system.attributes.chakra.value);
    this.actor.updateSource({
      "system.attributes.chakra.value": Math.max((Number.isFinite(current) ? current : 0) - this.#getApplicableValue(value), 0)
    });
    return source;
  }
}
