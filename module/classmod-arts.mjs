export const DEFAULT_CLASSMOD_ARTS_COLOR = "#3b145f";
export const CLASSMOD_ARTS_PREFIX = "classmod:";

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
