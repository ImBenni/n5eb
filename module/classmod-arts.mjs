export const DEFAULT_CLASSMOD_ARTS_COLOR = "#3b145f";
export const CLASSMOD_ARTS_PREFIX = "classmod:";
export const CLASSMOD_ARTS_MECHANICAL_RANK = "s";
export const CLASSMOD_ARTS_DISPLAY_RANK = "art";

/* -------------------------------------------- */

/**
 * Resolve the classmod Art flag from an Item document or raw source data.
 * @param {object} item  Item document, item source, or item system data.
 * @returns {*}
 */
function getClassmodArtFlag(item) {
  return item?.getFlag?.("n5eb", "classmodArt")
    ?? item?.flags?.n5eb?.classmodArt
    ?? item?.system?.flags?.n5eb?.classmodArt;
}

/* -------------------------------------------- */

/**
 * Test whether a jutsu item is a classmod Art.
 * @param {object} item  Item document, item source, or item system data.
 * @returns {boolean}
 */
export function isClassmodArtItem(item) {
  if ( item?.type && (item.type !== "spell") ) return false;
  const system = item?.system ?? item;
  if ( system?.classmodIdentifier ) return true;
  if ( isClassmodArtsCastingKey(system?.sourceItem) ) return true;
  return Boolean(getClassmodArtFlag(item));
}

/* -------------------------------------------- */

/**
 * Get the display label for the Art rank.
 * @param {object} [options={}]
 * @param {boolean} [options.abbreviation=false]  Return the abbreviation label.
 * @returns {string}
 */
export function getClassmodArtRankLabel({ abbreviation=false }={}) {
  return game.i18n.localize(abbreviation ? "N5EB.JUTSU.Rank.ArtAbbr" : "N5EB.JUTSU.Rank.Art");
}

/* -------------------------------------------- */

/**
 * Get the rank value used by classmod Arts for rank-based mechanics.
 * @returns {number}
 */
export function getClassmodArtRankValue() {
  return CONFIG.DND5E.jutsuRankValues[CLASSMOD_ARTS_MECHANICAL_RANK] ?? 5;
}

/* -------------------------------------------- */

/**
 * Get the rank value used by classmod Arts for Clash rank bonus math.
 * @returns {number}
 */
export function getClassmodArtClashRankValue() {
  return getClassmodArtRankValue() + 1;
}

/* -------------------------------------------- */

/**
 * Build the jutsu casting key used by a classmod's Arts.
 * @param {string} identifier  Classmod identifier.
 * @returns {string}
 */
export function getClassmodArtsCastingKey(identifier) {
  return `${CLASSMOD_ARTS_PREFIX}${identifier}`;
}

/* -------------------------------------------- */

/**
 * Test whether a jutsu casting key points at classmod Arts.
 * @param {string} key  Jutsu casting key.
 * @returns {boolean}
 */
export function isClassmodArtsCastingKey(key) {
  return (typeof key === "string") && key.startsWith(CLASSMOD_ARTS_PREFIX);
}

/* -------------------------------------------- */

/**
 * Get the classmod identifier from a classmod Arts casting key.
 * @param {string} key  Jutsu casting key.
 * @returns {string}
 */
export function getClassmodIdentifierFromCastingKey(key) {
  return isClassmodArtsCastingKey(key) ? key.slice(CLASSMOD_ARTS_PREFIX.length) : "";
}

/* -------------------------------------------- */

/**
 * Resolve the casting key for a jutsu's source item.
 * @param {string} sourceItem  Source item identifier, with optional type prefix.
 * @returns {string}
 */
export function getClassmodArtsCastingKeyFromSource(sourceItem) {
  if ( !sourceItem?.startsWith(CLASSMOD_ARTS_PREFIX) ) return "";
  return getClassmodArtsCastingKey(getClassmodIdentifierFromCastingKey(sourceItem));
}

/* -------------------------------------------- */

/**
 * Get the display label for a classmod's Arts card.
 * @param {Item5e} classmod  Classmod item.
 * @returns {string}
 */
export function getClassmodArtsLabel(classmod) {
  return game.i18n.format("N5EB.CLASSMOD.ArtsLabel", { classmod: classmod.name });
}

/* -------------------------------------------- */

/**
 * Get the configured display color for a classmod's Arts card.
 * @param {Item5e} classmod  Classmod item.
 * @returns {string}
 */
export function getClassmodArtsColor(classmod) {
  const color = classmod?.system?.color || DEFAULT_CLASSMOD_ARTS_COLOR;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_CLASSMOD_ARTS_COLOR;
}

/* -------------------------------------------- */

/**
 * Build inline CSS variables for a classmod Arts card.
 * @param {string} color  Classmod color.
 * @returns {string}
 */
export function getClassmodArtsStyle(color=DEFAULT_CLASSMOD_ARTS_COLOR) {
  color = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_CLASSMOD_ARTS_COLOR;
  return [
    `--jutsu-header-1: color-mix(in oklab, ${color} 62%, #17051f)`,
    `--jutsu-header-2: color-mix(in oklab, ${color} 34%, #09030d)`
  ].join("; ");
}

/* -------------------------------------------- */

/**
 * Build sheet card data for all owned classmod Arts casting entries.
 * @param {Actor5e} actor  Actor being displayed.
 * @returns {object[]}
 */
export function getClassmodArtsSpellcastingCards(actor) {
  const jutsu = actor.system.attributes?.jutsu ?? {};
  return Object.keys(actor.classmods ?? {}).map(identifier => {
    const key = getClassmodArtsCastingKey(identifier);
    const casting = jutsu[key];
    if ( !casting ) return null;
    const color = casting.color || DEFAULT_CLASSMOD_ARTS_COLOR;
    return {
      key,
      label: casting.label,
      isClassmodArts: true,
      style: getClassmodArtsStyle(color),
      ability: {
        ability: "",
        label: casting.abilityLabel,
        mod: null
      },
      attack: casting.attack,
      save: casting.dc,
      concentration: {
        mod: actor.system.attributes.concentration.save,
        tooltip: game.i18n.format("DND5E.AbilityConfigure", { ability: game.i18n.localize("DND5E.Concentration") })
      }
    };
  }).filter(_ => _);
}
