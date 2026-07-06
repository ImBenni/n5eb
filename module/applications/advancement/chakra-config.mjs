import AdvancementConfig from "./advancement-config-v2.mjs";

/**
 * Configuration application for chakra.
 */
export default class ChakraConfig extends AdvancementConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["chakra"]
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  static PARTS = {
    ...super.PARTS,
    chakra: {
      template: "systems/n5eb/templates/advancement/chakra-config.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.chakraDie = this.advancement.chakraDie;
    return context;
  }
}
