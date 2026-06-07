import ItemDataModel from "../abstract/item-data-model.mjs";
import ItemDescriptionTemplate from "./templates/item-description.mjs";

const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Data definition for Downtime Activity template items.
 * @extends {ItemDataModel<ItemDescriptionTemplate>}
 * @mixes ItemDescriptionTemplate
 */
export default class DowntimeData extends ItemDataModel.mixin(ItemDescriptionTemplate) {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["N5EB.DOWNTIME", "DND5E.SOURCE"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      category: new StringField({
        required: true, blank: false, initial: "custom", label: "N5EB.DOWNTIME.Category.Label"
      }),
      weeks: new SchemaField({
        value: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 1,
          label: "N5EB.DOWNTIME.Weeks.Base"
        }),
        max: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 1,
          label: "N5EB.DOWNTIME.Weeks.Required"
        }),
        mode: new StringField({
          required: true, blank: false, initial: "fixed", label: "N5EB.DOWNTIME.Weeks.Mode.Label"
        }),
        note: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.Weeks.Note" })
      }, { label: "N5EB.DOWNTIME.Weeks.Label" }),
      cost: new SchemaField({
        value: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 0,
          label: "N5EB.DOWNTIME.Cost.Value"
        }),
        denomination: new StringField({
          required: true, blank: false, initial: "ryo", label: "DND5E.Currency"
        }),
        per: new StringField({
          required: true, blank: false, initial: "activity", label: "N5EB.DOWNTIME.Cost.Per.Label"
        }),
        mode: new StringField({
          required: true, blank: false, initial: "fixed", label: "N5EB.DOWNTIME.Cost.Mode.Label"
        }),
        due: new StringField({
          required: true, blank: false, initial: "completion", label: "N5EB.DOWNTIME.Cost.Due.Label"
        }),
        fixed: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 0,
          label: "N5EB.DOWNTIME.Cost.FixedValue"
        }),
        perWeek: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 0,
          label: "N5EB.DOWNTIME.Cost.PerWeekValue"
        }),
        manualTotal: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 0,
          label: "N5EB.DOWNTIME.Cost.ManualTotal"
        }),
        dueAmount: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 0,
          label: "N5EB.DOWNTIME.Cost.DueAmount"
        }),
        rank: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.Rank.Label" }),
        rankTable: new SchemaField({
          e: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          d: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          c: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          b: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          a: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          s: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
        }, { label: "N5EB.DOWNTIME.Cost.RankTable" }),
        override: new BooleanField({ required: true, initial: false, label: "N5EB.DOWNTIME.Cost.Override" }),
        reason: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.Cost.OverrideReason" }),
        note: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.Cost.Note" })
      }, { label: "N5EB.DOWNTIME.Cost.Label" }),
      roll: new SchemaField({
        enabled: new BooleanField({ required: true, initial: false, label: "N5EB.DOWNTIME.Roll.Enabled" }),
        ability: new StringField({ required: true, initial: "", label: "DND5E.Ability" }),
        skill: new StringField({ required: true, initial: "", label: "DND5E.Skill" }),
        tool: new StringField({ required: true, initial: "", label: "DND5E.Tool" }),
        dc: new NumberField({
          required: true, nullable: false, integer: true, min: 0, initial: 0,
          label: "DND5E.AbbreviationDC"
        }),
        label: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.Roll.Label" })
      }, { label: "N5EB.DOWNTIME.Roll.Label" }),
      target: new SchemaField({
        type: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.Target.Type" }),
        uuid: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.Target.UUID" })
      }, { label: "N5EB.DOWNTIME.Target.Label" }),
      completion: new StringField({ required: true, initial: "", label: "N5EB.DOWNTIME.Completion" })
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static get compendiumBrowserFilters() {
    return new Map([
      ["category", {
        label: "N5EB.DOWNTIME.Category.Label",
        type: "set",
        config: {
          choices: CONFIG.DND5E.downtimeCategories,
          keyPath: "system.category"
        }
      }]
    ]);
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get cardProperties() {
    return [
      this.categoryLabel,
      game.i18n.format("N5EB.DOWNTIME.Weeks.Count", { value: this.weeks.max }),
      this.costLabel
    ];
  }

  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    return this.cardProperties;
  }

  /* -------------------------------------------- */

  /** @override */
  static get itemCategories() {
    return CONFIG.DND5E.downtimeCategories;
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    migrateDowntimeTemplateCost(source);
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.prepareDescriptionData();
    this.categoryLabel = CONFIG.DND5E.downtimeCategories[this.category]?.label
      ?? game.i18n.localize("N5EB.DOWNTIME.Category.Custom");
    const cost = this.cost.value ? `${this.cost.value} ${game.i18n.localize("DND5E.CurrencyAbbrRyo")}` : "";
    this.costLabel = getDowntimeTemplateCostLabel(this.cost, cost);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getSheetData(context) {
    context.subtitles = [
      { label: this.categoryLabel },
      { label: game.i18n.format("N5EB.DOWNTIME.Weeks.Count", { value: this.weeks.max }) },
      { label: this.costLabel }
    ];
    context.parts = ["dnd5e.details-downtime"];
    context.downtime = {
      categories: CONFIG.DND5E.downtimeCategories,
      costModes: CONFIG.DND5E.downtimeCostModes,
      dueTimings: CONFIG.DND5E.downtimeDueTimings,
      pricingModes: CONFIG.DND5E.downtimePricingModes,
      ranks: CONFIG.DND5E.downtimeRanks,
      currencies: CONFIG.DND5E.currencies,
      rollAbilities: CONFIG.DND5E.abilities,
      rollSkills: CONFIG.DND5E.skills,
      rollTools: CONFIG.DND5E.tools,
      weekModes: CONFIG.DND5E.downtimeWeekModes
    };
  }
}

/* -------------------------------------------- */

/**
 * Initialize structured pricing fields on downtime template items.
 * @param {object} source  Item system source data.
 */
function migrateDowntimeTemplateCost(source) {
  source.cost ??= {};
  const cost = source.cost;
  cost.value ??= 0;
  cost.denomination ||= "ryo";
  cost.per ||= "activity";
  cost.mode ||= cost.per === "week" ? "per-week" : (cost.value ? "fixed" : "none");
  cost.due ||= cost.mode === "per-week" ? "weekly" : (cost.mode === "none" ? "manual" : "completion");
  cost.fixed ??= cost.per === "activity" ? Number(cost.value ?? 0) : 0;
  cost.perWeek ??= cost.per === "week" ? Number(cost.value ?? 0) : 0;
  cost.manualTotal ??= 0;
  cost.dueAmount ??= 0;
  cost.rank ??= "";
  cost.rankTable ??= {};
  for ( const rank of ["e", "d", "c", "b", "a", "s"] ) cost.rankTable[rank] ??= 0;
  cost.override ??= false;
  cost.reason ??= "";
  cost.note ??= "";
}

/* -------------------------------------------- */

/**
 * Build the downtime template cost label.
 * @param {object} cost          Cost data.
 * @param {string} legacyLabel   Legacy fallback cost label.
 * @returns {string}
 */
function getDowntimeTemplateCostLabel(cost, legacyLabel) {
  const ryo = game.i18n.localize("DND5E.CurrencyAbbrRyo");
  switch ( cost.mode ) {
    case "none": return game.i18n.localize("N5EB.DOWNTIME.Cost.None");
    case "per-week": {
      const amount = cost.perWeek || cost.value;
      return amount ? game.i18n.format("N5EB.DOWNTIME.Cost.PerWeek", { cost: `${amount} ${ryo}` })
        : game.i18n.localize("N5EB.DOWNTIME.Cost.None");
    }
    case "rank-table": return game.i18n.localize("N5EB.DOWNTIME.Cost.Mode.RankTable");
    case "manual": return cost.manualTotal
      ? game.i18n.format("N5EB.DOWNTIME.Cost.Fixed", { cost: `${cost.manualTotal} ${ryo}` })
      : game.i18n.localize("N5EB.DOWNTIME.Cost.Mode.Manual");
    case "fixed":
    default: {
      const amount = cost.fixed || cost.value;
      if ( amount ) return game.i18n.format("N5EB.DOWNTIME.Cost.Fixed", { cost: `${amount} ${ryo}` });
      return legacyLabel ? game.i18n.format(`N5EB.DOWNTIME.Cost.${cost.per === "week" ? "PerWeek" : "Fixed"}`, {
        cost: legacyLabel
      }) : game.i18n.localize("N5EB.DOWNTIME.Cost.None");
    }
  }
}
