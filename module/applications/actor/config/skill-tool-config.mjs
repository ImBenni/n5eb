import BaseProficiencyConfig from "./base-proficiency-config.mjs";

/**
 * @import { SkillConfiguration, ToolConfiguration } from "../../../_types.mjs";
 */

/**
 * Configuration application for an actor's skills & tools.
 */
export default class SkillToolConfig extends BaseProficiencyConfig {

  /** @override */
  static PARTS = {
    config: {
      template: "systems/n5eb/templates/actors/config/skill-tool-config.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Configuration data for the ability being edited.
   * @type {SkillConfiguration|ToolConfiguration}
   */
  get propertyConfig() {
    return CONFIG.DND5E[this.options.trait === "skills" ? "skills" : "tools"][this.options.key];
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    const normalized = dnd5e.dataModels.actor.CommonTemplate.normalizeSkillToolProficiency(
      context.data.value, context.data.mastery
    );
    context.data = { ...context.data, ...normalized };
    context.abilityOptions = Object.entries(CONFIG.DND5E.abilities).map(([value, { label }]) => ({ value, label }));
    context.proficiencyOptions = Object.entries(CONFIG.DND5E.proficiencyLevels)
      .map(([value, label]) => ({ value, label }));
    context.masteryOptions = Object.entries(CONFIG.DND5E.masteryLevels)
      .filter(([value]) => !dnd5e.settings.useExpertise || (Number(value) <= 1))
      .map(([value, label]) => ({ value, label }));
    context.masteryValue = dnd5e.settings.useExpertise && (Number(context.data.mastery ?? 0) > 0)
      ? 1 : context.data.mastery ?? 0;
    context.masteryLabel = dnd5e.settings.useExpertise ? "DND5E.Expertise" : "DND5E.MASTERY.Label";
    context.section = `DND5E.${this.options.trait === "skills" ? "SKILL" : "TOOL"}.SECTIONS.`;
    context.global.skill = this.options.trait === "skills";
    return context;
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
    const submitData = super._processFormData(event, form, formData);
    const type = this.options.trait === "skills" ? "skills" : "tools";
    const data = foundry.utils.getProperty(submitData, `system.${type}.${this.options.key}`);
    if ( data && ("mastery" in data) ) {
      let mastery = Number(data.mastery);
      const sourceMastery = Number(this.document.system._source[type]?.[this.options.key]?.mastery ?? 0);
      const changed = event?.target?.name ?? event?.target?.getAttribute?.("name");
      if ( dnd5e.settings.useExpertise && (mastery === 1) && (sourceMastery > 1)
        && (changed !== `system.${type}.${this.options.key}.mastery`) ) {
        data.mastery = mastery = sourceMastery;
      }
      if ( mastery !== sourceMastery ) {
        foundry.utils.setProperty(
          submitData,
          `flags.n5eb.masteryOverride.${type}.${this.options.key}`,
          !dnd5e.settings.useExpertise && (mastery > this._maximumSheetMasteryValue())
        );
      }
    }
    return submitData;
  }
}
