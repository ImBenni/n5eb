import { simplifyBonus } from "../../utils.mjs";
import { DEFAULT_CLASSMOD_ARTS_COLOR } from "../../classmod-arts.mjs";
import ItemDataModel from "../abstract/item-data-model.mjs";
import FormulaField from "../fields/formula-field.mjs";
import AdvancementTemplate from "./templates/advancement.mjs";
import ItemDescriptionTemplate from "./templates/item-description.mjs";

const { NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Data definition for legacy N5eB Class Mod items.
 * @extends {ItemDataModel<AdvancementTemplate & ItemDescriptionTemplate>}
 * @mixes AdvancementTemplateData
 * @mixes ItemDescriptionTemplateData
 */
export default class ClassModData extends ItemDataModel.mixin(AdvancementTemplate, ItemDescriptionTemplate) {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["N5EB.CLASSMOD", "DND5E.SOURCE"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      levels: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
      color: new StringField({
        required: true, blank: false, initial: DEFAULT_CLASSMOD_ARTS_COLOR, label: "N5EB.CLASSMOD.Color"
      }),
      save: new SchemaField({
        value: new FormulaField({ deterministic: true, required: true }),
        formula: new FormulaField({ deterministic: true, required: true }),
        scaling: new StringField({ required: true, blank: true, initial: "" })
      }),
      attackBonus: new SchemaField({
        value: new FormulaField({ deterministic: true, required: true }),
        formula: new FormulaField({ deterministic: true, required: true }),
        scaling: new StringField({ required: true, blank: true, initial: "" })
      })
    });
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    AdvancementTemplate.migrateAdvancement(source);
    ClassModData.#migrateLevels(source);
    ClassModData.#migrateColor(source);
    ClassModData.#migrateFormulaBlock(source, "save");
    ClassModData.#migrateFormulaBlock(source, "attackBonus");
  }

  /* -------------------------------------------- */

  /**
   * Migrate classmod levels.
   * @param {object} source  Candidate source data.
   */
  static #migrateLevels(source) {
    if ( typeof source.levels !== "string" ) return;
    source.levels = Number.isNumeric(source.levels) ? Number(source.levels) : 1;
  }

  /* -------------------------------------------- */

  /**
   * Migrate missing classmod Arts color.
   * @param {object} source  Candidate source data.
   */
  static #migrateColor(source) {
    if ( /^#[0-9a-f]{6}$/i.test(source.color) ) return;
    source.color = DEFAULT_CLASSMOD_ARTS_COLOR;
  }

  /* -------------------------------------------- */

  /**
   * Migrate old scalar classmod formula fields into the current object shape.
   * @param {object} source  Candidate source data.
   * @param {string} key     Formula block key.
   */
  static #migrateFormulaBlock(source, key) {
    const value = source[key];
    if ( foundry.utils.getType(value) === "Object" ) {
      value.value ??= "";
      value.formula ??= "";
      if ( !value.value && value.formula ) value.value = value.formula;
      value.scaling ??= "";
      return;
    }
    source[key] = { value: value ?? "", formula: "", scaling: "" };
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.prepareDescriptionData();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareFinalData() {
    const rollData = this.parent.getRollData({ deterministic: true });
    this.save.effective = simplifyBonus(this.save.value, rollData);
    this.attackBonus.effective = simplifyBonus(this.attackBonus.value, rollData);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getFavoriteData() {
    const context = await super.getFavoriteData();
    context.value = this.levels;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getSheetData(context) {
    context.subtitles = [{ label: game.i18n.localize(CONFIG.Item.typeLabels.classmod) }];
    context.singleDescription = true;
    context.parts = ["dnd5e.details-classmod"];
  }
}
