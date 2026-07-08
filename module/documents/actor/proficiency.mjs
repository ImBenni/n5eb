/**
 * Object describing the proficiency for a specific ability or skill.
 *
 * @param {number} proficiency   Actor's flat proficiency bonus based on their current level.
 * @param {number} multiplier    Value by which to multiply the actor's base proficiency value.
 * @param {boolean} [roundDown]  Should half-values be rounded up or down?
 * @param {object} [options]     Additional proficiency calculation options.
 * @param {number} [options.effectiveMultiplier]  Multiplier used for calculations when it differs from the stored
 *                                                proficiency value.
 * @param {number} [options.flatBonus]            Flat bonus added after the proficiency calculation.
 */
export default class Proficiency {
  constructor(proficiency, multiplier, roundDown=true, options={}) {

    /**
     * Base proficiency value of the actor.
     * @type {number}
     * @private
     */
    this._baseProficiency = Number(proficiency ?? 0);

    /**
     * Value by which to multiply the actor's base proficiency value.
     * @type {number}
     */
    this.multiplier = Number(multiplier ?? 0);

    /**
     * Value by which to multiply the actor's base proficiency value when calculating the actual bonus.
     * @type {number}
     * @private
     */
    this._effectiveMultiplier = Number(options.effectiveMultiplier ?? this.multiplier);

    /**
     * Flat bonus added to the calculated proficiency.
     * @type {number}
     * @private
     */
    this._flatBonus = Number(options.flatBonus ?? 0);

    /**
     * Direction decimal results should be rounded ("up" or "down").
     * @type {string}
     */
    this.rounding = roundDown ? "down" : "up";
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Should only deterministic proficiency be returned, regardless of system settings?
   * @type {boolean}
   */
  deterministic = false;

  /* -------------------------------------------- */

  /**
   * Flat proficiency value regardless of proficiency mode.
   * @type {number}
   */
  get flat() {
    const roundMethod = (this.rounding === "down") ? Math.floor : Math.ceil;
    return roundMethod(this._effectiveMultiplier * this._baseProficiency) + this._flatBonus;
  }

  /* -------------------------------------------- */

  /**
   * Dice-based proficiency value regardless of proficiency mode.
   * @type {string}
   */
  get dice() {
    const parts = [];
    const roundTerm = (this.rounding === "down") ? "floor" : "ceil";
    if ( (this._baseProficiency !== 0) && (this._effectiveMultiplier !== 0) ) {
      if ( this._effectiveMultiplier === 0.5 ) {
        parts.push(`${roundTerm}(1d${this._baseProficiency * 2} / 2)`);
      } else {
        parts.push(`${this._effectiveMultiplier}d${this._baseProficiency * 2}`);
      }
    }
    if ( this._flatBonus ) parts.push(String(this._flatBonus));
    return parts.join(" + ") || "0";
  }

  /* -------------------------------------------- */

  /**
   * Either flat or dice proficiency term based on configured setting.
   * @type {string}
   */
  get term() {
    return (dnd5e.settings.proficiencyModifier === "dice") && !this.deterministic
      ? this.dice : String(this.flat);
  }

  /* -------------------------------------------- */

  /**
   * Whether the proficiency is greater than zero.
   * @type {boolean}
   */
  get hasProficiency() {
    return (this._baseProficiency > 0) && (this.multiplier >= 1);
  }

  /* -------------------------------------------- */

  /**
   * Whether this proficiency contributes a bonus term to a roll.
   * @type {boolean}
   */
  get hasBonus() {
    return ((this._baseProficiency > 0) && (this._effectiveMultiplier > 0)) || (this._flatBonus !== 0);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Calculate an actor's proficiency modifier based on level or CR.
   * @param {number} level  Level or CR To use for calculating proficiency modifier.
   * @returns {number}      Proficiency modifier.
   */
  static calculateMod(level) {
    return Math.floor((level + 8) / 3);
  }

  /* -------------------------------------------- */

  /**
   * Return a clone of this proficiency with any changes applied.
   * @param {object} [updates={}]
   * @param {number} updates.proficiency  Actor's flat proficiency bonus based on their current level.
   * @param {number} updates.multiplier   Value by which to multiply the actor's base proficiency value.
   * @param {boolean} updates.roundDown   Should half-values be rounded up or down?
   * @param {number} updates.effectiveMultiplier  Multiplier used for calculations.
   * @param {number} updates.flatBonus            Flat bonus added after the proficiency calculation.
   * @returns {Proficiency}
   */
  clone({ proficiency, multiplier, roundDown, effectiveMultiplier, flatBonus }={}) {
    const updateMultiplier = multiplier !== undefined;
    proficiency ??= this._baseProficiency;
    multiplier ??= this.multiplier;
    roundDown ??= this.rounding === "down";
    return new this.constructor(proficiency, multiplier, roundDown, {
      effectiveMultiplier: effectiveMultiplier ?? (updateMultiplier ? multiplier : this._effectiveMultiplier),
      flatBonus: flatBonus ?? (updateMultiplier ? 0 : this._flatBonus)
    });
  }

  /* -------------------------------------------- */

  /**
   * Override the default `toString` method to return flat proficiency for backwards compatibility in formula.
   * @returns {string}  Either flat or dice proficiency term based on configured setting.
   */
  toString() {
    return this.term;
  }
}
