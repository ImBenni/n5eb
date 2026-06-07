import BaseConfigSheet from "../api/base-config-sheet.mjs";

/**
 * Configuration application for adjusting chakra dice amounts and rolling.
 */
export default class ChakraDiceConfig extends BaseConfigSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["chakra-dice"],
    actions: {
      decrease: ChakraDiceConfig.#stepValue,
      increase: ChakraDiceConfig.#stepValue,
      roll: ChakraDiceConfig.#rollDie
    },
    position: {
      width: 420
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    config: {
      template: "systems/n5eb/templates/actors/config/chakra-dice-config.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("N5EB.ChakraDice");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.denominationOptions = CONFIG.DND5E.chakraDieTypes.map(d => ({ value: d, label: d }));
    context.isNPC = this.document.system.isNPC;
    if ( context.isNPC ) {
      context.data = this.document.system.attributes.cd;
      context.fields = this.document.system.schema.fields.attributes.fields.cd.fields;
      context.source = this.document.system._source.attributes.cd;
    } else {
      context.classes = Array.from(this.document.system.attributes?.cd?.classes ?? []).map(cls => ({
        data: { ...cls.system.cd },
        denomination: cls.system.cd.denomination,
        id: cls.id,
        label: `${cls.name} (${cls.system.cd.denomination})`
      })).sort((lhs, rhs) => rhs.denomination.localeCompare(lhs.denomination, "en", { numeric: true }));
    }
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle rolling a specific chakra die.
   * @this {ChakraDiceConfig}
   * @param {PointerEvent} event  The triggering click event.
   * @param {HTMLElement} target  The button that was clicked.
   */
  static async #rollDie(event, target) {
    await this.document.rollChakraDie({ denomination: target.dataset.denomination });
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle stepping a chakra die count up or down.
   * @this {ChakraDiceConfig}
   * @param {PointerEvent} event  The triggering click event.
   * @param {HTMLElement} target  The button that was clicked.
   */
  static #stepValue(event, target) {
    const valueField = target.closest(".form-group").querySelector("input");
    if ( target.dataset.action === "increase" ) valueField?.stepUp();
    else valueField?.stepDown();
    this.submit();
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    if ( !form.reportValidity() ) return {};
    const submitData = super._processFormData(event, form, formData);
    if ( this.document.system.isNPC ) {
      const max = foundry.utils.getProperty(submitData, "system.attributes.cd.max")
        ?? this.document.system.attributes.cd.max;
      const spent = foundry.utils.getProperty(submitData, "system.attributes.cd.spent")
        ?? this.document.system.attributes.cd.spent;
      foundry.utils.setProperty(submitData, "system.attributes.cd.spent", Math.min(spent, max));
      return submitData;
    }

    const classUpdates = Object.entries(submitData).map(([_id, value]) => {
      const cls = this.document.items.get(_id);
      return { _id, "system.cd.spent": Math.max(cls.system.cd.max - value, 0) };
    });
    this.document.updateEmbeddedDocuments("Item", classUpdates);
    return {};
  }
}
