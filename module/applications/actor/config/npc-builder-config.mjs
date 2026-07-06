import AdversaryBuilderConfig from "./adversary-builder-config.mjs";
import SummonBuilderConfig from "./summon-builder-config.mjs";

/**
 * User-facing NPC builder entry point that routes to the correct builder mode.
 */
export default class NpcBuilderConfig {
  /**
   * Create the mode-specific NPC builder application.
   * @param {object} options           Application construction options.
   * @param {Actor5e} options.document Actor being configured.
   * @param {string} [options.mode]    Requested builder mode.
   * @returns {AdversaryBuilderConfig|SummonBuilderConfig}
   */
  static create(options={}) {
    const mode = options.mode ?? getDefaultBuilderMode(options.document);
    const Builder = mode === "summon" ? SummonBuilderConfig : AdversaryBuilderConfig;
    return new Builder(options);
  }
}

/**
 * Get the initial NPC builder mode for an actor.
 * @param {Actor5e} actor  Actor being configured.
 * @returns {string}
 */
function getDefaultBuilderMode(actor) {
  if ( actor?.system.details.summon?.enabled ) return "summon";
  return "adversary";
}
