/* eslint-disable jsdoc/require-jsdoc */
import { formatNumber, staticID } from "./utils.mjs";

const TextEditor = foundry.applications.ux.TextEditor.implementation;
const STATUS_ICON = "systems/n5eb/icons/svg/statuses";

/**
 * Main Book N5eB conditions keyed by canonical system id.
 * @type {Record<string, object>}
 */
export const CONDITIONS = {
  dying: {
    name: "N5EB.CONDITION.Dying",
    img: `${STATUS_ICON}/dead-outline.svg`,
    category: "death",
    statuses: ["incapacitated", "unconscious"],
    neverBlockMovement: true
  },
  incapacitated: {
    name: "N5EB.CONDITION.Incapacitated",
    img: `${STATUS_ICON}/incapacitated.svg`,
    category: "death",
    neverBlockMovement: true
  },
  exhaustion: {
    name: "N5EB.CONDITION.Exhaustion",
    img: `${STATUS_ICON}/exhaustion.svg`,
    category: "death",
    ranked: true,
    maxRank: 10,
    levels: 10,
    deathAt: 11,
    iconLevels: 6,
    reduction: { rolls: 1, speed: 5, speedInterval: 2 }
  },
  unconscious: {
    name: "N5EB.CONDITION.Unconscious",
    img: `${STATUS_ICON}/unconscious.svg`,
    category: "death",
    statuses: ["incapacitated"],
    riders: ["prone"]
  },
  petrified: {
    name: "N5EB.CONDITION.Petrified",
    img: `${STATUS_ICON}/petrified.svg`,
    category: "death",
    statuses: ["incapacitated"]
  },

  burned: {
    name: "N5EB.CONDITION.Burned",
    img: `${STATUS_ICON}/burning.svg`,
    category: "elemental",
    ranked: true,
    maxRank: 5,
    aliases: ["burning"],
    damage: { turnStart: { formula: rank => `${rank}d8`, type: "fire" } }
  },
  chilled: {
    name: "N5EB.CONDITION.Chilled",
    img: `${STATUS_ICON}/chilled.svg`,
    category: "elemental",
    ranked: true,
    maxRank: 5,
    damage: { movement: { formula: rank => `${rank}d6`, type: "cold" } }
  },
  corroded: {
    name: "N5EB.CONDITION.Corroded",
    img: `${STATUS_ICON}/corroded.svg`,
    category: "elemental",
    ranked: true,
    maxRank: 5
  },
  shocked: {
    name: "N5EB.CONDITION.Shocked",
    img: `${STATUS_ICON}/shocked.svg`,
    category: "elemental",
    ranked: true,
    maxRank: 5,
    damage: { reaction: { formula: rank => `${rank}d6`, type: "lightning" } }
  },
  envenomed: {
    name: "N5EB.CONDITION.Envenomed",
    img: `${STATUS_ICON}/poisoned.svg`,
    category: "elemental",
    ranked: true,
    maxRank: 5,
    aliases: ["poisoned", "poisoned-envenomed"],
    damage: { turnStart: { formula: rank => `${rank}d6`, type: "poison" } },
    restBlocked: true
  },

  bruised: {
    name: "N5EB.CONDITION.Bruised",
    img: `${STATUS_ICON}/bruised.svg`,
    category: "physical",
    ranked: true,
    maxRank: 5,
    overflow: { condition: "staggered", rank: 1 }
  },
  staggered: {
    name: "N5EB.CONDITION.Staggered",
    img: `${STATUS_ICON}/staggered.svg`,
    category: "physical",
    statuses: ["bruised"],
    maxRank: 1
  },
  bleeding: {
    name: "N5EB.CONDITION.Bleeding",
    img: `${STATUS_ICON}/bleeding.svg`,
    category: "physical",
    ranked: true,
    maxRank: 5,
    overflow: { condition: "lacerated", rank: 5 },
    damage: { turnStart: { formula: rank => `${rank}d4`, type: "necrotic" } },
    restBlocked: true
  },
  lacerated: {
    name: "N5EB.CONDITION.Lacerated",
    img: `${STATUS_ICON}/lacerated.svg`,
    category: "physical",
    ranked: true,
    maxRank: 100,
    statuses: ["bleeding"],
    damage: { turnStart: { formula: rank => `${rank}d6`, type: "necrotic" } },
    restBlocked: true
  },
  dazed: {
    name: "N5EB.CONDITION.Dazed",
    img: `${STATUS_ICON}/dazed.svg`,
    category: "physical"
  },
  grappled: {
    name: "N5EB.CONDITION.Grappled",
    img: `${STATUS_ICON}/grappled.svg`,
    category: "physical"
  },
  prone: {
    name: "N5EB.CONDITION.Prone",
    img: `${STATUS_ICON}/prone.svg`,
    category: "physical"
  },
  restrained: {
    name: "N5EB.CONDITION.Restrained",
    img: `${STATUS_ICON}/restrained.svg`,
    category: "physical"
  },
  stunned: {
    name: "N5EB.CONDITION.Stunned",
    img: `${STATUS_ICON}/stunned.svg`,
    category: "physical",
    statuses: ["incapacitated"]
  },
  weakened: {
    name: "N5EB.CONDITION.Weakened",
    img: `${STATUS_ICON}/weakened.svg`,
    category: "physical",
    ranked: true,
    maxRank: 5
  },

  berserk: {
    name: "N5EB.CONDITION.Berserk",
    img: `${STATUS_ICON}/berserk.svg`,
    category: "mental",
    ranked: true,
    maxRank: 5
  },
  charmed: {
    name: "N5EB.CONDITION.Charmed",
    img: `${STATUS_ICON}/charmed.svg`,
    category: "mental",
    ranked: true,
    maxRank: 5
  },
  concussed: {
    name: "N5EB.CONDITION.Concussed",
    img: `${STATUS_ICON}/concussed.svg`,
    category: "mental",
    ranked: true,
    maxRank: 5,
    restBlocked: true
  },
  confused: {
    name: "N5EB.CONDITION.Confused",
    img: `${STATUS_ICON}/confused.svg`,
    category: "mental",
    ranked: true,
    maxRank: 5
  },
  demoralized: {
    name: "N5EB.CONDITION.Demoralized",
    img: `${STATUS_ICON}/frightened.svg`,
    category: "mental",
    ranked: true,
    maxRank: 5,
    aliases: ["fear", "fear-demoralized", "frightened"]
  },
  slowed: {
    name: "N5EB.CONDITION.Slowed",
    img: `${STATUS_ICON}/slowed.svg`,
    category: "mental",
    ranked: true,
    maxRank: 5
  },
  sealed: {
    name: "N5EB.CONDITION.Sealed",
    img: `${STATUS_ICON}/sealed.svg`,
    category: "mental",
    ranked: true,
    maxRank: 5
  },

  blinded: {
    name: "N5EB.CONDITION.Blinded",
    img: `${STATUS_ICON}/blinded.svg`,
    category: "sensory",
    special: "BLIND"
  },
  dazzled: {
    name: "N5EB.CONDITION.Dazzled",
    img: `${STATUS_ICON}/dazzled.svg`,
    category: "sensory",
    ranked: true,
    maxRank: 5
  },
  deafened: {
    name: "N5EB.CONDITION.Deafened",
    img: `${STATUS_ICON}/deafened.svg`,
    category: "sensory"
  },
  invisible: {
    name: "N5EB.CONDITION.Invisible",
    img: `${STATUS_ICON}/invisible.svg`,
    category: "sensory"
  }
};

export const CONDITION_ALIASES = Object.entries(CONDITIONS).reduce((aliases, [id, config]) => {
  aliases[id] = id;
  for ( const alias of config.aliases ?? [] ) aliases[alias] = id;
  return aliases;
}, {});

const CONDITION_DAMAGE_TRAITS = {
  burned: { immunity: ["fire"] },
  chilled: { immunity: ["cold"], resistance: ["cold"] },
  shocked: { immunity: ["lightning"], resistance: ["lightning"] },
  envenomed: { immunity: ["poison"] },
  bruised: { immunity: ["bludgeoning", "earth"] }
};

let hooksRegistered = false;
const bruisedDamageUses = new Set();
const shockedReactionDamageUses = new Set();
const conditionTooltipCache = new Map();

/* -------------------------------------------- */

/**
 * Install N5eB condition configuration into the system config before status effects are built.
 * @param {object} config  CONFIG.DND5E.
 */
export function configureConditionTypes(config) {
  config.conditionAliases = { ...CONDITION_ALIASES };
  config.conditionRanks = Object.fromEntries(
    Object.entries(CONDITIONS).filter(([, data]) => data.ranked).map(([id, data]) => [id, data.maxRank])
  );

  const existing = config.conditionTypes ?? {};
  const next = { ...existing };
  for ( const id of Object.keys(next) ) {
    if ( CONDITIONS[id] || CONDITION_ALIASES[id] ) continue;
    next[id] = { ...next[id], hud: false, pseudo: true };
  }
  for ( const [id, condition] of Object.entries(CONDITIONS) ) {
    next[id] = foundry.utils.mergeObject(existing[id] ?? {}, {
      ...condition,
      id,
      hud: condition.hud ?? true,
      pseudo: false,
      maxRank: condition.maxRank ?? (condition.ranked ? 5 : 1)
    }, { inplace: false });
    delete next[id].reference;
  }

  for ( const [alias, id] of Object.entries(CONDITION_ALIASES) ) {
    if ( alias === id ) continue;
    const condition = next[id];
    next[alias] = foundry.utils.mergeObject(existing[alias] ?? {}, {
      name: condition.name,
      img: condition.img,
      alias,
      canonical: id,
      hud: false,
      pseudo: true,
      statuses: [id, ...(condition.statuses ?? [])]
    }, { inplace: false });
    delete next[alias].reference;
  }

  config.conditionTypes = next;
  config.conditionEffects.noMovement = new Set(["grappled", "petrified", "restrained", "stunned", "unconscious"]);
  config.conditionEffects.crawl = new Set(["prone", "exceedingCarryingCapacity"]);
  config.conditionEffects.abilityCheckDisadvantage = new Set();
  config.conditionEffects.attackDisadvantage = new Set();
  config.conditionEffects.dexteritySaveDisadvantage = new Set(["blinded", "restrained"]);
}

/* -------------------------------------------- */

/**
 * Register runtime hooks for condition automation.
 */
export function registerConditionHooks() {
  if ( hooksRegistered ) return;
  hooksRegistered = true;

  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.activityConsumption", onActivityConsumption);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("dnd5e.preCalculateDamage", onPreCalculateDamage);
  Hooks.on("dnd5e.postCombatRecovery", onPostCombatRecovery);
  Hooks.on("dnd5e.preShortRest", onPreRest);
  Hooks.on("dnd5e.preLongRest", onPreRest);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("updateWorldTime", onUpdateWorldTime);
}

/* -------------------------------------------- */

/**
 * Convert a status or old condition id to the canonical N5eB id.
 * @param {string} id  Candidate id.
 * @returns {string}
 */
export function canonicalizeConditionId(id) {
  if ( !id ) return id;
  id = String(id).slugify?.() ?? String(id).toLowerCase().replace(/\s+/g, "-");
  return CONDITION_ALIASES[id] ?? id;
}

/* -------------------------------------------- */

/**
 * Retrieve condition config for an id or alias.
 * @param {string} id  Condition id or alias.
 * @returns {object|null}
 */
export function getConditionConfig(id) {
  return CONDITIONS[canonicalizeConditionId(id)] ?? null;
}

/* -------------------------------------------- */

/**
 * Render tooltip HTML for an N5eB condition.
 * @param {string} id  Condition id or alias.
 * @param {object} [options]
 * @param {number} [options.rank=0]  Current rank.
 * @returns {Promise<string|null>}
 */
export async function getConditionTooltip(id, { rank=0 }={}) {
  id = canonicalizeConditionId(id);
  const condition = CONDITIONS[id];
  if ( !condition ) return null;

  const data = await getConditionTooltipData(id);
  if ( !data ) return null;

  const maxRank = condition.maxRank ?? (condition.ranked ? 5 : 1);
  const rankTag = condition.ranked
    ? `<span class="tag">Rank ${rank}/${maxRank}</span>`
    : "";
  const summary = getConditionTooltipSummary(id, Math.max(1, Number(rank) || 1))
    .map(line => `<li>${escapeHTML(line)}</li>`).join("");
  const summarySection = summary
    ? `<section class="rules"><h5>Current Effects</h5><ul>${summary}</ul></section>`
    : "";

  return `
    <section class="n5eb-condition-tooltip-content">
      <header>
        <h4>${escapeHTML(data.name)}</h4>
        <div class="tags">
          <span class="tag">Condition</span>
          ${rankTag}
        </div>
      </header>
      ${summarySection}
      <div class="description">${data.description}</div>
    </section>
  `;
}

/* -------------------------------------------- */

function getConditionTooltipSummary(id, rank) {
  const damage = CONDITIONS[id]?.damage ?? {};
  const damageLine = (trigger, label) => {
    const data = damage[trigger];
    if ( !data ) return null;
    const type = CONFIG.DND5E.damageTypes[data.type]?.label ?? data.type;
    return `${label}: ${data.formula(rank)} ${type} damage.`;
  };
  const lines = [
    ...[
      damageLine("turnStart", "Start of turn"),
      damageLine("movement", "First movement each turn"),
      damageLine("reaction", "First reaction each turn")
    ].filter(Boolean)
  ];

  switch ( id ) {
    case "exhaustion":
      lines.push(`-${rank} to AC, checks, saves, attacks, damage, and save DCs.`);
      lines.push(`Speed reduced by ${Math.floor(rank / 2) * 5} ft.`);
      break;
    case "burned":
      lines.push(`-${rank * 2} to Chakra Concentration checks.`);
      break;
    case "chilled":
      lines.push(`-${rank} to Dexterity checks and saves.`);
      lines.push(`Speed reduced by ${rank * 5} ft.`);
      break;
    case "corroded":
      lines.push(`-${rank} to Constitution checks and saves.`);
      lines.push(`Damage reduction is reduced by up to ${rank * 2} when damage is taken.`);
      break;
    case "shocked":
      lines.push(`Reaction jutsu flat check DC ${flatCheckDC(rank)}; failure doubles chakra cost.`);
      break;
    case "envenomed":
      lines.push(`-${rank} AC.`);
      lines.push("Blocks short and long rest benefits.");
      break;
    case "bruised":
      lines.push(`-${rank} to Strength, Dexterity, and Constitution checks and physical attacks.`);
      lines.push(`First qualifying bludgeoning or Earth hit each turn deals +${rank * 4} damage.`);
      lines.push("Above rank 5 converts to Staggered.");
      break;
    case "staggered":
      lines.push("-5 to Strength, Dexterity, and Constitution checks and physical attacks.");
      lines.push("First qualifying bludgeoning or Earth hit each turn deals +20 damage.");
      lines.push("Warns before Dash, Disengage, Dodge, and reactions.");
      break;
    case "bleeding":
      lines.push("Blocks short and long rest benefits.");
      lines.push("Above rank 5 converts to Lacerated 5.");
      break;
    case "lacerated":
      lines.push("Gains 1 rank at the end of each turn.");
      lines.push("Blocks short and long rest benefits.");
      break;
    case "dazed":
      lines.push("Warns if movement and action limits are exceeded.");
      lines.push("Expires at the end of the affected creature's next turn.");
      break;
    case "weakened":
      lines.push(`-${rank} to Strength saves.`);
      lines.push(`-${rank * 4} damage on jutsu and activity damage where supported.`);
      break;
    case "berserk":
      lines.push(`-${rank} to Charisma checks and Charisma attacks.`);
      lines.push("Warns before resolving target/action restrictions.");
      lines.push("Loses 1 rank at the end of each turn.");
      break;
    case "charmed":
      lines.push(`-${rank * 2} to Intelligence and Wisdom checks against the infatuation source.`);
      lines.push("Warns before hostile actions.");
      break;
    case "concussed":
      lines.push(`-${rank} to Intelligence checks, Intelligence saves, Intelligence attacks, and save DCs.`);
      lines.push("Blocks short and long rest benefits.");
      break;
    case "confused":
      lines.push(`-${rank} to Wisdom checks, Wisdom saves, and Wisdom attacks.`);
      lines.push(`Targeting flat check DC ${flatCheckDC(rank)} warning.`);
      break;
    case "demoralized":
      lines.push(`-${rank} to saving throws.`);
      lines.push("Triggers Chakra Concentration checks at turn start.");
      lines.push("End-turn DC 13 Charisma check removes 1 rank on success.");
      break;
    case "slowed":
      lines.push(`Speed reduced by ${rank * 10} ft.`);
      lines.push("Warns before repeated attacks or jutsu in the same turn.");
      break;
    case "sealed":
      lines.push(`Ninjutsu and Genjutsu cost +${rank * 2} chakra.`);
      lines.push(`-${rank} to Ninjutsu and Genjutsu save DCs.`);
      break;
    case "blinded":
      lines.push("Attack rolls have disadvantage; attacks against the creature have advantage where target context exists.");
      lines.push("Dexterity saves have disadvantage; sight-required actions warn.");
      break;
    case "dazzled":
      lines.push(`-${rank * 2} to attacks and sight-based checks.`);
      lines.push(`Ranged attack/jutsu range reduced by ${rank * 15} ft, minimum 5 ft where supported.`);
      break;
    case "deafened":
      lines.push("-10 to Perception checks.");
      lines.push("Wisdom checks/saves and Wisdom attacks have disadvantage where supported.");
      lines.push("Hearing-required actions warn.");
      break;
  }

  if ( CONDITIONS[id]?.restBlocked && !lines.some(line => line.includes("rest")) ) {
    lines.push("Blocks short and long rest benefits.");
  }
  return lines;
}

/* -------------------------------------------- */

async function getConditionTooltipData(id) {
  id = canonicalizeConditionId(id);
  if ( conditionTooltipCache.has(id) ) return conditionTooltipCache.get(id);

  const pack = game.packs.get("n5eb.conditions");
  if ( !pack ) {
    conditionTooltipCache.set(id, null);
    return null;
  }

  const index = await pack.getIndex({ fields: ["name", "system.identifier"] });
  const entry = Array.from(index).find(entry => {
    const identifier = foundry.utils.getProperty(entry, "system.identifier");
    return canonicalizeConditionId(identifier ?? entry.name) === id;
  });

  if ( !entry ) {
    conditionTooltipCache.set(id, null);
    return null;
  }

  const document = await pack.getDocument(entry._id);
  const rawDescription = document.system.description?.value
    || document.effects.find(effect => effect.description)?.description
    || fallbackConditionDescription(id);
  const description = await TextEditor.enrichHTML(rawDescription, {
    relativeTo: document
  });
  const data = { name: document.name, description };
  conditionTooltipCache.set(id, data);
  return data;
}

/* -------------------------------------------- */

function escapeHTML(value) {
  return Handlebars.escapeExpression(value);
}

/* -------------------------------------------- */

function fallbackConditionDescription(id) {
  const name = game.i18n.localize(CONDITIONS[id]?.name ?? id);
  return `<p>No N5eB compendium description is available for <strong>${escapeHTML(name)}</strong> yet.</p>`;
}

/* -------------------------------------------- */

/**
 * Determine the static effect id for a condition.
 * @param {string} id  Condition id.
 * @returns {string}
 */
export function conditionEffectId(id) {
  return staticID(`dnd5e${canonicalizeConditionId(id)}`);
}

/* -------------------------------------------- */

/**
 * Build ActiveEffect source data for a condition.
 * @param {string} id          Condition id.
 * @param {object} [options]
 * @param {number} [options.rank=1]  Starting rank.
 * @param {string} [options.origin]  Effect origin.
 * @param {object} [options.duration]  Effect duration data.
 * @returns {object}
 */
export function createConditionEffectData(id, { rank=1, origin, duration }={}) {
  id = canonicalizeConditionId(id);
  const condition = CONDITIONS[id];
  if ( !condition ) throw new Error(`Unknown N5eB condition: ${id}`);
  rank = normalizeConditionRank(id, rank);
  const name = conditionName(id, rank);
  const automation = getConditionAutomationData(id);
  const data = {
    _id: conditionEffectId(id),
    name,
    img: condition.img,
    origin,
    transfer: false,
    statuses: [id, ...(condition.statuses ?? [])],
    flags: {
      n5eb: {
        isTemporary: true,
        condition: {
          id,
          rank,
          maxRank: condition.maxRank ?? 1,
          category: condition.category,
          source: "main-book",
          ...(foundry.utils.isEmpty(automation) ? {} : { automation })
        }
      }
    }
  };
  if ( id === "exhaustion" ) data.flags.n5eb.exhaustionLevel = rank;
  if ( duration ) data.duration = foundry.utils.deepClone(duration);
  return data;
}

/* -------------------------------------------- */

/**
 * Build automation metadata for a newly applied condition.
 * @param {string} id  Condition id.
 * @returns {object}
 */
export function getConditionAutomationData(id) {
  id = canonicalizeConditionId(id);
  if ( (id !== "dazed") || !game.combat ) return {};
  return {
    appliedCombat: game.combat.id,
    appliedTurnKey: getTurnKey()
  };
}

/* -------------------------------------------- */

/**
 * Prepare a condition ActiveEffect after Foundry has built its statuses.
 * @param {ActiveEffect} effect  Effect being prepared.
 */
export function prepareConditionEffect(effect) {
  const id = getEffectConditionId(effect);
  if ( !id || (id === "exhaustion") ) return;
  const condition = CONDITIONS[id];
  const rank = getEffectConditionRank(effect);
  effect.statuses.add(id);
  for ( const status of condition.statuses ?? [] ) effect.statuses.add(status);
  effect.name = conditionName(id, rank);
  effect.img = condition.img;
}

/* -------------------------------------------- */

/**
 * Determine the canonical condition id represented by an ActiveEffect.
 * @param {ActiveEffect|object} effect  Effect data.
 * @returns {string|null}
 */
export function getEffectConditionId(effect) {
  const flagged = effect.getFlag?.("n5eb", "condition.id")
    ?? foundry.utils.getProperty(effect, "flags.n5eb.condition.id");
  if ( flagged ) {
    const id = canonicalizeConditionId(flagged);
    if ( CONDITIONS[id] ) return id;
  }

  const statuses = effect.statuses instanceof Set ? effect.statuses : new Set(effect.statuses ?? []);
  for ( const status of statuses ) {
    const id = canonicalizeConditionId(status);
    if ( CONDITIONS[id] ) return id;
  }
  return null;
}

/* -------------------------------------------- */

/**
 * Determine a condition rank from an ActiveEffect.
 * @param {ActiveEffect|object} effect  Effect data.
 * @returns {number}
 */
export function getEffectConditionRank(effect) {
  const id = getEffectConditionId(effect);
  const condition = CONDITIONS[id];
  if ( !condition?.ranked ) return 1;
  const rank = effect.getFlag?.("n5eb", "condition.rank")
    ?? foundry.utils.getProperty(effect, "flags.n5eb.condition.rank")
    ?? effect.getFlag?.("n5eb", "exhaustionLevel")
    ?? foundry.utils.getProperty(effect, "flags.n5eb.exhaustionLevel")
    ?? 1;
  return normalizeConditionRank(id, rank);
}

/* -------------------------------------------- */

/**
 * Build a display name for a condition and rank.
 * @param {string} id      Condition id.
 * @param {number} [rank]  Condition rank.
 * @returns {string}
 */
export function conditionName(id, rank=1) {
  const condition = CONDITIONS[id];
  const label = game.i18n.localize(condition?.name ?? id);
  return condition?.ranked && (rank > 1) ? `${label} ${rank}` : label;
}

/* -------------------------------------------- */

/**
 * Clamp a ranked condition to its valid rank range.
 * @param {string} id      Condition id.
 * @param {number} rank    Desired rank.
 * @returns {number}
 */
export function normalizeConditionRank(id, rank) {
  const condition = CONDITIONS[canonicalizeConditionId(id)];
  const max = condition?.ranked ? condition.maxRank : 1;
  return Math.clamp(Math.floor(Number(rank) || 0), 0, max ?? 1);
}

/* -------------------------------------------- */

/**
 * Check actor condition immunity.
 * @param {Actor5e} actor  Actor.
 * @param {string} id      Condition id.
 * @returns {boolean}
 */
export function hasConditionImmunity(actor, id) {
  id = canonicalizeConditionId(id);
  const immunities = traitValues(actor, "ci");
  if ( immunities.has(id) ) return true;
  if ( Object.entries(CONDITION_ALIASES).some(([alias, canonical]) => (canonical === id) && immunities.has(alias)) ) {
    return true;
  }
  return hasLinkedDamageTrait(actor, id, "di");
}

/* -------------------------------------------- */

/**
 * Check actor condition resistance from linked damage resistance.
 * @param {Actor5e} actor  Actor.
 * @param {string} id      Condition id.
 * @returns {boolean}
 */
export function hasConditionResistance(actor, id) {
  id = canonicalizeConditionId(id);
  if ( hasConditionImmunity(actor, id) ) return false;
  return hasLinkedDamageTrait(actor, id, "dr");
}

/* -------------------------------------------- */

/**
 * Adjust incoming condition ranks based on condition-linked damage resistance.
 * @param {Actor5e} actor  Actor receiving the condition.
 * @param {string} id      Condition id.
 * @param {number} rank    Incoming rank amount.
 * @returns {number}
 */
export function adjustConditionApplicationRank(actor, id, rank) {
  rank = Math.floor(Number(rank) || 0);
  if ( rank <= 0 ) return rank;
  id = canonicalizeConditionId(id);
  if ( hasConditionImmunity(actor, id) ) return 0;
  if ( hasConditionResistance(actor, id) ) return Math.max(1, Math.floor(rank / 2));
  return rank;
}

/* -------------------------------------------- */

function hasLinkedDamageTrait(actor, id, trait) {
  const links = CONDITION_DAMAGE_TRAITS[id]?.[trait === "di" ? "immunity" : "resistance"];
  if ( !links?.length ) return false;
  const values = traitValues(actor, trait);
  if ( values.has("all") ) return true;
  return links.some(type => values.has(type));
}

/* -------------------------------------------- */

function traitValues(actor, trait) {
  const value = actor.system.traits?.[trait]?.value;
  const values = value instanceof Set ? Array.from(value)
    : Array.isArray(value) ? value
      : Object.values(value ?? {});
  return new Set(values.filter(v => typeof v === "string").map(v => v.toLowerCase()));
}

/* -------------------------------------------- */

/**
 * Add roll penalties from ranked conditions.
 * @param {Actor5e} actor  Actor.
 * @param {string[]} parts Roll parts.
 * @param {object} data    Roll data.
 * @param {object} context Roll context.
 */
export function addConditionRollPenalties(actor, parts, data, context={}) {
  if ( !actor ) return;
  const ability = context.ability;
  const type = context.type;
  let penalty = 0;

  const rank = id => actor.getConditionRank?.(id) ?? 0;
  const physicalAbility = ["str", "dex", "con"].includes(ability);

  if ( context.isConcentration ) penalty += rank("burned") * 2;
  if ( (type === "check") || (type === "save") ) {
    if ( ability === "dex" ) penalty += rank("chilled");
    if ( ability === "con" ) penalty += rank("corroded");
    if ( ability === "int" ) penalty += rank("concussed");
    if ( ability === "wis" ) penalty += rank("confused");
    if ( ability === "cha" ) penalty += rank("berserk");
  }
  if ( type === "check" ) {
    if ( physicalAbility ) penalty += rank("bruised") + (rank("staggered") ? 5 : 0);
    if ( context.sight ) penalty += rank("dazzled") * 2;
    if ( context.skill === "prc" ) penalty += rank("deafened") * 10;
    if ( ["int", "wis"].includes(ability) && isCharmedInfatuationContext(actor, context) ) {
      penalty += rank("charmed") * 2;
    }
  }
  if ( type === "save" ) {
    if ( ability === "str" ) penalty += rank("weakened");
    penalty += rank("demoralized");
  }
  if ( type === "attack" ) {
    if ( physicalAbility ) penalty += rank("bruised") + (rank("staggered") ? 5 : 0);
    if ( ability === "cha" ) penalty += rank("berserk");
    if ( ability === "int" ) penalty += rank("concussed");
    if ( ability === "wis" ) penalty += rank("confused");
    penalty += rank("dazzled") * 2;
  }

  if ( penalty <= 0 ) return;
  parts.push("@conditionPenalty");
  data.conditionPenalty = (data.conditionPenalty ?? 0) - penalty;
}

/* -------------------------------------------- */

function isCharmedInfatuationContext(actor, context) {
  if ( !actor.getConditionRank?.("charmed") ) return false;
  if ( context.infatuation ) return true;
  const targetUuid = context.targetUuid ?? context.target?.uuid ?? context.targetActor?.uuid;
  if ( !targetUuid ) return false;
  const effect = actor.getConditionEffect?.("charmed");
  const sourceUuid = effect?.origin ?? foundry.utils.getProperty(effect, "flags.n5eb.condition.sourceUuid");
  return sourceUuid && (sourceUuid === targetUuid);
}

/* -------------------------------------------- */

/**
 * Determine damage penalty from conditions.
 * @param {Actor5e} actor  Actor.
 * @param {object} context Damage context.
 * @returns {number}
 */
export function getConditionDamagePenalty(actor, context={}) {
  if ( !actor ) return 0;
  const weakened = actor.getConditionRank?.("weakened") ?? 0;
  if ( !weakened ) return 0;
  if ( context.activity || context.item?.type === "spell" ) return weakened * 4;
  return 0;
}

/* -------------------------------------------- */

/**
 * Determine save DC penalty from conditions.
 * @param {Actor5e} actor  Actor.
 * @param {object} context DC context.
 * @returns {number}
 */
export function getConditionDCPenalty(actor, context={}) {
  if ( !actor ) return 0;
  let penalty = actor.getExhaustionPenalty?.() ?? 0;
  penalty += actor.getConditionRank?.("concussed") ?? 0;
  const jutsuType = context.item?.system?.jutsuCastingType;
  if ( ["ninjutsu", "genjutsu"].includes(jutsuType) ) penalty += actor.getConditionRank?.("sealed") ?? 0;
  return penalty;
}

/* -------------------------------------------- */

/**
 * Get AC penalty from current conditions.
 * @param {Actor5e} actor  Actor.
 * @returns {number}
 */
export function getConditionACPenalty(actor) {
  return actor.getConditionRank?.("envenomed") ?? 0;
}

/* -------------------------------------------- */

/**
 * Get movement speed reduction from current conditions in feet.
 * @param {Actor5e} actor  Actor.
 * @returns {number}
 */
export function getConditionSpeedReduction(actor) {
  return ((actor.getConditionRank?.("chilled") ?? 0) * 5) + ((actor.getConditionRank?.("slowed") ?? 0) * 10);
}

/* -------------------------------------------- */

/**
 * Get additional chakra cost caused by Sealed.
 * @param {Actor5e} actor        Actor.
 * @param {string|null} jutsuType  Jutsu casting type.
 * @returns {number}
 */
export function getConditionChakraCostIncrease(actor, jutsuType) {
  if ( !["ninjutsu", "genjutsu"].includes(jutsuType) ) return 0;
  return (actor?.getConditionRank?.("sealed") ?? 0) * 2;
}

/* -------------------------------------------- */

/**
 * Apply condition advantage/disadvantage to attack roll options.
 * @param {Activity} activity  Attack activity.
 * @param {object} options     Roll options to mutate.
 */
export function applyAttackConditionOptions(activity, options) {
  const actor = activity.actor;
  if ( !actor ) return;
  if ( actor.getConditionRank?.("blinded") ) options.disadvantage = true;
  if ( actor.getConditionRank?.("deafened") && ((activity.ability ?? activity.attack?.ability) === "wis") ) {
    options.disadvantage = true;
  }
  if ( Array.from(game.user?.targets ?? []).some(token => token.actor?.getConditionRank?.("blinded")) ) {
    options.advantage = true;
  }
}

/* -------------------------------------------- */

/**
 * Conditions currently preventing short and long rest benefits.
 * @param {Actor5e} actor  Actor.
 * @returns {string[]}
 */
export function getRestBlockingConditions(actor) {
  return Object.entries(CONDITIONS).reduce((arr, [id, config]) => {
    if ( config.restBlocked && actor.getConditionRank?.(id) ) arr.push(game.i18n.localize(config.name));
    return arr;
  }, []);
}

/* -------------------------------------------- */

function onPreUseActivity(activity, usageConfig) {
  const actor = activity.actor;
  if ( !actor ) return;
  warnActivityRestrictions(actor, activity, usageConfig);
  checkShockedReaction(actor, activity, usageConfig);
}

/* -------------------------------------------- */

function onActivityConsumption(activity, usageConfig, messageConfig, updates) {
  const multiplier = usageConfig.n5eb?.shockedCostMultiplier;
  if ( !multiplier || !activity.isSpell || !((usageConfig.consume === true) || usageConfig.consume?.chakra) ) return;

  const rank = usageConfig.jutsu?.rank ?? activity.item.system.effectiveRank;
  const baseCost = usageConfig.chakra?.cost ?? activity.item.system.getChakraCost({ rank });
  const totalCost = baseCost * multiplier;
  const extra = totalCost - baseCost;
  const chakra = activity.actor.system.attributes.chakra;
  const available = activity.actor.getChakraAvailable?.() ?? ((chakra?.temp ?? 0) + (chakra?.value ?? 0));
  if ( extra <= 0 ) return;
  if ( available < totalCost ) {
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.ShockedInsufficient", {
      name: activity.item.name,
      cost: formatNumber(totalCost),
      available: formatNumber(available)
    }));
    return false;
  }

  usageConfig.chakra.cost = totalCost;
  usageConfig.chakra.maintain = activity.item.system.getMaintainCost({ rank, cost: totalCost });
  foundry.utils.setProperty(messageConfig, "data.system.chakraCost", usageConfig.chakra.cost);
  foundry.utils.setProperty(messageConfig, "data.system.maintainCost", usageConfig.chakra.maintain);
  foundry.utils.mergeObject(updates.actor, activity.actor.getChakraSpendUpdates?.(extra, updates.actor) ?? {
    "system.attributes.chakra.value": Math.max((updates.actor["system.attributes.chakra.value"] ?? chakra.value) - extra, 0)
  });
}

/* -------------------------------------------- */

function onPostUseActivity(activity) {
  const actor = activity.actor;
  if ( !actor?.isOwner ) return;
  if ( activity.activation?.type === "reaction" ) void applyShockedReactionDamage(actor);
  const updates = {};
  if ( activity.type === "attack" ) updates.attack = true;
  if ( activity.isSpell ) updates.jutsu = true;
  if ( foundry.utils.isEmpty(updates) ) return;
  updateTurnState(actor, updates);
}

/* -------------------------------------------- */

function onPreCalculateDamage(actor, damages, options={}) {
  applyBruisedBonusDamage(actor, damages, options);
  applyCorrodedDamagePenalty(actor, damages);
}

/* -------------------------------------------- */

async function onPostCombatRecovery(combatant, periods) {
  const actor = combatant.actor;
  if ( !actor || !isResponsibleUser(actor) ) return;
  if ( periods.includes("turnStart") ) await applyTurnStartConditions(actor, { combat: combatant.combat, combatant });
  if ( periods.includes("turnEnd") ) await applyTurnEndConditions(actor, { combat: combatant.combat, combatant });
}

/* -------------------------------------------- */

function onPreRest(actor) {
  const blocked = getRestBlockingConditions(actor);
  if ( !blocked.length ) return;
  ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.RestBlocked", {
    actor: actor.name,
    conditions: game.i18n.getListFormatter({ type: "conjunction" }).format(blocked)
  }));
  return false;
}

/* -------------------------------------------- */

async function onRestCompleted(actor, result, config) {
  if ( config.type !== "full" || !actor.isOwner ) return;
  const ids = Object.entries(CONDITIONS).filter(([, condition]) => condition.restBlocked).map(([id]) => id);
  for ( const id of ids ) {
    if ( actor.getConditionRank(id) ) await actor.updateConditionRank(id, 0);
  }
}

/* -------------------------------------------- */

async function onUpdateToken(token, changed, options, userId) {
  if ( userId !== game.userId || !("x" in changed || "y" in changed) ) return;
  const actor = token.actor;
  if ( !actor?.isOwner ) return;

  const state = getTurnState(actor);
  if ( actor.getConditionRank("dazed") && state.acted ) {
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.DazedMove", { actor: actor.name }));
  }

  if ( actor.getConditionRank("chilled") && !state.chilledMove ) {
    await applyConditionDamage(actor, "chilled", "movement");
    await updateTurnState(actor, { chilledMove: true });
  }
  await updateTurnState(actor, { moved: true });
}

/* -------------------------------------------- */

async function onUpdateWorldTime(worldTime, dt) {
  if ( !isResponsibleGM() || dt <= 0 ) return;
  for ( const actor of game.actors ) {
    if ( actor.getConditionRank("envenomed") && crossedInterval(worldTime, dt, 3600) ) {
      await applyConditionDamage(actor, "envenomed", "turnStart");
    }
    if ( actor.getConditionRank("bleeding") && crossedInterval(worldTime, dt, 600) ) {
      await applyConditionDamage(actor, "bleeding", "turnStart");
    }
    if ( actor.getConditionRank("lacerated") && crossedInterval(worldTime, dt, 600) ) {
      await applyConditionDamage(actor, "lacerated", "turnStart");
    }
  }
}

/* -------------------------------------------- */

async function applyTurnStartConditions(actor, { combat, combatant }={}) {
  await updateTurnState(actor, { key: getTurnKey(combat, combatant), moved: false, acted: false, attack: false,
    jutsu: false, chilledMove: false });
  for ( const id of ["burned", "envenomed", "bleeding", "lacerated"] ) {
    await applyConditionDamage(actor, id, "turnStart");
  }
  if ( actor.getConditionRank("demoralized") ) await actor.challengeConcentration?.({ dc: actor.getConcentrationDC(0) });
}

/* -------------------------------------------- */

async function applyTurnEndConditions(actor, { combat, combatant }={}) {
  const berserk = actor.getConditionRank("berserk");
  if ( berserk ) await actor.updateConditionRank("berserk", berserk - 1);

  const lacerated = actor.getConditionRank("lacerated");
  if ( lacerated ) await actor.updateConditionRank("lacerated", lacerated + 1);

  const demoralized = actor.getConditionRank("demoralized");
  if ( demoralized ) {
    const roll = new CONFIG.Dice.D20Roll("1d20 + @mod", { mod: actor.system.abilities?.cha?.mod ?? 0 }, { target: 13 });
    await roll.evaluate();
    await roll.toMessage({
      flavor: game.i18n.localize("N5EB.CONDITION.Roll.Demoralized"),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    if ( roll.total >= 13 ) await actor.updateConditionRank("demoralized", demoralized - 1);
  }

  await expireDazedAtTurnEnd(actor, { combat, combatant });
}

/* -------------------------------------------- */

async function expireDazedAtTurnEnd(actor, { combat, combatant }={}) {
  const effect = actor.getConditionEffect?.("dazed");
  if ( !effect ) return;
  const currentKey = actor.getFlag("n5eb", "conditionTurn")?.key ?? getTurnKey(combat, combatant);
  const appliedKey = effect.getFlag("n5eb", "condition.automation.appliedTurnKey")
    ?? foundry.utils.getProperty(effect, "flags.n5eb.condition.automation.appliedTurnKey");
  if ( appliedKey === currentKey ) return;
  await actor.updateConditionRank("dazed", 0);
}

/* -------------------------------------------- */

async function applyConditionDamage(actor, id, trigger) {
  const rank = actor.getConditionRank(id);
  const damage = CONDITIONS[id]?.damage?.[trigger];
  if ( !rank || !damage ) return;
  const roll = new Roll(damage.formula(rank));
  await roll.evaluate();
  await roll.toMessage({
    flavor: game.i18n.format("N5EB.CONDITION.Damage", {
      condition: game.i18n.localize(CONDITIONS[id].name),
      damage: CONFIG.DND5E.damageTypes[damage.type]?.label ?? damage.type
    }),
    speaker: ChatMessage.getSpeaker({ actor })
  });
  await actor.applyDamage([{ value: roll.total, type: damage.type, properties: new Set() }], {
    ignore: { modification: true, threshold: true },
    isDelta: true,
    n5eb: { condition: id }
  });
}

/* -------------------------------------------- */

async function applyShockedReactionDamage(actor) {
  const rank = actor.getConditionRank("shocked");
  if ( !rank ) return;
  const turnKey = game.combat ? getTurnKey() : game.time.worldTime;
  const key = `${actor.uuid}.${turnKey}.shockedReactionDamage`;
  if ( shockedReactionDamageUses.has(key) ) return;
  shockedReactionDamageUses.add(key);
  await applyConditionDamage(actor, "shocked", "reaction");
}

/* -------------------------------------------- */

function applyBruisedBonusDamage(actor, damages, options) {
  const staggered = actor.getConditionRank?.("staggered") ?? 0;
  const bruised = actor.getConditionRank?.("bruised") ?? 0;
  const bonus = staggered ? 20 : bruised * 4;
  if ( bonus <= 0 || options.n5eb?.condition === "bruised" ) return;

  const qualifying = damages.find(d => damageQualifiesForBruised(d, options));
  if ( !qualifying ) return;

  const key = `${actor.uuid}.${getTurnKey()}.bruisedDamage`;
  if ( bruisedDamageUses.has(key) ) return;
  bruisedDamageUses.add(key);

  qualifying.value += bonus;
  qualifying.active ??= {};
  qualifying.active.n5ebBruisedBonus = bonus;
}

/* -------------------------------------------- */

function applyCorrodedDamagePenalty(actor, damages) {
  const corroded = actor.getConditionRank?.("corroded") ?? 0;
  if ( !corroded ) return;
  const penalty = corroded * 2;
  const reduction = Math.abs(Math.min(0, Number(actor.system.traits?.dm?.amount?.ALL) || 0));
  if ( !reduction ) return;
  for ( const damage of damages ) {
    if ( damage.value <= 0 || (damage.type in CONFIG.DND5E.healingTypes) ) continue;
    const extra = Math.min(penalty, reduction);
    damage.value += extra;
    damage.active ??= {};
    damage.active.n5ebCorrodedDR = extra;
    break;
  }
}

/* -------------------------------------------- */

function damageQualifiesForBruised(damage, options) {
  if ( damage.value <= 0 ) return false;
  if ( damage.type === "bludgeoning" || damage.type === "earth" ) return true;
  const properties = damage.properties instanceof Set ? damage.properties : new Set(damage.properties ?? []);
  if ( properties.has("earth") ) return true;
  const item = options.originatingMessage?.getAssociatedItem?.();
  const keywords = item?.system?.jutsu?.keywords;
  return keywords?.has?.("earth") || keywords?.includes?.("earth");
}

/* -------------------------------------------- */

function warnActivityRestrictions(actor, activity, usageConfig) {
  const state = getTurnState(actor);
  if ( actor.getConditionRank("berserk") ) {
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.Berserk", { actor: actor.name }));
  }
  if ( actor.getConditionRank("charmed") && isHostileActivity(activity) ) {
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.Charmed", { actor: actor.name }));
  }
  if ( actor.getConditionRank("confused") ) {
    const dc = flatCheckDC(actor.getConditionRank("confused"));
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.Confused", { actor: actor.name, dc }));
  }
  if ( actor.getConditionRank("dazed") ) {
    if ( state.moved ) ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.DazedAction", {
      actor: actor.name
    }));
    if ( activity.activation?.type === "bonus" ) ui.notifications.warn(game.i18n.format(
      "N5EB.CONDITION.Warning.DazedBonus", { actor: actor.name }
    ));
  }
  if ( actor.getConditionRank("slowed") && ((activity.type === "attack" && state.attack)
    || (activity.isSpell && state.jutsu)) ) {
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.Slowed", { actor: actor.name }));
  }
  if ( actor.getConditionRank("staggered") && isStaggeredRestrictedActivity(activity) ) {
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.Staggered", { actor: actor.name }));
  }
  if ( actor.getConditionRank("blinded") && activityRequiresSight(activity) ) {
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.Blinded", { actor: actor.name }));
  }
  if ( actor.getConditionRank("deafened") && activityRequiresHearing(activity) ) {
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.Deafened", { actor: actor.name }));
  }
  const dazzled = actor.getConditionRank("dazzled");
  const rangeLimit = getDazzledRangeLimit(activity, dazzled);
  if ( rangeLimit ) {
    usageConfig.n5eb ??= {};
    usageConfig.n5eb.dazzledRangeLimit = rangeLimit;
    ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.DazzledRange", {
      actor: actor.name,
      range: formatNumber(rangeLimit)
    }));
  }
}

/* -------------------------------------------- */

function isHostileActivity(activity) {
  if ( activity.type === "attack" ) return true;
  const affects = activity.target?.affects;
  if ( affects?.type && (affects.type !== "self") ) return true;
  return activity.damage?.parts?.length > 0;
}

/* -------------------------------------------- */

function activityRequiresSight(activity) {
  if ( activity.type === "attack" ) return true;
  if ( activity.isSpell && (activity.range?.units !== "self") ) return true;
  return !!activity.target?.template?.type;
}

/* -------------------------------------------- */

function activityRequiresHearing(activity) {
  const text = `${activity.name ?? ""} ${activity.activation?.condition ?? ""} ${activity.item?.name ?? ""}`.slugify();
  return ["hear", "hearing", "sound", "auditory"].some(term => text.includes(term));
}

/* -------------------------------------------- */

function getDazzledRangeLimit(activity, rank) {
  if ( !rank || !activity?.range ) return null;
  if ( !["ft", "feet"].includes(activity.range.units) ) return null;
  const base = Number(activity.range.value ?? activity.range.long ?? 0);
  if ( !base || activity.range.units === "self" ) return null;
  const limit = Math.max(5, base - (rank * 15));
  return limit < base ? limit : null;
}

/* -------------------------------------------- */

function checkShockedReaction(actor, activity, usageConfig) {
  const rank = actor.getConditionRank("shocked");
  if ( !rank || !activity.isSpell || (activity.activation?.type !== "reaction") ) return;
  const dc = flatCheckDC(rank);
  const roll = new CONFIG.Dice.D20Roll("1d20", {}, {
    target: dc,
    advantage: hasConditionResistance(actor, "shocked")
  });
  roll.evaluateSync();
  roll.toMessage({
    flavor: game.i18n.format("N5EB.CONDITION.Roll.Shocked", { dc }),
    speaker: ChatMessage.getSpeaker({ actor })
  });
  if ( roll.total >= dc ) return;
  usageConfig.n5eb ??= {};
  usageConfig.n5eb.shockedCostMultiplier = 2;
  ui.notifications.warn(game.i18n.format("N5EB.CONDITION.Warning.ShockedFailed", {
    actor: actor.name,
    dc
  }));
}

/* -------------------------------------------- */

function flatCheckDC(rank) {
  return Math.min(12, 8 + Math.max(0, rank - 1));
}

/* -------------------------------------------- */

function isStaggeredRestrictedActivity(activity) {
  if ( activity.activation?.type === "reaction" ) return true;
  const id = `${activity.id ?? ""} ${activity.identifier ?? ""} ${activity.name ?? ""}`.slugify();
  return ["dash", "disengage", "dodge"].some(action => id.includes(action));
}

/* -------------------------------------------- */

function getTurnKey(combat=game.combat, combatant=game.combat?.combatant) {
  if ( !combat ) return `${game.time.worldTime}.${Date.now()}`;
  return [combat.id, combat.round ?? 0, combat.turn ?? 0, combatant?.id ?? ""].join(".");
}

/* -------------------------------------------- */

function getTurnState(actor) {
  const state = actor.getFlag("n5eb", "conditionTurn") ?? {};
  const key = getTurnKey();
  return state.key === key ? state : { key };
}

/* -------------------------------------------- */

async function updateTurnState(actor, update) {
  const state = { ...getTurnState(actor), ...update };
  state.key ??= getTurnKey();
  return actor.setFlag("n5eb", "conditionTurn", state);
}

/* -------------------------------------------- */

function crossedInterval(worldTime, dt, interval) {
  return Math.floor(worldTime / interval) > Math.floor((worldTime - dt) / interval);
}

/* -------------------------------------------- */

function isResponsibleGM() {
  return game.user?.isGM && (game.user === game.users.activeGM);
}

/* -------------------------------------------- */

function isResponsibleUser(actor) {
  return isResponsibleGM() || (!game.users.activeGM && actor.isOwner);
}
