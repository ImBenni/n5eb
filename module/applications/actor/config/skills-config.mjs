import SkillToolConfig from "./skill-tool-config.mjs";
import TraitsConfig from "./traits-config.mjs";

/**
 * Configuration application for actor's skills.
 */
export default class SkillsConfig extends TraitsConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["skills"],
    trait: "skills",
    actions: {
      configure: SkillsConfig.#configureSkill
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    traits: {
      template: "systems/n5eb/templates/actors/config/skills-config.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.skills = context.choices.OTHER.children;
    context.rows = Math.ceil(Object.keys(context.skills).length / 2);
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _processChoice(data, key, choice, categoryChosen=false) {
    super._processChoice(data, key, choice, categoryChosen);
    const skill = data[key];
    if ( skill ) {
      const { value, mastery } = dnd5e.dataModels.actor.CommonTemplate.normalizeSkillToolProficiency(
        skill.value, skill.mastery
      );
      choice.value = value;
      choice.mastery = dnd5e.settings.useExpertise && mastery ? 1 : mastery;
      choice.total = this.document.system.skills[key]?.total;
      choice.tooltip = CONFIG.DND5E.proficiencyLevels[value];
      choice.masteryTooltip = CONFIG.DND5E.masteryLevels[choice.mastery];
    }
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
   * Open the configuration sheet for a skill.
   * @this {SkillsConfig}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #configureSkill(event, target) {
    const { key } = target.closest("[data-key]").dataset;
    new SkillToolConfig({ document: this.document, trait: "skills", key }).render(true);
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
    const skills = foundry.utils.getProperty(submitData, "system.skills");
    if ( !skills ) return submitData;

    for ( const [key, data] of Object.entries(skills) ) {
      if ( !("mastery" in data) ) continue;
      let mastery = Number(data.mastery);
      const sourceMastery = Number(this.document.system._source.skills?.[key]?.mastery ?? 0);
      const changed = event?.target?.name ?? event?.target?.getAttribute?.("name") ?? this._changedInput;
      if ( dnd5e.settings.useExpertise && (mastery === 1) && (sourceMastery > 1)
        && (changed !== `system.skills.${key}.mastery`) ) {
        data.mastery = mastery = sourceMastery;
      }
      if ( mastery === sourceMastery ) continue;

      foundry.utils.setProperty(
        submitData,
        `flags.n5eb.masteryOverride.skills.${key}`,
        !dnd5e.settings.useExpertise && (mastery > this._maximumSheetMasteryValue())
      );
    }

    return submitData;
  }
}
