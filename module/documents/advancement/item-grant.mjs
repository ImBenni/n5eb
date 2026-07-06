import { filteredKeys } from "../../utils.mjs";
import ItemGrantConfig from "../../applications/advancement/item-grant-config.mjs";
import ItemGrantFlow from "../../applications/advancement/item-grant-flow-v2.mjs";
import ItemGrantConfigurationData from "../../data/advancement/item-grant.mjs";
import Advancement from "./advancement.mjs";

const N5EB_TOOLKIT_POOLS = {
  base: [
    "Compendium.n5eb.items.Item.D6VMeGBiJcYRWzMv", // Alchemist Kit
    "Compendium.n5eb.items.Item.Wx6LQQs1MqrIm671", // Standard Antidote Kit
    "Compendium.n5eb.items.Item.L5F0pAOcpGOxzC3O", // Armorsmith Kit
    "Compendium.n5eb.items.Item.P3lH99iyu5c1JItf", // Cooking Kit
    "Compendium.n5eb.items.Item.XBTl7rEwdz1si3Pu", // Demolitions Kit
    "Compendium.n5eb.items.Item.mDTmczocjaXlf6xM", // Disguise Kit
    "Compendium.n5eb.items.Item.gJfW9qZyqILwCzbN", // First Aid Kit
    "Compendium.n5eb.items.Item.FMzIcDM4mOLlfD5g", // Forensics Kit
    "Compendium.n5eb.items.Item.4tZVWFVUJyOMxQQU", // Forgery Kit
    "Compendium.n5eb.items.Item.z0nkjik1OU6gvhTZ", // Hackers Kit
    "Compendium.n5eb.items.Item.NijK86qNzaHagxIh", // Medicine Kit
    "Compendium.n5eb.items.Item.KCfr0NyRpCPclJeT", // Poison Kit
    "Compendium.n5eb.items.Item.CeMakOTuqo0LjEje", // Security Kit
    "Compendium.n5eb.items.Item.mbczxXylF0vWUdMZ", // Trappers Kit
    "Compendium.n5eb.items.Item.TCOqZLJrIZyp4SIR" // Weaponsmith Kit
  ],
  infiltrator: [
    "Compendium.n5eb.items.Item.CeMakOTuqo0LjEje", // Security Kit
    "Compendium.n5eb.items.Item.z0nkjik1OU6gvhTZ" // Hackers Kit
  ]
};

/**
 * @import {
 *   ItemGrantAdvancementApplicationData, ItemGrantAdvancementReversalOptions, ItemGrantRetainedData
 * } from "./_types.mjs";
 */

/**
 * Advancement that automatically grants one or more items to the player. Presents the player with the option of
 * skipping any or all of the items.
 */
export default class ItemGrantAdvancement extends Advancement {

  /** @inheritDoc */
  static get metadata() {
    return foundry.utils.mergeObject(super.metadata, {
      dataModels: {
        configuration: ItemGrantConfigurationData
      },
      order: 40,
      icon: "icons/sundries/books/book-open-purple.webp",
      typeIcon: "systems/n5eb/icons/svg/item-grant.svg",
      title: game.i18n.localize("DND5E.ADVANCEMENT.ItemGrant.Title"),
      hint: game.i18n.localize("DND5E.ADVANCEMENT.ItemGrant.Hint"),
      apps: {
        config: ItemGrantConfig,
        flow: ItemGrantFlow
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * The item types that are supported in Item Grant.
   * @type {Set<string>}
   */
  static VALID_TYPES = new Set(["feat", "spell", "consumable", "container", "equipment", "loot", "tool", "weapon"]);

  /* -------------------------------------------- */
  /*  Display Methods                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  configuredForLevel(level) {
    return !foundry.utils.isEmpty(this.value);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  summaryForLevel(level, { configMode=false }={}) {
    // Link to compendium items
    if ( !this.value.added || configMode ) return this.configuration.items.filter(i => fromUuidSync(i.uuid))
      .reduce((html, i) => html + dnd5e.utils.linkForUuid(i.uuid), "");

    // Link to items on the actor
    else {
      return Object.keys(this.value.added).map(id => {
        const item = this.actor.items.get(id);
        return item?.toAnchor({classes: ["content-link"]}).outerHTML ?? "";
      }).join("");
    }
  }

  /* -------------------------------------------- */
  /*  Application Methods                         */
  /* -------------------------------------------- */

  /**
   * Location where the added items are stored for the specified level.
   * @param {number} level  Level being advanced.
   * @returns {string}
   */
  storagePath(level) {
    return "value.added";
  }

  /* -------------------------------------------- */

  /** @override */
  async apply(level, { ability, retainedData={}, selected=Object.keys(retainedData), ...data }={}, options={}) {
    if ( !foundry.utils.isEmpty(data) ) {
      foundry.utils.logCompatibilityWarning(
        "The properties passed to `ItemGrantAdvancement#apply` have changed, see `ItemGrantAdvancementApplicationData` for new properties.",
        { since: "DnD5e 5.2", until: "DnD5e 5.4" }
      );
      selected = filteredKeys(data);
      retainedData = options;
    }

    if ( options.initial ) {
      ability = retainedData.ability ?? this.value.ability ?? this.configuration.spell?.ability?.first();
      selected = this.configuration.items?.reduce((arr, { optional, uuid }) => {
        if ( !this.configuration.optional || !optional ) arr.push(uuid);
        return arr;
      }, []) ?? [];
    }

    const added = foundry.utils.getProperty(this, this.storagePath(level)) ?? {};
    if ( ability && (ability !== this.value?.ability) ) {
      for ( const id of Object.keys(added) ) {
        const item = this.actor.items.get(id);
        if ( item?.type === "spell" ) item.updateSource({ "system.ability": ability });
      }
    }

    const items = [];
    const itemUpdates = {};
    const existing = new Set(Object.values(added));
    for ( const uuid of selected ) {
      if ( existing.has(uuid) ) continue;
      let itemBundle = _getN5eBRetainedItemBundle(uuid, retainedData.items);
      if ( !itemBundle.length ) itemBundle = await this.createItemDataBundle(uuid);
      if ( !itemBundle.length ) continue;

      const itemData = itemBundle[0];
      if ( itemData.type === "spell" ) this.configuration.spell?.applySpellChanges(itemData, {
        ability: ability ?? this.value?.ability
      });
      for ( const bundled of itemBundle.slice(1) ) {
        if ( bundled.type === "spell" ) this.configuration.spell?.applySpellChanges(bundled, {
          ability: ability ?? this.value?.ability
        });
      }

      items.push(...itemBundle);
      itemUpdates[itemData._id] = uuid;
      options.firstCreatedItem ??= itemData._id;
    }

    const updates = {};
    if ( ability ) updates["value.ability"] = ability;
    if ( items.length ) {
      this.actor.updateSource({ items });
      updates[this.storagePath(level)] = itemUpdates;
    }
    this.updateSource(updates);

    return updates;
  }

  /* -------------------------------------------- */

  /**
   * Create item data for a granted item, expanding N5eB equipment packs with their contents.
   * @param {string} uuid  UUID of the item to fetch.
   * @returns {Promise<object[]>}
   */
  async createItemDataBundle(uuid) {
    const source = await fromUuid(uuid);
    if ( !source ) return [];
    const expandPack = source.type === "container"
      && foundry.utils.getProperty(source, "flags.n5eb.equipmentPack.expandContents");
    if ( !expandPack ) {
      const itemData = await this.createItemData(uuid);
      return itemData ? [itemData] : [];
    }
    return _createN5eBEquipmentPackItemData(source, this);
  }

  /* -------------------------------------------- */

  /** @override */
  async automaticApplicationValue(level) {
    if ( this.configuration.optional
      || (this.configuration.spell?.ability?.size > 1)
      || this.configuration.items.some(i => i.optional) ) return false;
    return {
      ability: this.configuration.spell?.ability.first(),
      selected: this.configuration.items.map(({ uuid }) => uuid)
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  restore(level, data, options={}) {
    const updates = {};
    const items = data.items ?? [];
    if ( items.length ) this.actor.updateSource({ items });
    for ( const item of items ) {
      if ( _isN5eBEquipmentPackContent(item) ) continue;
      const sourceId = item.flags?.n5eb?.sourceId;
      if ( sourceId ) updates[item._id] = sourceId;
    }
    this.updateSource({
      "value.ability": data.ability,
      [this.storagePath(level)]: updates
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  reverse(level, options={}) {
    const keyPath = this.storagePath(level);
    const added = foundry.utils.getProperty(this.toObject(), keyPath) ?? {};
    const rootIds = (options.uuid ? [Object.entries(added).find(([, v]) => v === options.uuid)?.[0]]
      : Object.keys(added)).filter(Boolean);
    if ( !rootIds.length ) return;

    const ids = new Set(rootIds.filter(Boolean));
    for ( const id of Array.from(ids) ) {
      for ( const item of _getN5eBEquipmentPackContents(this.actor, id) ) ids.add(item.id);
    }

    const items = [];
    for ( const id of ids ) {
      const item = this.actor.items.get(id);
      if ( item ) {
        items.push(item.toObject());
        items[item.flags.n5eb?.sourceId ?? item._stats.compendiumSource ?? item.uuid] = item.toObject();
      }
      this.actor.items.delete(id);
    }
    for ( const id of rootIds ) added[`-=${id}`] = null;

    this.actor.reset();
    if ( options.uuid ) this.updateSource({ [keyPath]: added });
    // TODO: Modify to use ForceDeletion in DnD5e 6.0
    else this.updateSource({ [keyPath.replace(/\.([\w\d]+)$/, ".-=$1")]: null });
    return { ability: this.value?.ability, items };
  }

  /* -------------------------------------------- */

  /**
   * Verify that the provided item can be used with this advancement based on the configuration.
   * @param {Item5e} item                   Item that needs to be tested.
   * @param {object} config
   * @param {boolean} [config.strict=true]  Should an error be thrown when an invalid type is encountered?
   * @returns {boolean}                     Is this type valid?
   * @throws {Error}                        An error if the item is invalid and strict is `true`.
   */
  _validateItemType(item, { strict=true }={}) {
    if ( !item ) return false;
    if ( this.constructor.VALID_TYPES.has(item.type) ) return true;
    const type = game.i18n.localize(CONFIG.Item.typeLabels[item.type]);
    if ( strict ) throw new Error(game.i18n.format("DND5E.AdvancementItemTypeInvalidWarning", {type}));
    return false;
  }
}

/* -------------------------------------------- */

/**
 * Get a retained root item plus any retained content items for that root.
 * @param {string} uuid             Source UUID being restored.
 * @param {object[]} [items=[]]     Retained item data.
 * @returns {object[]}
 * @private
 */
function _getN5eBRetainedItemBundle(uuid, items=[]) {
  const root = items.find(i => (i.flags?.n5eb?.sourceId ?? i._stats?.compendiumSource) === uuid);
  if ( !root ) return [];
  const rootId = root._id;
  return items.filter(i => (i._id === rootId)
    || (foundry.utils.getProperty(i, "flags.n5eb.advancementPackRoot") === rootId));
}

/* -------------------------------------------- */

/**
 * Create actor item data for an N5eB equipment pack and all of its contents.
 * @param {Item5e} source                  Source pack item.
 * @param {ItemGrantAdvancement} grant     Advancement creating the items.
 * @returns {Promise<object[]>}
 * @private
 */
async function _createN5eBEquipmentPackItemData(source, grant) {
  const choices = await _promptN5eBEquipmentPackToolkits(source);
  if ( choices === null ) return [];

  const advancementOrigin = `${grant.item.id}.${grant.id}`;
  const advancementRoot = grant.item.getFlag("n5eb", "advancementRoot") ?? advancementOrigin;
  const created = [];
  let rootId;

  const createItem = async (item, containerId, { content=false, choice }={}) => {
    const placeholder = foundry.utils.getProperty(item, "flags.n5eb.equipmentPack.toolkitChoice");
    if ( placeholder ) {
      for ( const uuid of choices.get(item.id) ?? [] ) {
        const toolkit = await fromUuid(uuid);
        if ( toolkit ) await createItem(toolkit, containerId, { content: true, choice: item });
      }
      return;
    }

    const itemData = game.items.fromCompendium(item, {
      clearSort: false, keepId: true, clearOwnership: false
    });
    itemData._id = foundry.utils.randomID();
    if ( !rootId ) rootId = itemData._id;

    foundry.utils.mergeObject(itemData, {
      "system.container": containerId,
      "flags.n5eb.sourceId": item.uuid,
      "flags.n5eb.advancementOrigin": advancementOrigin,
      "flags.n5eb.advancementRoot": advancementRoot,
      "flags.n5eb.advancementPackRoot": rootId,
      "flags.n5eb.equipmentPackContent": content
    });
    if ( choice ) {
      foundry.utils.mergeObject(itemData, {
        "flags.n5eb.equipmentPackChoice.placeholderId": choice.id,
        "flags.n5eb.equipmentPackChoice.placeholderName": choice.name
      });
    }
    created.push(itemData);

    const contents = await item.system.contents;
    for ( const child of contents ?? [] ) await createItem(child, itemData._id, { content: true });
  };

  await createItem(source, null);
  return created;
}

/* -------------------------------------------- */

/**
 * Prompt for toolkit choices required by an equipment pack.
 * @param {Item5e} source  Source equipment pack.
 * @returns {Promise<Map<string, string[]>|null>}
 * @private
 */
async function _promptN5eBEquipmentPackToolkits(source) {
  const contents = await source.system.allContainedItems;
  const placeholders = contents.filter(item =>
    foundry.utils.getProperty(item, "flags.n5eb.equipmentPack.toolkitChoice"));
  const choices = new Map();

  for ( const placeholder of placeholders ) {
    const config = foundry.utils.getProperty(placeholder, "flags.n5eb.equipmentPack.toolkitChoice");
    const selected = await _promptN5eBToolkitChoice(source, placeholder, config);
    if ( !selected ) return null;
    choices.set(placeholder.id, selected);
  }

  return choices;
}

/* -------------------------------------------- */

/**
 * Prompt for one toolkit placeholder.
 * @param {Item5e} pack          Source equipment pack.
 * @param {Item5e} placeholder   Placeholder item.
 * @param {object} config        Placeholder choice configuration.
 * @returns {Promise<string[]|null>}
 * @private
 */
async function _promptN5eBToolkitChoice(pack, placeholder, config) {
  const count = Number(config.count ?? 1);
  const pool = await _getN5eBToolkitPool(config.pool);
  if ( !pool.length ) return [];

  for (;;) {
    const selected = await foundry.applications.api.Dialog.prompt({
      content: _renderN5eBToolkitPrompt(pack, placeholder, pool, count),
      window: {
        title: game.i18n.format("N5EB.EquipmentPack.ToolkitPrompt.Title", { pack: pack.name })
      },
      ok: {
        label: game.i18n.localize("DND5E.Confirm"),
        callback: (event, button) => new FormData(button.form).getAll("toolkit")
      },
      rejectClose: false
    });
    if ( !selected ) return null;
    if ( selected.length === count ) return selected;
    ui.notifications.warn(game.i18n.format("N5EB.EquipmentPack.ToolkitPrompt.Invalid", { count }));
  }
}

/* -------------------------------------------- */

/**
 * Get toolkit documents for a named pool.
 * @param {string} pool  Toolkit pool name.
 * @returns {Promise<Item5e[]>}
 * @private
 */
async function _getN5eBToolkitPool(pool) {
  const uuids = N5EB_TOOLKIT_POOLS[pool] ?? N5EB_TOOLKIT_POOLS.base;
  const items = await Promise.all(uuids.map(uuid => fromUuid(uuid)));
  return items.filter(i => i).sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------- */

/**
 * Render the toolkit prompt content.
 * @param {Item5e} pack          Source equipment pack.
 * @param {Item5e} placeholder   Placeholder item.
 * @param {Item5e[]} pool        Toolkit options.
 * @param {number} count         Number of choices required.
 * @returns {string}
 * @private
 */
function _renderN5eBToolkitPrompt(pack, placeholder, pool, count) {
  const inputType = count === 1 ? "radio" : "checkbox";
  const prompt = game.i18n.format("N5EB.EquipmentPack.ToolkitPrompt.Prompt", {
    count, pack: pack.name, placeholder: placeholder.name
  });
  const options = pool.map(item => `
    <label class="checkbox">
      <input type="${inputType}" name="toolkit" value="${item.uuid}">
      <span>${_escapeHTML(item.name)}</span>
    </label>`).join("");
  return `<p>${prompt}</p><div class="form-group stacked">${options}</div>`;
}

/* -------------------------------------------- */

/**
 * Get all actor items granted as contents of an advancement pack.
 * @param {Actor5e} actor  Actor being advanced.
 * @param {string} rootId  Root pack ID.
 * @returns {Item5e[]}
 * @private
 */
function _getN5eBEquipmentPackContents(actor, rootId) {
  const contents = new Map();
  const collect = containerId => {
    for ( const item of actor.items ) {
      const packRoot = item.getFlag("n5eb", "advancementPackRoot");
      if ( (item.system?.container !== containerId) && (packRoot !== rootId) ) continue;
      if ( item.id === rootId || contents.has(item.id) ) continue;
      contents.set(item.id, item);
      if ( item.type === "container" ) collect(item.id);
    }
  };
  collect(rootId);
  return Array.from(contents.values());
}

/* -------------------------------------------- */

/**
 * Is the provided item data a granted equipment pack content item.
 * @param {object} itemData  Item source data.
 * @returns {boolean}
 * @private
 */
function _isN5eBEquipmentPackContent(itemData) {
  return Boolean(foundry.utils.getProperty(itemData, "flags.n5eb.equipmentPackContent"));
}

/* -------------------------------------------- */

/**
 * Escape text for prompt HTML.
 * @param {string} value  Raw text.
 * @returns {string}
 * @private
 */
function _escapeHTML(value) {
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return `${value}`.replace(/[&<>"']/g, character => replacements[character]);
}
