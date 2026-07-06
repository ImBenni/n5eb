import Advancement from "../../documents/advancement/advancement.mjs";
import { simplifyBonus } from "../../utils.mjs";
import AdvancementFlow from "./advancement-flow-v2.mjs";

/**
 * Inline application that presents chakra selection upon level up.
 */
export default class ChakraFlow extends AdvancementFlow {

  /** @override */
  static DEFAULT_OPTIONS = {
    actions: {
      rollChakra: ChakraFlow.#rollChakra
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: {
      template: "systems/n5eb/templates/advancement/chakra-flow.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const source = this.advancement.value;
    const value = source[this.level];
    const chakra = this.advancement.actor.system.attributes.chakra;
    const abilityId = CONFIG.DND5E.defaultAbilities.chakraPoints || "con";
    const mod = this.advancement.actor.system.abilities[abilityId]?.mod ?? 0;
    const bonus = simplifyBonus(chakra.bonuses?.level ?? "", this.advancement.actor.getRollData());

    return {
      ...context,
      data: {
        value: value === "avg" ? this.advancement.average : value === "max" ? this.advancement.chakraDieValue
          : Number.isInteger(value) ? value : "",
        useAverage: value === "avg",
        useMax: value === "max"
      },
      chakra: {
        average: this.advancement.average,
        bonus,
        max: this.advancement.chakraDieValue,
        modifier: {
          label: CONFIG.DND5E.abilities[abilityId]?.abbreviation ?? "",
          value: mod
        },
        previous: Object.keys(this.advancement.value).reduce((total, level) => {
          if ( parseInt(level) === this.level ) return total;
          return total + Math.max(this.advancement.valueForLevel(parseInt(level)) + mod, 1) + bonus;
        }, 0),
        total: value ? chakra.max : "-"
      },
      chakraDie: this.advancement.chakraDie,
      isFirstClassLevel: (this.level === 1) && this.advancement.item.isOriginalClass,
      manual: !["avg", "max"].includes(value),
      selectedMax: value === "max"
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle rolling chakra.
   * @this {ChakraFlow}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #rollChakra(event, target) {
    const roll = await this.advancement.actor.rollClassChakra(this.advancement.item);
    if ( roll ) {
      await this.advancement.apply(this.level, { [this.level]: roll.total });
      this.render();
    }
  }

  /* -------------------------------------------- */
  /*  Form Handling                               */
  /* -------------------------------------------- */

  /** @override */
  async _handleForm(event, form, formData) {
    let newValue;
    if ( event.target?.name === "useAverage" ) {
      newValue = event.target.checked ? "avg" : null;
    } else if ( event.target?.name === "useMax" ) {
      newValue = event.target.checked ? "max" : null;
    } else if ( event.target?.name === "value" ) {
      newValue = Number.isInteger(event.target.valueAsNumber) ? event.target.valueAsNumber : null;
    } else {
      // If neither the value input nor the useAverage checkbox is present, this is the first-class-level case where
      // max chakra is shown statically and no user input is required.
      if ( form.querySelector("[name=value], [name=useAverage]") ) {
        const { useAverage, useMax, value } = formData.object;
        if ( !useAverage && !useMax && !Number.isInteger(value) ) {
          const errorType = value === null ? "Empty" : "Invalid";
          throw new Advancement.ERROR(
            game.i18n.localize(`N5EB.ADVANCEMENT.Chakra.Warning.${errorType}`),
            { selector: ".roll-result" }
          );
        }
      }
      return;
    }

    if ( ((typeof newValue === "string") && newValue) || Number.isInteger(newValue) ) {
      await this.advancement.apply(this.level, { [this.level]: newValue });
    }
    else await this.advancement.reverse(this.level);
  }
}
