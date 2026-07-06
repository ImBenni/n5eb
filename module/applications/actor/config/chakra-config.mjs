import { formatNumber } from "../../../utils.mjs";
import BaseConfigSheet from "../api/base-config-sheet.mjs";

/**
 * Configuration application for chakra points.
 */
export default class ChakraConfig extends BaseConfigSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["chakra"],
    actions: {
      roll: ChakraConfig.#rollFormula
    },
    position: {
      width: 420
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    config: {
      template: "systems/n5eb/templates/actors/config/chakra-config.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("N5EB.Chakra");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.data = this.document.system.attributes.chakra;
    context.fields = this.document.system.schema.fields.attributes.fields.chakra.fields;
    context.source = this.document.system._source.attributes.chakra;

    // Display positive ability modifier as its own row, but if negative merge into classes totals.
    const abilityId = CONFIG.DND5E.defaultAbilities.chakraPoints || "con";
    const ability = CONFIG.DND5E.abilities[abilityId];
    const mod = this.document.system.abilities?.[abilityId]?.mod ?? 0;
    if ( ability && (mod > 0) ) context.ability = { mod, name: ability.label };

    // Summarize Chakra from classes.
    context.classes = Object.values(this.document.classes).map(cls => ({
      id: cls.id,
      anchor: cls.toAnchor().outerHTML,
      name: cls.name,
      total: cls.advancement.byType.Chakra?.[0]?.[mod > 0 ? "total" : "getAdjustedTotal"](mod) ?? 0
    })).sort((lhs, rhs) => rhs.name - lhs.name);

    // Display active effects targeting bonus fields.
    context.effects = {
      bonuses: this.document._prepareActiveEffectAttributions("system.attributes.chakra.bonuses.level"),
      max: this.document._prepareActiveEffectAttributions("system.attributes.chakra.max"),
      overall: this.document._prepareActiveEffectAttributions("system.attributes.chakra.bonuses.overall")
    };
    for ( const [key, value] of Object.entries(context.effects) ) {
      context.effects[key] = value
        .filter(e => e.mode === CONST.ACTIVE_EFFECT_MODES.ADD)
        .map(e => ({ ...e, anchor: e.document.toAnchor().outerHTML }));
    }

    context.levels = this.document.system.details?.level ?? 0;
    context.levelMultiplier = `
      <span class="multiplier"><span class="times">&times;</span> ${formatNumber(context.levels)}</span>
    `;
    context.showCalculation = context.classes.length || context.fields.bonuses;
    context.showMaxInCalculation = context.showCalculation && this.document.system.isNPC;
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle rolling chakra values using the provided formula.
   * @this {ChakraConfig}
   * @param {PointerEvent} event  The triggering click event.
   * @param {HTMLElement} target  The button that was clicked.
   * @protected
   */
  static async #rollFormula(event, target) {
    try {
      const roll = await this.document.rollChakraFormula();
      this.submit({ updateData: { "system.attributes.chakra.max": roll.total } });
    } catch(error) {
      ui.notifications.error("N5EB.ChakraFormulaError", { localize: true });
      throw error;
    }
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _processSubmitData(event, form, submitData) {
    const clone = this.document.clone(foundry.utils.deepClone(submitData));
    const { value, max } = this.document.system.attributes.chakra;
    const maxDelta = clone.system.attributes.chakra.max - max;
    const current = submitData.system.attributes.chakra.value ?? value;
    foundry.utils.setProperty(submitData, "system.attributes.chakra.value", Math.max(current + maxDelta, 0));
    super._processSubmitData(event, form, submitData);
  }
}
