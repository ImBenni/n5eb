/**
 * @import { RestConfiguration, RestResult } from "../_types.mjs";
 */

/**
 * Object describing the chakra dice for an actor.
 */
export default class ChakraDice {
  /**
   * Object describing the chakra dice for an actor.
   * @param {Actor5e} actor  The actor whose chakra dice this document describes.
   */
  constructor(actor) {
    this.actor = actor;

    for ( const item of Object.values(actor.classes) ) {
      this.classes.add(item);
      this.sizes.add(parseInt(item.system.cd.denomination.slice(1)));
    }
  }

  /* -------------------------------------------- */

  /**
   * Store a reference to the actor.
   * @type {Actor5e}
   */
  actor = null;

  /* -------------------------------------------- */

  /**
   * Remaining chakra dice.
   * @type {number}
   */
  get value() {
    if ( this.#value !== undefined ) return this.#value;
    this.#value = this.classes.reduce((acc, cls) => acc + cls.system.cd.value, 0);
    return this.#value;
  }

  #value;

  /* -------------------------------------------- */

  /**
   * The actor's total amount of chakra dice.
   * @type {number}
   */
  get max() {
    if ( this.#max !== undefined ) return this.#max;
    this.#max = this.classes.reduce((acc, cls) => acc + cls.system.cd.max, 0);
    return this.#max;
  }

  #max;

  /* -------------------------------------------- */

  /**
   * All valid die sizes derived from all classes.
   * @type {Set<number>}
   */
  sizes = new Set();

  /* -------------------------------------------- */

  /**
   * Store valid class items.
   * @type {Set<Item5e>}
   */
  classes = new Set();

  /* -------------------------------------------- */

  /**
   * The smallest denomination.
   * @type {string}
   */
  get smallest() {
    return `d${this.smallestFace}`;
  }

  /* -------------------------------------------- */

  /**
   * The smallest die size of those available.
   * @type {string}
   */
  get smallestAvailable() {
    const bySize = this.bySize;
    for ( const faces of Array.from(this.sizes).sort((a, b) => a - b) ) {
      if ( bySize[`d${faces}`] ) return `d${faces}`;
    }
    return "d0";
  }

  /* -------------------------------------------- */

  /**
   * The smallest die size.
   * @type {number}
   */
  get smallestFace() {
    return this.sizes.size ? Math.min(...this.sizes) : 0;
  }

  /* -------------------------------------------- */

  /**
   * The largest denomination.
   * @type {string}
   */
  get largest() {
    return `d${this.largestFace}`;
  }

  /* -------------------------------------------- */

  /**
   * The largest die size of those available.
   * @type {string}
   */
  get largestAvailable() {
    const bySize = this.bySize;
    for ( const faces of Array.from(this.sizes).sort((a, b) => b - a) ) {
      if ( bySize[`d${faces}`] ) return `d${faces}`;
    }
    return "d0";
  }

  /* -------------------------------------------- */

  /**
   * The largest die size.
   * @type {number}
   */
  get largestFace() {
    return this.sizes.size ? Math.max(...this.sizes) : 0;
  }

  /* -------------------------------------------- */

  /**
   * The percentage of remaining chakra dice.
   * @type {number}
   */
  get pct() {
    return Math.clamp(this.max ? (this.value / this.max) * 100 : 0, 0, 100);
  }

  /* -------------------------------------------- */

  /**
   * Return an object of remaining chakra dice categorized by size.
   * @returns {object}
   */
  get bySize() {
    const cd = {};
    this.classes.forEach(cls => {
      const d = cls.system.cd.denomination;
      cd[d] = (cd[d] ?? 0) + cls.system.cd.value;
    });
    return cd;
  }

  /* -------------------------------------------- */

  /**
   * Override the default `toString` method for backwards compatibility.
   * @returns {number}  Remaining chakra dice.
   */
  toString() {
    return this.value;
  }

  /* -------------------------------------------- */

  /**
   * Create item updates for recovering chakra dice during a rest.
   * @param {RestConfiguration} [config]
   * @param {number} [config.maxChakraDice]  Maximum number of chakra dice to recover.
   * @param {number} [config.fraction=0.5]   Fraction of max chakra dice to recover. Only used if
   *                                         `maxChakraDice` isn't specified.
   * @param {boolean} [config.largest]       Whether to restore the largest chakra dice first.
   * @param {RestResult} [result={}]         Rest result being constructed.
   */
  createChakraDiceUpdates({ maxChakraDice, fraction=0.5, largest=true, ...config }={}, result={}) {
    if ( !Number.isInteger(maxChakraDice) ) maxChakraDice = Math.max(Math.floor(this.max * fraction), 1);
    const classes = Array.from(this.classes).sort((lhs, rhs) => {
      const sort = lhs.system.cd.denomination.localeCompare(rhs.system.cd.denomination, "en", { numeric: true });
      return largest ? sort * -1 : sort;
    });
    const updateItems = [];
    let recovered = 0;
    for ( const item of classes ) {
      const used = item.system.cd.spent;
      if ( (recovered < maxChakraDice) && (used > 0) ) {
        const delta = Math.min(used, maxChakraDice - recovered);
        recovered += delta;
        updateItems.push({ _id: item.id, "system.cd.spent": used - delta });
      }
    }
    result.updateItems ??= [];
    for ( const update of updateItems ) {
      const existing = result.updateItems.find(i => i._id === update._id);
      if ( existing ) foundry.utils.mergeObject(existing, update);
      else result.updateItems.push(update);
    }
    foundry.utils.mergeObject(result, {
      deltas: {
        chakraDice: (result?.deltas?.chakraDice ?? 0) + recovered
      }
    });
  }
}
