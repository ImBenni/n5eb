const { ArrayField, BooleanField, NumberField, SetField, SchemaField, StringField } = foundry.data.fields;

/**
 * @import { TraitAdvancementConfigurationData } from "./_types.mjs";
 */

/**
 * Map old D&D language grants to Naruto Common.
 * @type {Record<string, string>}
 */
const _MAP = {
  "languages:exotic:draconic": "languages:standard:common",
  "languages:standard:draconic": "languages:standard:common",
  "languages:standard:dwarvish": "languages:standard:common",
  "languages:standard:elvish": "languages:standard:common",
  "languages:standard:giant": "languages:standard:common",
  "languages:standard:gnomish": "languages:standard:common",
  "languages:standard:goblin": "languages:standard:common",
  "languages:standard:halfling": "languages:standard:common",
  "languages:standard:orc": "languages:standard:common",
  "languages:standard:sign": "languages:standard:common",
  "languages:exotic:aarakocra": "languages:standard:common",
  "languages:exotic:abyssal": "languages:standard:common",
  "languages:exotic:cant": "languages:standard:common",
  "languages:exotic:celestial": "languages:standard:common",
  "languages:exotic:deep": "languages:standard:common",
  "languages:exotic:druidic": "languages:standard:common",
  "languages:exotic:gith": "languages:standard:common",
  "languages:exotic:gnoll": "languages:standard:common",
  "languages:exotic:infernal": "languages:standard:common",
  "languages:exotic:primordial": "languages:standard:common",
  "languages:exotic:primordial:aquan": "languages:standard:common",
  "languages:exotic:primordial:auran": "languages:standard:common",
  "languages:exotic:primordial:ignan": "languages:standard:common",
  "languages:exotic:primordial:terran": "languages:standard:common",
  "languages:exotic:sylvan": "languages:standard:common",
  "languages:exotic:undercommon": "languages:standard:common",
  "languages:cant": "languages:standard:common",
  "languages:druidic": "languages:standard:common"
};

const LANGUAGE_MAP = { modern: _MAP, legacy: _MAP };

/**
 * Configuration data for the TraitAdvancement.
 * @extends {foundry.abstract.DataModel<TraitAdvancementConfigurationData>}
 * @mixes TraitAdvancementConfigurationData
 */
export class TraitConfigurationData extends foundry.abstract.DataModel {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["DND5E.ADVANCEMENT.Trait"];

  /* -------------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      allowReplacements: new BooleanField({ required: true }),
      choices: new ArrayField(new SchemaField({
        count: new NumberField({ required: true, positive: true, integer: true, initial: 1 }),
        pool: new SetField(new StringField())
      })),
      grants: new SetField(new StringField(), { required: true }),
      mode: new StringField({ required: true, blank: false, initial: "default" })
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(source) {
    super.migrateData(source);
    if ( !source ) return source;
    const version = dnd5e.settings.rulesVersion;
    const languageMap = LANGUAGE_MAP[version] ?? {};
    if ( source.grants?.length ) source.grants = source.grants.map(t => languageMap[t] ?? t);
    if ( source.choices?.length ) source.choices.forEach(c => {
      if ( !c.pool ) c.pool = [];
      if ( !Array.isArray(c.pool) ) c.pool = Object.values(c.pool);
      c.pool = c.pool.map(t => languageMap[t] ?? t);
    });
    return source;
  }
}

/**
 * Value data for the TraitAdvancement.
 * @extends {foundry.abstract.DataModel<TraitAdvancementValueData>}
 * @mixes TraitAdvancementValueData
 */
export class TraitValueData extends foundry.abstract.DataModel {
  /** @override */
  static defineSchema() {
    return {
      chosen: new SetField(new StringField(), { required: false })
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(source) {
    super.migrateData(source);
    if ( !source ) return source;
    const version = dnd5e.settings.rulesVersion;
    const languageMap = LANGUAGE_MAP[version] ?? {};
    if ( source.chosen?.length ) source.chosen = source.chosen.map(t => languageMap[t] ?? t);
    return source;
  }
}
