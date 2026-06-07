import BaseRestDialog from "./base-rest-dialog.mjs";

const { BooleanField } = foundry.data.fields;

/**
 * Dialog for configuring a short rest.
 */
export default class ShortRestDialog extends BaseRestDialog {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["short-rest"],
    actions: {
      rollChakraDie: ShortRestDialog.#rollChakraDie,
      rollHitDie: ShortRestDialog.#rollHitDie
    },
    window: {
      title: "DND5E.REST.Short.Label"
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  static PARTS = {
    ...super.PARTS,
    content: {
      template: "systems/n5eb/templates/actors/rest/short-rest.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Currently selected hit dice denomination.
   * @type {string}
   */
  #denom;

  /* -------------------------------------------- */

  /**
   * Currently selected chakra dice denomination.
   * @type {string}
   */
  #chakraDenom;

  /* -------------------------------------------- */

  /**
   * Hit dice spent through this dialog.
   * @type {number}
   */
  #hitDiceRolled = 0;

  /* -------------------------------------------- */

  /**
   * Chakra dice spent through this dialog.
   * @type {number}
   */
  #chakraDiceRolled = 0;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.autoRoll = new BooleanField({
      label: game.i18n.localize("DND5E.REST.HitDice.AutoSpend.Label"),
      hint: game.i18n.localize("DND5E.REST.HitDice.AutoSpend.Hint")
    });

    const restConfig = CONFIG.DND5E.restTypes[this.config.type];
    const getSpendCap = (dice, fraction) => {
      if ( !dice?.max ) return 0;
      return Math.max(1, Math.floor(dice.max * (fraction ?? 0.5)));
    };

    if ( this.actor.system.isNPC ) {
      const hd = this.actor.system.attributes.hd;
      const cd = this.actor.system.attributes.cd;
      const hitDiceCap = getSpendCap(hd, restConfig.maxHitDiceSpendFraction);
      const chakraDiceCap = getSpendCap(cd, restConfig.maxChakraDiceSpendFraction);
      context.hitDice = {
        canRoll: (hd.value > 0) && (this.#hitDiceRolled < hitDiceCap),
        denomination: `d${hd.denomination}`,
        options: [{
          value: `d${hd.denomination}`,
          label: `d${hd.denomination} (${game.i18n.format("DND5E.HITDICE.Available", { number: hd.value })})`
        }]
      };
      context.chakraDice = {
        canRoll: (cd.value > 0) && (this.#chakraDiceRolled < chakraDiceCap),
        denomination: cd.denomination,
        options: [{
          value: cd.denomination,
          label: `${cd.denomination} (${game.i18n.format("N5EB.CHAKRADICE.Available", { number: cd.value })})`
        }]
      };
    }

    else if ( foundry.utils.hasProperty(this.actor, "system.attributes.hd") ) {
      const hd = this.actor.system.attributes.hd;
      const cd = this.actor.system.attributes.cd;
      const hitDiceCap = getSpendCap(hd, restConfig.maxHitDiceSpendFraction);
      const chakraDiceCap = getSpendCap(cd, restConfig.maxChakraDiceSpendFraction);
      context.hitDice = {
        canRoll: (hd.value > 0) && (this.#hitDiceRolled < hitDiceCap),
        options: Object.entries(hd.bySize).map(([value, number]) => ({
          value, label: `${value} (${game.i18n.format("DND5E.HITDICE.Available", { number })})`, number
        }))
      };
      context.hitDice.denomination = (hd.bySize[this.#denom] > 0)
        ? this.#denom : context.hitDice.options.find(o => o.number > 0)?.value;
      context.chakraDice = {
        canRoll: (cd.value > 0) && (this.#chakraDiceRolled < chakraDiceCap),
        options: Object.entries(cd.bySize).map(([value, number]) => ({
          value, label: `${value} (${game.i18n.format("N5EB.CHAKRADICE.Available", { number })})`, number
        }))
      };
      context.chakraDice.denomination = (cd.bySize[this.#chakraDenom] > 0)
        ? this.#chakraDenom : context.chakraDice.options.find(o => o.number > 0)?.value;
    }

    else {
      if ( !context.fields.length ) {
        context.formSections.unshift({ legend: "DND5E.REST.Configuration", fields: context.fields });
      }
      context.fields.unshift({
        field: context.autoRoll,
        input: context.inputs.createCheckboxInput,
        name: "autoHD",
        value: context.config.autoHD
      });
    }

    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle rolling a hit die.
   * @this {ShortRestDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #rollHitDie(event, target) {
    this.#denom = this.form.elements.denom.value;
    const roll = await this.actor.rollHitDie({ denomination: this.#denom });
    if ( roll !== null ) this.#hitDiceRolled += 1;
    foundry.utils.mergeObject(this.config, new foundry.applications.ux.FormDataExtended(this.form).object);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling a chakra die.
   * @this {ShortRestDialog}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #rollChakraDie(event, target) {
    this.#chakraDenom = this.form.elements.chakraDenom.value;
    const roll = await this.actor.rollChakraDie({ denomination: this.#chakraDenom });
    if ( roll !== null ) this.#chakraDiceRolled += 1;
    foundry.utils.mergeObject(this.config, new foundry.applications.ux.FormDataExtended(this.form).object);
    this.render();
  }
}
