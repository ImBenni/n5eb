const LEGACY_ATTACK_ACTION_TYPES = Object.freeze({
  mgak: "msak",
  mnak: "msak",
  mtak: "msak",
  rgak: "rsak",
  rnak: "rsak",
  rtak: "rsak"
});

/**
 * Normalize legacy N5eB attack action types to their canonical Foundry v14 equivalents.
 * @param {string} actionType  Candidate action type.
 * @returns {string}           Canonical action type, or the unchanged input when it is not a legacy alias.
 */
export function normalizeAttackActionType(actionType) {
  return LEGACY_ATTACK_ACTION_TYPES[actionType] ?? actionType;
}
