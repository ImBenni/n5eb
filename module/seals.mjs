/* eslint-disable jsdoc/require-jsdoc */

import { formatIdentifier } from "./utils.mjs";

export const ARMOR_PROPERTY_ALIASES = {
  stealthDisadvantage: "bulky",
  stealthdisadvantage: "bulky",
  bulky: "bulky",
  bulwark: "bulwark",
  camo: "camouflage",
  camouflage: "camouflage",
  fashion: "fashionable",
  fashionable: "fashionable",
  fortified: "fortified",
  heavyweight: "heavyweight",
  highquality: "highQuality",
  highQuality: "highQuality",
  lightweight: "lightweight",
  reinforced: "reinforced",
  threatening: "threatening"
};

export const ARMOR_PROPERTIES = new Set([
  "bulky", "bulwark", "camouflage", "fashionable", "fortified", "heavyweight",
  "highQuality", "lightweight", "reinforced", "threatening"
]);

export const SEAL_RANKS = {
  d: { label: "N5EB.SEAL.Rank.D", slots: 1, level: 1, craftingDC: 14, downtime: 2 },
  c: { label: "N5EB.SEAL.Rank.C", slots: 2, level: 5, craftingDC: 18, downtime: 4 },
  b: { label: "N5EB.SEAL.Rank.B", slots: 3, level: 9, craftingDC: 22, downtime: 8 },
  a: { label: "N5EB.SEAL.Rank.A", slots: 4, level: 13, craftingDC: 26, downtime: 12 },
  s: { label: "N5EB.SEAL.Rank.S", slots: 5, level: 17, craftingDC: 30, downtime: 20 }
};

export const SEAL_TIER_RANKS = {
  minor: "d",
  refined: "c",
  greater: "b",
  superior: "a",
  mastercraft: "s"
};

export const SEAL_QUALITY_SLOTS = {
  standard: { label: "N5EB.SEAL.Quality.Standard", slots: 3 },
  greater: { label: "N5EB.SEAL.Quality.Greater", slots: 5 },
  superior: { label: "N5EB.SEAL.Quality.Superior", slots: 7 },
  supreme: { label: "N5EB.SEAL.Quality.Supreme", slots: 9 }
};

const SEAL_TARGET_LABELS = {
  weapon: "TYPES.Item.weapon",
  armor: "DND5E.Armor",
  equipment: "TYPES.Item.equipment"
};

const BPS_DAMAGE_TYPES = new Set(["bludgeoning", "piercing", "slashing"]);
const ARMOR_TYPES = new Set(["light", "medium", "heavy"]);
const ITEM_ENCHANTMENT_CHANGE_RE =
  /^(system\.)?(armor|damage|range|attack|magicalBonus|properties|activities)\b|^activities\[/;
const ACTOR_RIDER_CHANGE_RE = /^(system\.)?(abilities|attributes|skills|tools|traits|bonuses)\b|^flags\./;

/* -------------------------------------------- */

export function normalizeArmorProperty(property) {
  if ( !property ) return null;
  const key = String(property);
  return ARMOR_PROPERTY_ALIASES[key] ?? ARMOR_PROPERTY_ALIASES[formatIdentifier(key)] ?? key;
}

/* -------------------------------------------- */

export function normalizeArmorProperties(properties) {
  const values = properties instanceof Set ? Array.from(properties)
    : Array.isArray(properties) ? properties
      : foundry.utils.getType(properties) === "Object" ? Object.entries(properties)
        .filter(([, value]) => !!value).map(([key]) => key)
        : [];
  return Array.from(new Set(values.map(normalizeArmorProperty).filter(Boolean)));
}

/* -------------------------------------------- */

export function isArmorData(itemData) {
  const type = itemData?.system?.type?.value;
  return (itemData?.type === "equipment") && ARMOR_TYPES.has(type);
}

/* -------------------------------------------- */

export function isArmorItem(item) {
  return (item?.type === "equipment") && ARMOR_TYPES.has(item.system?.type?.value);
}

/* -------------------------------------------- */

export function canReceiveSeals(item) {
  return ["weapon", "equipment", "container"].includes(item?.type);
}

/* -------------------------------------------- */

export function isSeal(item) {
  if ( item?.type !== "consumable" ) return false;
  if ( item.system?.seal?.target ) return true;
  return ["aseal", "wseal"].includes(item.system?.type?.value);
}

/* -------------------------------------------- */

export function legacyArmorValueToBonus(value) {
  value = Number(value);
  if ( !Number.isFinite(value) ) return 0;
  return value > 10 ? value - 10 : value;
}

/* -------------------------------------------- */

export function defaultArmorDexCap(type, current) {
  if ( type === "light" ) return 7;
  if ( type === "heavy" ) return 0;
  return Number.isFinite(Number(current)) ? Number(current) : null;
}

/* -------------------------------------------- */

export function getArmorBonus(armor) {
  const value = Number(armor?.system?.armor?.bonus);
  if ( Number.isFinite(value) ) return value;
  return legacyArmorValueToBonus(armor?.system?.armor?.value);
}

/* -------------------------------------------- */

export function getArmorDexCap(armor) {
  const cap = Number(armor?.system?.armor?.dexCap);
  if ( Number.isFinite(cap) ) return cap;
  const legacy = Number(armor?.system?.armor?.dex);
  return defaultArmorDexCap(armor?.system?.type?.value, legacy);
}

/* -------------------------------------------- */

export function getArmorDexBonus(armor, dexMod) {
  dexMod = Number(dexMod) || 0;
  const type = armor?.system?.type?.value;
  if ( type === "heavy" ) return 0;
  const cap = getArmorDexCap(armor);
  return Number.isFinite(cap) ? Math.min(cap, dexMod) : dexMod;
}

/* -------------------------------------------- */

export function getArmorDamageReduction(armor) {
  return Math.max(Number(armor?.system?.armor?.dr) || 0, 0);
}

/* -------------------------------------------- */

export function hasArmorProperty(armor, property) {
  const canonical = normalizeArmorProperty(property);
  const properties = armor?.system?.properties ?? new Set();
  return properties.has?.(canonical) || properties.includes?.(canonical);
}

/* -------------------------------------------- */

export function getEquippedArmor(actor) {
  return actor?.itemTypes?.equipment?.find(item => item.system.equipped && isArmorItem(item)) ?? null;
}

/* -------------------------------------------- */

export function isArmorProficient(actor, armor) {
  if ( !actor || !armor ) return true;
  if ( actor.system?.isNPC ) return true;
  const multiplier = armor.system?.proficiencyMultiplier
    ?? armor.system?.prof?.multiplier
    ?? armor.system?.proficient
    ?? 0;
  return Number(multiplier) > 0;
}

/* -------------------------------------------- */

export function getNonProficientArmor(actor) {
  const armor = getEquippedArmor(actor);
  return armor && !isArmorProficient(actor, armor) ? armor : null;
}

/* -------------------------------------------- */

export function applyArmorDamageReduction(actor, damage, appliedDamage, options={}) {
  if ( appliedDamage <= 0 || !BPS_DAMAGE_TYPES.has(damage.type) ) return appliedDamage;
  if ( options.ignore === true || options.ignore?.armorDR ) return appliedDamage;
  const armor = getEquippedArmor(actor);
  if ( !armor || !isArmorProficient(actor, armor) ) return appliedDamage;

  let reduction = getArmorDamageReduction(armor);
  if ( reduction <= 0 ) return appliedDamage;

  const corroded = actor.getConditionRank?.("corroded") ?? 0;
  const corrosionPenalty = corroded * 2;
  if ( corrosionPenalty ) reduction = Math.max(reduction - corrosionPenalty, 0);
  if ( reduction <= 0 ) return appliedDamage;

  const applied = Math.min(appliedDamage, reduction);
  damage.active ??= {};
  damage.active.n5ebArmorDR = {
    amount: applied,
    source: armor.name,
    corroded: Math.min(corrosionPenalty, getArmorDamageReduction(armor))
  };
  return appliedDamage - applied;
}

/* -------------------------------------------- */

export function applyArmorAttackOptions(activity, options) {
  if ( !getNonProficientArmor(activity.actor) ) return;
  options.disadvantage = true;
  options.n5ebNonProficientArmor = true;
}

/* -------------------------------------------- */

export function registerHooks() {
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
}

/* -------------------------------------------- */

function onPreUseActivity(activity) {
  const armor = getNonProficientArmor(activity.actor);
  if ( !armor || !isRestrictedJutsuActivity(activity) ) return;
  ui.notifications.warn(game.i18n.format("N5EB.ARMOR.Warning.NonProficientCasting", {
    actor: activity.actor.name,
    armor: armor.name,
    item: activity.item.name
  }));
}

/* -------------------------------------------- */

function isRestrictedJutsuActivity(activity) {
  if ( !activity?.isSpell && (activity?.item?.type !== "spell") ) return false;
  const type = formatIdentifier(activity.item.system?.jutsu?.type ?? "");
  return ["ninjutsu", "taijutsu", "genjutsu"].includes(type);
}

/* -------------------------------------------- */

export function getSealData(item) {
  const source = item?.system?.seal ?? {};
  const derived = deriveSealData(item);
  const rank = source.rank || derived.rank;
  const rankConfig = SEAL_RANKS[rank] ?? {};
  return {
    target: source.target || derived.target,
    rank,
    slots: Number(source.slots) || rankConfig.slots || 0,
    baseName: source.baseName || derived.baseName,
    baseKey: formatIdentifier(source.baseName || derived.baseName || item?.name || ""),
    level: Number(source.level) || rankConfig.level || 0,
    craftingDC: Number(source.craftingDC) || rankConfig.craftingDC || 0,
    downtime: Number(source.downtime) || rankConfig.downtime || 0,
    notes: source.notes ?? ""
  };
}

/* -------------------------------------------- */

export function deriveSealData(item) {
  if ( !item ) return {};
  const target = item.system?.type?.value === "aseal" ? "armor"
    : item.system?.type?.value === "wseal" ? "weapon"
      : "";
  const tier = item.name?.match(/\((minor|refined|greater|superior|mastercraft)\)\s*$/i)?.[1]?.toLowerCase();
  const rank = SEAL_TIER_RANKS[tier] ?? "";
  const baseName = item.name?.replace(/\s*\((?:Minor|Refined|Greater|Superior|Mastercraft)\)\s*$/i, "").trim() ?? "";
  return { target, rank, baseName };
}

/* -------------------------------------------- */

export function getSealSlots(item) {
  const system = item?.system ?? {};
  const quality = system.seals?.quality || "standard";
  const capacityOverride = system.seals?.capacity;
  const configured = (capacityOverride === null) || (capacityOverride === undefined) || (capacityOverride === "")
    ? null
    : Number(capacityOverride);
  const base = Number.isFinite(configured) ? configured : (SEAL_QUALITY_SLOTS[quality]?.slots ?? 3);
  const highQuality = isArmorItem(item) && hasArmorProperty(item, "highQuality") ? 1 : 0;
  const bonus = Number(system.seals?.bonus) || 0;
  const capacity = Math.max(base + bonus + highQuality, 0);
  const installed = getInstalledSeals(item);
  const used = installed.reduce((total, seal) => total + (Number(seal.slots) || 0), 0);
  return { quality, base, bonus, highQuality, capacity, used, available: Math.max(capacity - used, 0), installed };
}

/* -------------------------------------------- */

export function getInstalledSeals(item) {
  return Array.from(item?.effects ?? [])
    .filter(effect => effect.flags?.n5eb?.seal && !effect.flags.n5eb.seal.rider)
    .map(effect => ({ effect, ...effect.flags.n5eb.seal }));
}

/* -------------------------------------------- */

export function canInstallSeal(seal, target, { actor=target?.actor }={}) {
  const errors = [];
  const data = getSealData(seal);
  if ( !isSeal(seal) ) errors.push(new Error(game.i18n.localize("N5EB.SEAL.Warning.NotSeal")));
  if ( !canReceiveSeals(target) ) {
    errors.push(new Error(game.i18n.format("N5EB.SEAL.Warning.TargetNotSupported", { item: target?.name ?? "" })));
  }
  if ( data.target === "armor" && !isArmorItem(target) ) {
    errors.push(new Error(game.i18n.format("N5EB.SEAL.Warning.WrongTarget", {
      seal: seal.name,
      target: game.i18n.localize(SEAL_TARGET_LABELS.armor)
    })));
  } else if ( data.target === "weapon" && (target?.type !== "weapon") ) {
    errors.push(new Error(game.i18n.format("N5EB.SEAL.Warning.WrongTarget", {
      seal: seal.name,
      target: game.i18n.localize(SEAL_TARGET_LABELS.weapon)
    })));
  } else if ( data.target === "equipment" && !["equipment", "container"].includes(target?.type) ) {
    errors.push(new Error(game.i18n.format("N5EB.SEAL.Warning.WrongTarget", {
      seal: seal.name,
      target: game.i18n.localize(SEAL_TARGET_LABELS.equipment)
    })));
  }

  const slots = getSealSlots(target);
  if ( data.slots > slots.available ) {
    errors.push(new Error(game.i18n.format("N5EB.SEAL.Warning.NoSlots", {
      seal: seal.name,
      needed: data.slots,
      available: slots.available
    })));
  }
  if ( data.baseKey && slots.installed.some(s => s.baseKey === data.baseKey) ) {
    errors.push(new Error(game.i18n.format("N5EB.SEAL.Warning.Duplicate", { seal: data.baseName || seal.name })));
  }
  if ( actor ) {
    const level = Number(actor.system?.details?.level)
      || (actor.system?.isNPC ? Number(actor.system?.details?.cr) : 0)
      || 0;
    if ( data.level && (level < data.level) ) {
      errors.push(new Error(game.i18n.format("N5EB.SEAL.Warning.Level", {
        seal: seal.name,
        level: data.level,
        actor: actor.name
      })));
    }
    if ( !isTargetProficient(actor, target) ) {
      errors.push(new Error(game.i18n.format("N5EB.SEAL.Warning.Proficiency", {
        actor: actor.name,
        item: target.name
      })));
    }
  }
  return errors.length ? errors : true;
}

/* -------------------------------------------- */

function isTargetProficient(actor, target) {
  if ( !actor || !target ) return true;
  if ( target.type === "equipment" && isArmorItem(target) ) return isArmorProficient(actor, target);
  if ( target.type === "equipment" ) return true;
  const multiplier = Number(target.system?.proficiencyMultiplier ?? target.system?.proficient
    ?? target.system?.prof?.multiplier ?? 0);
  return multiplier > 0;
}

/* -------------------------------------------- */

export async function installSeal(seal, target, { consume=true }={}) {
  const errors = canInstallSeal(seal, target);
  if ( errors !== true ) {
    for ( const error of errors ) ui.notifications.warn(error.message);
    return null;
  }

  const sealData = getSealData(seal);
  const effectData = createSealEffects(seal, target, sealData);
  const created = await target.createEmbeddedDocuments("ActiveEffect", effectData, { keepOrigin: true });
  if ( consume && seal.isEmbedded && ("quantity" in seal.system) ) {
    await seal.update({ "system.quantity": Math.max((Number(seal.system.quantity) || 0) - 1, 0) });
  }
  ui.notifications.info(game.i18n.format("N5EB.SEAL.Installed", { seal: seal.name, item: target.name }));
  return created;
}

/* -------------------------------------------- */

export async function uninstallSeal(target, effectId) {
  const effect = target.effects.get(effectId);
  if ( !effect?.flags?.n5eb?.seal ) return;
  const dependents = target.effects
    .filter(e => (e.flags?.n5eb?.seal?.dependentOn === effectId) || (e.flags?.n5eb?.dependentOn === effectId))
    .map(e => e.id);
  await target.deleteEmbeddedDocuments("ActiveEffect", [effectId, ...dependents]);
  ui.notifications.info(game.i18n.format("N5EB.SEAL.Uninstalled", { seal: effect.name, item: target.name }));
}

/* -------------------------------------------- */

function createSealEffects(seal, target, sealData) {
  const primaryId = foundry.utils.randomID();
  const sourceEffects = Array.from(seal.effects ?? []);
  const source = sourceEffects[0]?.toObject() ?? {
    name: seal.name,
    img: seal.img,
    changes: [],
    description: seal.system?.description?.value ?? ""
  };
  const { itemChanges, riderChanges, namePattern } = splitSealChanges(source.changes ?? []);
  const flags = {
    n5eb: {
      seal: {
        sourceUuid: seal.uuid,
        sourceId: seal.id,
        rank: sealData.rank,
        slots: sealData.slots,
        baseName: sealData.baseName,
        baseKey: sealData.baseKey,
        target: sealData.target,
        choices: {}
      }
    }
  };
  if ( namePattern ) foundry.utils.setProperty(flags, "n5eb.namePattern", namePattern);
  const primary = foundry.utils.mergeObject(source, {
    _id: primaryId,
    name: seal.name,
    type: "enchantment",
    img: seal.img,
    origin: seal.uuid,
    disabled: false,
    transfer: false,
    changes: itemChanges,
    flags
  }, { inplace: false });
  delete primary._key;

  if ( !riderChanges.length ) return [primary];
  const rider = {
    _id: foundry.utils.randomID(),
    name: seal.name,
    type: "base",
    img: seal.img,
    origin: seal.uuid,
    disabled: false,
    transfer: true,
    changes: riderChanges,
    duration: {},
    flags: {
      n5eb: {
        dependentOn: primaryId,
        seal: {
          ...flags.n5eb.seal,
          rider: true,
          dependentOn: primaryId
        }
      }
    },
    description: source.description ?? seal.system?.description?.value ?? ""
  };
  return [primary, rider];
}

/* -------------------------------------------- */

function splitSealChanges(changes) {
  const itemChanges = [];
  const riderChanges = [];
  let namePattern = null;
  for ( const original of changes ) {
    const change = foundry.utils.deepClone(original);
    let key = String(change.key ?? "").replace(/^parent\./, "");
    if ( key === "name" ) {
      const suffix = String(change.value ?? "").replace(/\u200e/g, "").trim();
      if ( suffix ) namePattern = `{} ${suffix}`;
      continue;
    }
    if ( key === "system.armor.value" ) key = "system.armor.bonus";
    change.key = key;
    if ( ITEM_ENCHANTMENT_CHANGE_RE.test(key) ) itemChanges.push(change);
    else if ( ACTOR_RIDER_CHANGE_RE.test(key) ) riderChanges.push(change);
    else itemChanges.push(change);
  }
  return { itemChanges, riderChanges, namePattern };
}

/* -------------------------------------------- */

export function prepareItemSheetContext(item) {
  const isTarget = canReceiveSeals(item);
  const seal = isSeal(item);
  const slots = isTarget ? getSealSlots(item) : null;
  return {
    isTarget,
    isSeal: seal,
    seal: seal ? getSealData(item) : null,
    slots,
    installed: slots?.installed.map(data => ({
      id: data.effect.id,
      uuid: data.effect.uuid,
      name: data.effect.name,
      img: data.effect.img,
      rank: data.rank?.toUpperCase?.() ?? "",
      slots: data.slots,
      target: data.target
    })) ?? [],
    ranks: SEAL_RANKS,
    qualities: SEAL_QUALITY_SLOTS,
    targets: Object.entries(SEAL_TARGET_LABELS).reduce((obj, [key, label]) => {
      obj[key] = game.i18n.localize(label);
      return obj;
    }, {})
  };
}

/* -------------------------------------------- */

export async function promptInstallSeal(target) {
  const actor = target.actor;
  if ( !actor ) {
    ui.notifications.warn("N5EB.SEAL.Warning.DropOwned", { localize: true });
    return;
  }
  const candidates = actor.items.filter(isSeal);
  if ( !candidates.length ) {
    ui.notifications.warn("N5EB.SEAL.Warning.NoOwnedSeals", { localize: true });
    return;
  }
  const options = candidates.map(item => `<option value="${item.id}">${foundry.utils.escapeHTML(item.name)}</option>`)
    .join("");
  const selected = await foundry.applications.api.Dialog.prompt({
    window: { title: game.i18n.format("N5EB.SEAL.Prompt.Title", { item: target.name }) },
    content: `<form><div class="form-group"><label>${game.i18n.localize("N5EB.SEAL.Label")}</label>`
      + `<select name="seal">${options}</select></div></form>`,
    ok: {
      label: game.i18n.localize("N5EB.SEAL.Install"),
      callback: (event, button) => new FormData(button.form).get("seal")
    },
    rejectClose: false
  });
  if ( !selected ) return;
  const seal = actor.items.get(selected);
  if ( seal ) await installSeal(seal, target);
}

/* -------------------------------------------- */

export function migrateArmorSourceData(itemData, updateData) {
  if ( !isArmorData(itemData) ) return;
  const armor = itemData.system.armor ?? {};
  const type = itemData.system.type?.value;
  const properties = normalizeArmorProperties(itemData.system.properties);
  const oldSystem = itemData.flags?.n5eb?.legacyImport?.originalSystem ?? {};
  const oldArmor = oldSystem.armor ?? {};
  const snapshot = {};

  const setIfMissing = (path, value) => {
    if ( value === undefined || value === null ) return;
    const current = foundry.utils.getProperty(itemData, path);
    if ( current !== undefined && current !== "" && current !== null ) return;
    snapshot[path] = foundry.utils.deepClone(current);
    updateData[path] = value;
  };

  setIfMissing("system.armor.bonus", legacyArmorValueToBonus(armor.value));
  setIfMissing("system.armor.dexCap", defaultArmorDexCap(type, armor.dex));
  setIfMissing("system.armor.dr", Number(oldArmor.dr ?? armor.dr ?? 0) || 0);
  setIfMissing("system.armor.don", type === "light" ? 1 : type === "medium" ? 5 : 10);
  setIfMissing("system.armor.doff", type === "light" ? 1 : type === "medium" ? 1 : 5);
  if ( !foundry.utils.getProperty(itemData, "system.seals.quality") ) {
    updateData["system.seals.quality"] = "standard";
    updateData["system.seals.capacity"] = null;
    updateData["system.seals.bonus"] = 0;
  }
  if ( JSON.stringify(properties) !== JSON.stringify(itemData.system.properties ?? []) ) {
    snapshot["system.properties"] = foundry.utils.deepClone(itemData.system.properties);
    updateData["system.properties"] = properties;
  }
  if ( Object.keys(snapshot).length ) {
    updateData["flags.n5eb.armorMigration.original"] = snapshot;
    updateData["flags.n5eb.armorMigration.migratedAt"] = "system-migration";
  }
}

/* -------------------------------------------- */

export function migrateSealSourceData(itemData, updateData) {
  if ( itemData.type !== "consumable" ) return;
  const type = itemData.system?.type?.value;
  if ( !["aseal", "wseal"].includes(type) && !itemData.system?.seal ) return;
  const derived = deriveSealData({
    name: itemData.name,
    system: itemData.system
  });
  const rankConfig = SEAL_RANKS[derived.rank] ?? {};
  const values = {
    target: itemData.system?.seal?.target || derived.target,
    rank: itemData.system?.seal?.rank || derived.rank,
    slots: Number(itemData.system?.seal?.slots) || rankConfig.slots || 0,
    baseName: itemData.system?.seal?.baseName || derived.baseName,
    level: Number(itemData.system?.seal?.level) || rankConfig.level || 0,
    craftingDC: Number(itemData.system?.seal?.craftingDC) || rankConfig.craftingDC || 0,
    downtime: Number(itemData.system?.seal?.downtime) || rankConfig.downtime || 0,
    notes: itemData.system?.seal?.notes ?? ""
  };
  const snapshot = {};
  for ( const [key, value] of Object.entries(values) ) {
    if ( value === "" || value === 0 ) continue;
    const path = `system.seal.${key}`;
    const current = foundry.utils.getProperty(itemData, path);
    if ( current !== undefined && current !== "" && current !== 0 && current !== null ) continue;
    snapshot[path] = foundry.utils.deepClone(current);
    updateData[path] = value;
  }
  if ( Object.keys(snapshot).length ) {
    updateData["flags.n5eb.sealMigration.original"] = snapshot;
    updateData["flags.n5eb.sealMigration.migratedAt"] = "system-migration";
  }
}
