/**
 * Calculate actor update data for applying a chat roll to Chakra.
 * @param {object} chakra       Actor Chakra data.
 * @param {number} amount       Positive amount to apply.
 * @param {string} mode         Chakra application mode.
 * @returns {object}            Actor update data.
 */
export function calculateChakraUpdates(chakra, amount, mode) {
  amount = Math.trunc(Math.max(Number(amount) || 0, 0));
  if ( !amount || !chakra ) return {};

  const value = Math.max(Math.trunc(Number(chakra.value) || 0), 0);
  const temp = Math.max(Math.trunc(Number(chakra.temp) || 0), 0);
  const effectiveMax = getEffectiveMax(chakra);
  const updates = {};

  if ( mode === "damage" ) {
    const tempDamage = Math.min(temp, amount);
    const valueDamage = Math.min(value, amount - tempDamage);
    if ( tempDamage ) updates["system.attributes.chakra.temp"] = temp - tempDamage;
    if ( valueDamage ) updates["system.attributes.chakra.value"] = value - valueDamage;
  } else if ( mode === "healing" ) {
    const nextValue = Math.max(value, Math.min(value + amount, effectiveMax));
    if ( nextValue !== value ) updates["system.attributes.chakra.value"] = nextValue;
  } else if ( mode === "temp" ) {
    if ( amount > temp ) updates["system.attributes.chakra.temp"] = amount;
  }

  return updates;
}

/* -------------------------------------------- */

/**
 * Determine effective maximum Chakra from prepared or source-like Chakra data.
 * @param {object} chakra  Actor Chakra data.
 * @returns {number}
 */
function getEffectiveMax(chakra) {
  if ( Number.isFinite(Number(chakra.effectiveMax)) ) {
    return Math.max(Math.trunc(Number(chakra.effectiveMax)), 0);
  }
  const max = Math.trunc(Number(chakra.max) || 0);
  const tempMax = Math.trunc(Number(chakra.tempmax) || 0);
  return Math.max(max + tempMax, 0);
}
