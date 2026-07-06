import SkillToolConfig from "./skill-tool-config.mjs";
import TraitsConfig from "./traits-config.mjs";

/**
 * Configuration application for actor's tools.
 */
export default class ToolsConfig extends TraitsConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["trait-columns", "tools"],
    trait: "tool",
    actions: {
      configure: ToolsConfig.#configureTool
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    traits: {
      template: "systems/n5eb/templates/actors/config/tools-config.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.masteryLabel = dnd5e.settings.useExpertise ? "DND5E.Expertise" : "DND5E.MASTERY.Label";
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _processChoice(data, key, choice, categoryChosen=false) {
    super._processChoice(data, key, choice, categoryChosen);
    const tool = data[key];
    if ( tool ) {
      const { value, mastery } = dnd5e.dataModels.actor.CommonTemplate.normalizeSkillToolProficiency(
        tool.value, tool.mastery
      );
      choice.hasEntry = true;
      choice.value = value;
      choice.mastery = dnd5e.settings.useExpertise && mastery ? 1 : mastery;
      choice.total = this.document.system.tools[key]?.total;
    }
    choice.tooltip = CONFIG.DND5E.proficiencyLevels[choice.value ?? 0];
    choice.mastery ??= 0;
    choice.masteryTooltip = CONFIG.DND5E.masteryLevels[choice.mastery];
  }

  /* -------------------------------------------- */
  /*  Life-Cycle Handlers                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("proficiency-cycle").forEach(e => {
      e.addEventListener("change", event => {
        this._changedInput = event.currentTarget?.name ?? event.currentTarget?.getAttribute?.("name");
        Promise.resolve(this.submit()).finally(() => delete this._changedInput);
      });
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Open the configuration sheet for a tool.
   * @this {ToolsConfig}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #configureTool(event, target) {
    const { key } = target.closest("[data-key]").dataset;
    new SkillToolConfig({ document: this.document, trait: this.options.trait, key }).render(true);
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
  /* -------------------------------------------- */

  /**
   * Determine the highest Mastery value normally allowed for this actor's level.
   * @returns {number}
   * @protected
   */
  _maximumSheetMasteryValue() {
    const { level, cr } = this.document.system.details ?? {};
    const effectiveLevel = Math.max(Number(level) || 0, Number(cr) || 0, 1);
    return effectiveLevel >= 12 ? 3 : effectiveLevel >= 7 ? 2 : 1;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _processFormData(event, form, formData) {
    const formTools = {};
    for ( const [path, value] of Object.entries(formData.object) ) {
      const [, , key, field] = path.split(".");
      if ( !key || !["value", "mastery"].includes(field) ) continue;
      formTools[key] ??= {};
      formTools[key][field] = Number(value);
    }

    const submitData = Object.entries(formTools).reduce((obj, [key, data]) => {
      const tool = this.document.system._source.tools[key];
      const config = CONFIG.DND5E.tools[key];
      const value = data.value ?? Number(tool?.value ?? 0);
      let mastery = data.mastery ?? Number(tool?.mastery ?? 0);
      const sourceMastery = Number(tool?.mastery ?? 0);
      const changed = event?.target?.name ?? event?.target?.getAttribute?.("name") ?? this._changedInput;
      if ( dnd5e.settings.useExpertise && (mastery === 1) && (sourceMastery > 1)
        && (changed !== `system.tools.${key}.mastery`) ) {
        mastery = sourceMastery;
      }
      if ( tool && !value && !mastery ) obj[`system.tools.-=${key}`] = null;
      else if ( !tool && (value || mastery) ) {
        obj[`system.tools.${key}`] = { value, mastery, ability: config?.ability || "int" };
      }
      else if ( tool ) {
        if ( value ) obj[`system.tools.${key}.value`] = value;
        else obj[`system.tools.${key}.value`] = 0;
        obj[`system.tools.${key}.mastery`] = mastery;
      }

      if ( mastery !== sourceMastery ) {
        obj[`flags.n5eb.masteryOverride.tools.${key}`] =
          !dnd5e.settings.useExpertise && (mastery > this._maximumSheetMasteryValue());
      }
      return obj;
    }, {});
    return foundry.utils.expandObject(submitData);
  }
}
