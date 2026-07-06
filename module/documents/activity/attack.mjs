import AttackSheet from "../../applications/activity/attack-sheet.mjs";
import AttackRollConfigurationDialog from "../../applications/dice/attack-configuration-dialog.mjs";
import * as Conditions from "../../conditions.mjs";
import * as Seals from "../../seals.mjs";
import BaseAttackActivityData from "../../data/activity/attack-data.mjs";
import { getTargetDescriptors } from "../../utils.mjs";
import ActivityMixin from "./mixin.mjs";

/**
 * @import {
 *   AttackRollDialogConfiguration, AttackRollProcessConfiguration, BasicRollMessageConfiguration, D20RollConfiguration
 * } from "../../dice/_types.mjs";
 * @import { AmmunitionDieUpdate, AmmunitionUpdate } from "./_types.mjs";
 */

/**
 * Get the next lower N5E ammunition die.
 * @param {string} die  Current ammunition die.
 * @returns {string}
 */
function getLowerAmmunitionDie(die) {
  const dice = Object.keys(CONFIG.DND5E.ammoDieTypes);
  const index = dice.indexOf(die);
  return dice[Math.max(0, index - 1)] ?? "1";
}

/**
 * Format a localized string with an English fallback if the key is unavailable.
 * @param {string} key       Localization key.
 * @param {object} data      Formatting data.
 * @param {string} fallback  Fallback string.
 * @returns {string}
 */
function formatLocalized(key, data={}, fallback="") {
  const localized = game.i18n.format(key, data);
  if ( localized !== key ) return localized;
  return fallback.replace(/\{(\w+)}/g, (_match, prop) => data[prop] ?? "");
}

/**
 * Activity for making attacks and rolling damage.
 */
export default class AttackActivity extends ActivityMixin(BaseAttackActivityData) {
  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "DND5E.ATTACK"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static metadata = Object.freeze(
    foundry.utils.mergeObject(super.metadata, {
      type: "attack",
      img: "systems/n5eb/icons/svg/activity/attack.svg",
      title: "DND5E.ATTACK.Title.one",
      hint: "DND5E.ATTACK.Hint",
      sheetClass: AttackSheet,
      usage: {
        actions: {
          rollAttack: AttackActivity.#rollAttack,
          rollDamage: AttackActivity.#rollDamage
        }
      }
    }, { inplace: false })
  );

  /* -------------------------------------------- */
  /*  Activation                                  */
  /* -------------------------------------------- */

  /** @override */
  _usageChatButtons(message) {
    const buttons = [{
      label: game.i18n.localize("DND5E.Attack"),
      icon: '<i class="dnd5e-icon" data-src="systems/n5eb/icons/svg/trait-weapon-proficiencies.svg" inert></i>',
      dataset: {
        action: "rollAttack"
      }
    }];
    if ( this.damage.parts.length || this.item.system.properties?.has("amm") ) buttons.push({
      label: game.i18n.localize("DND5E.Damage"),
      icon: '<i class="fa-solid fa-burst" inert></i>',
      dataset: {
        action: "rollDamage"
      }
    });
    return buttons.concat(super._usageChatButtons(message));
  }

  /* -------------------------------------------- */

  /** @override */
  async _triggerSubsequentActions(config, results) {
    this.rollAttack({ event: config.event }, {}, { data: { "flags.n5eb.originatingMessage": results.message?.id } });
  }

  /* -------------------------------------------- */
  /*  Rolling                                     */
  /* -------------------------------------------- */

  /**
   * Perform an attack roll.
   * @param {AttackRollProcessConfiguration} config  Configuration information for the roll.
   * @param {AttackRollDialogConfiguration} dialog   Configuration for the roll dialog.
   * @param {BasicRollMessageConfiguration} message  Configuration for the roll message.
   * @returns {Promise<D20Roll[]|null>}
   */
  async rollAttack(config={}, dialog={}, message={}) {
    const targets = getTargetDescriptors();

    if ( (this.item.type === "weapon") && (this.item.system.quantity === 0) ) {
      ui.notifications.warn("DND5E.ATTACK.Warning.NoQuantity", { localize: true });
    }

    const buildConfig = this._buildAttackConfig.bind(this);

    const rollConfig = foundry.utils.mergeObject({
      ammunition: this.item.getFlag("n5eb", `last.${this.id}.ammunition`),
      ammunitionDie: true,
      attackMode: this.item.getFlag("n5eb", `last.${this.id}.attackMode`),
      elvenAccuracy: this.actor?.getFlag("n5eb", "elvenAccuracy")
        && CONFIG.DND5E.characterFlags.elvenAccuracy.abilities.includes(this.ability),
      halflingLucky: this.actor?.getFlag("n5eb", "halflingLucky"),
      mastery: this.item.getFlag("n5eb", `last.${this.id}.mastery`),
      target: targets.length === 1 ? targets[0].ac : undefined
    }, config);

    const ammunitionOptions = this.item.system.ammunitionOptions ?? [];
    if ( ammunitionOptions.length ) ammunitionOptions.unshift({ value: "", label: "" });
    if ( rollConfig.ammunition === undefined ) rollConfig.ammunition = ammunitionOptions?.[1]?.value;
    else if ( !ammunitionOptions?.find(m => m.value === rollConfig.ammunition) ) {
      rollConfig.ammunition = ammunitionOptions?.[0]?.value;
    }
    const attackModeOptions = this.item.system.attackModes;
    if ( !attackModeOptions?.find(m => m.value === rollConfig.attackMode) ) {
      rollConfig.attackMode = attackModeOptions?.[0]?.value;
    }
    const masteryOptions = this.item.system.masteryOptions;
    if ( !masteryOptions?.find(m => m.value === rollConfig.mastery) ) {
      rollConfig.mastery = masteryOptions?.[0]?.value;
    }

    rollConfig.hookNames = [...(config.hookNames ?? []), "attack", "d20Test"];
    rollConfig.rolls = [CONFIG.Dice.D20Roll.mergeConfigs({
      options: {
        ammunition: rollConfig.ammunition,
        ammunitionDie: rollConfig.ammunitionDie,
        attackMode: rollConfig.attackMode,
        criticalSuccess: this.criticalThreshold,
        mastery: rollConfig.mastery
      }
    }, config.rolls?.shift())].concat(config.rolls ?? []);
    rollConfig.subject = this;

    const dialogConfig = foundry.utils.mergeObject({
      applicationClass: AttackRollConfigurationDialog,
      options: {
        ammunitionDie: (this.item.type === "weapon") && this.item.system.properties?.has("amm"),
        ammunitionOptions: rollConfig.ammunition !== false ? ammunitionOptions : [],
        attackModeOptions,
        buildConfig,
        masteryOptions: (masteryOptions?.length > 1) && !config.mastery ? masteryOptions : [],
        position: {
          top: config.event ? config.event.clientY - 80 : null,
          left: window.innerWidth - 710
        },
        window: {
          title: game.i18n.localize("DND5E.AttackRoll"),
          subtitle: this.item.name,
          icon: this.item.img
        }
      }
    }, dialog);

    const messageConfig = foundry.utils.mergeObject({
      create: true,
      data: {
        flavor: `${this.item.name} - ${game.i18n.localize("DND5E.AttackRoll")}`,
        flags: {
          n5eb: {
            ...this.messageFlags,
            messageType: "roll",
            roll: { type: "attack" }
          }
        },
        speaker: ChatMessage.getSpeaker({ actor: this.actor })
      }
    }, message);

    const rolls = await CONFIG.Dice.D20Roll.buildConfigure(rollConfig, dialogConfig, messageConfig);
    await CONFIG.Dice.D20Roll.buildEvaluate(rolls, rollConfig, messageConfig);
    if ( !rolls.length ) return null;
    for ( const key of ["ammunition", "attackMode", "mastery"] ) {
      if ( !rolls[0].options[key] ) continue;
      foundry.utils.setProperty(messageConfig.data, `flags.n5eb.roll.${key}`, rolls[0].options[key]);
    }
    await CONFIG.Dice.D20Roll.buildPost(rolls, rollConfig, messageConfig);

    const flags = {};
    let ammoUpdate = null;
    let ammoDieUpdate = null;

    const canUpdate = this.item.isOwner && !this.item.inCompendium;
    const attackMode = rolls[0].options.attackMode ?? rollConfig.attackMode;
    const selectedAmmo = rolls[0].options.ammunition ? this.actor?.items.get(rolls[0].options.ammunition) : null;
    const usesAmmunitionDie = (rolls[0].options.ammunitionDie !== false)
      && (this.item.type === "weapon") && this.item.system.properties?.has("amm")
      && (this.getActionType(attackMode) === "rwak") && !selectedAmmo?.system.properties?.has("ret")
      && !this.item.system.properties?.has("ret");

    if ( selectedAmmo ) flags.ammunition = rolls[0].options.ammunition;
    else if ( !rolls[0].options.ammunition && dialogConfig.options?.ammunitionOptions?.length ) flags.ammunition = "";

    if ( usesAmmunitionDie ) {
      const ammunition = selectedAmmo ?? this.item;
      if ( ammunition.system.ammunitionDie === "1" ) {
        await this._postAmmunitionConsumedMessage(ammunition, messageConfig);
        ammoUpdate = { id: ammunition.id, quantity: Math.max(0, ammunition.system.quantity - 1) };
        ammoUpdate.destroy = (ammunition.type === "consumable")
          && ammunition.system.uses.autoDestroy && (ammoUpdate.quantity === 0);
      } else {
        ammoDieUpdate = await this._rollAmmunitionDie(ammunition, messageConfig);
      }
    } else if ( !selectedAmmo && !this.item.system.properties?.has("amm") && rolls[0].options.attackMode?.startsWith("thrown")
      && !this.item.system.properties?.has("ret") ) {
      ammoUpdate = { id: this.item.id, quantity: Math.max(0, this.item.system.quantity - 1) };
    }
    if ( rolls[0].options.attackMode ) flags.attackMode = rolls[0].options.attackMode;
    else if ( rollConfig.attackMode ) rolls[0].options.attackMode = rollConfig.attackMode;
    if ( rolls[0].options.mastery ) flags.mastery = rolls[0].options.mastery;
    if ( canUpdate && !foundry.utils.isEmpty(flags) && (this.actor && this.actor.items.has(this.item.id)) ) {
      await this.item.setFlag("n5eb", `last.${this.id}`, flags);
    }

    /**
     * A hook event that fires after an attack has been rolled but before any ammunition is consumed.
     * @function dnd5e.rollAttack
     * @memberof hookEvents
     * @param {D20Roll[]} rolls                        The resulting rolls.
     * @param {object} data
     * @param {AttackActivity|null} data.subject       The Activity that performed the attack.
     * @param {AmmunitionUpdate|null} data.ammoUpdate  Any updates related to ammo consumption for this attack.
     * @param {AmmunitionDieUpdate|null} data.ammoDieUpdate  Any updates to the N5E ammunition die.
     */
    Hooks.callAll("dnd5e.rollAttack", rolls, { subject: this, ammoUpdate, ammoDieUpdate });
    Hooks.callAll("dnd5e.rollAttackV2", rolls, { subject: this, ammoUpdate, ammoDieUpdate });

    // Commit ammunition consumption on attack rolls resource consumption if the attack roll was made
    if ( canUpdate && ammoDieUpdate ) await this.actor?.updateEmbeddedDocuments("Item", [
      { _id: ammoDieUpdate.id, "system.ammunitionDie": ammoDieUpdate.die }
    ]);
    if ( canUpdate && ammoUpdate?.destroy ) {
      // If ammunition was deleted, store a copy of it in the roll message
      const data = this.actor.items.get(ammoUpdate.id).toObject();
      const messageId = messageConfig.data?.flags?.n5eb?.originatingMessage
        ?? rollConfig.event?.target.closest("[data-message-id]")?.dataset.messageId;
      const attackMessage = dnd5e.registry.messages.get(messageId, "attack")?.pop();
      await attackMessage?.setFlag("n5eb", "roll.ammunitionData", data);
      await this.actor.deleteEmbeddedDocuments("Item", [ammoUpdate.id]);
    }
    else if ( canUpdate && ammoUpdate ) await this.actor?.updateEmbeddedDocuments("Item", [
      { _id: ammoUpdate.id, "system.quantity": ammoUpdate.quantity }
    ]);

    /**
     * A hook event that fires after an attack has been rolled and ammunition has been consumed.
     * @function dnd5e.postRollAttack
     * @memberof hookEvents
     * @param {D20Roll[]} rolls                   The resulting rolls.
     * @param {object} data
     * @param {AttackActivity|null} data.subject  The activity that performed the attack.
     */
    Hooks.callAll("dnd5e.postRollAttack", rolls, { subject: this, ammoUpdate, ammoDieUpdate });

    return rolls;
  }

  /* -------------------------------------------- */

  /**
   * Configure a roll config for each roll performed as part of the attack process. Will be called once per roll
   * in the process each time an option is changed in the roll configuration interface.
   * @param {AttackRollProcessConfiguration} process       Configuration for the entire rolling process.
   * @param {D20RollConfiguration} config                  Configuration for a specific roll.
   * @param {FormDataExtended} [formData]                  Any data entered into the rolling prompt.
   * @param {number} index                                 Index of the roll within all rolls being prepared.
   */
  _buildAttackConfig(process, config, formData, index) {
    const ammunition = formData?.get("ammunition") ?? process.ammunition;
    const ammunitionDie = formData?.get("ammunitionDie") ?? process.ammunitionDie;
    const attackMode = formData?.get("attackMode") ?? process.attackMode;
    const mastery = formData?.get("mastery") ?? process.mastery;

    let { parts, data } = this.getAttackData({ ammunition, attackMode });
    const options = config.options ?? {};
    if ( ammunition !== undefined ) options.ammunition = ammunition;
    if ( ammunitionDie !== undefined ) options.ammunitionDie = ammunitionDie;
    if ( attackMode !== undefined ) options.attackMode = attackMode;
    if ( mastery !== undefined ) options.mastery = mastery;
    Conditions.applyAttackConditionOptions(this, options);
    Seals.applyArmorAttackOptions(this, options);

    config.parts = [...(config.parts ?? []), ...parts];
    config.data = { ...data, ...(config.data ?? {}) };
    config.options = options;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle performing an attack roll.
   * @this {AttackActivity}
   * @param {PointerEvent} event     Triggering click event.
   * @param {HTMLElement} target     The capturing HTML element which defined a [data-action].
   * @param {ChatMessage5e} message  Message associated with the activation.
   */
  static #rollAttack(event, target, message) {
    this.rollAttack({ event });
  }

  /* -------------------------------------------- */

  /**
   * Handle performing a damage roll.
   * @this {AttackActivity}
   * @param {PointerEvent} event     Triggering click event.
   * @param {HTMLElement} target     The capturing HTML element which defined a [data-action].
   * @param {ChatMessage5e} message  Message associated with the activation.
   */
  static #rollDamage(event, target, message) {
    const lastAttack = message.getAssociatedRolls("attack").pop();
    const attackMode = lastAttack?.getFlag("n5eb", "roll.attackMode");

    // Fetch the ammunition used with the last attack roll
    let ammunition;
    const actor = lastAttack?.getAssociatedActor();
    if ( actor ) {
      const storedData = lastAttack.getFlag("n5eb", "roll.ammunitionData");
      ammunition = storedData
        ? new Item.implementation(storedData, { parent: actor })
        : actor.items.get(lastAttack.getFlag("n5eb", "roll.ammunition"));
    }

    const isCritical = lastAttack?.rolls[0]?.isCritical;
    const dialogConfig = {};
    if ( isCritical ) dialogConfig.options = { defaultButton: "critical" };

    this.rollDamage({ event, ammunition, attackMode, isCritical }, dialogConfig);
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Post a chat message when the last piece of ammunition is consumed.
   * @param {Item5e} ammunition                         Ammunition source item.
   * @param {BasicRollMessageConfiguration} messageConfig  Attack roll message configuration.
   * @returns {Promise<ChatMessage5e|void>}
   * @protected
   */
  async _postAmmunitionConsumedMessage(ammunition, messageConfig={}) {
    if ( messageConfig.create === false ) return;
    const remaining = Math.max(0, ammunition.system.quantity - 1);
    const chatData = {
      content: `<p>${formatLocalized(
        "N5EB.AmmoDieConsumed",
        { quantity: remaining },
        "Ammo 1: spent 1 ammunition. {quantity} remaining."
      )}</p>`,
      flavor: formatLocalized("N5EB.AmmunitionRoll", { name: ammunition.name }, "{name} - Ammunition Roll"),
      flags: {
        n5eb: {
          ...this.messageFlags,
          messageType: "roll",
          roll: {
            type: "ammunition",
            itemId: ammunition.id,
            consumed: true
          }
        }
      },
      speaker: ChatMessage.getSpeaker({ actor: this.actor })
    };
    ChatMessage.applyRollMode(chatData, messageConfig.rollMode ?? CONFIG.Dice.BasicRoll.getMessageMode());
    return ChatMessage.create(chatData);
  }

  /* -------------------------------------------- */

  /**
   * Roll the N5E ammunition die and post the result to chat.
   * @param {Item5e} ammunition                         Ammunition source item.
   * @param {BasicRollMessageConfiguration} messageConfig  Attack roll message configuration.
   * @returns {Promise<AmmunitionDieUpdate|null>}
   * @protected
   */
  async _rollAmmunitionDie(ammunition, messageConfig={}) {
    const currentDie = ammunition.system.ammunitionDie || "d8";
    const roll = new Roll(currentDie);
    await roll.evaluate();

    const newDie = roll.total <= 2 ? getLowerAmmunitionDie(currentDie) : currentDie;
    const rollResult = formatLocalized(
      "N5EB.AmmoDieRollResult",
      { currentDie, total: roll.total },
      "Rolled <strong>{total}</strong> on <strong>{currentDie}</strong>."
    );
    const result = formatLocalized(
      newDie === currentDie ? "N5EB.AmmoDieRemain" : "N5EB.AmmoDieDecrease",
      { currentDie, newDie },
      newDie === currentDie
        ? "The ammunition die remains at <strong>{currentDie}</strong>."
        : "The ammunition die decreases to <strong>{newDie}</strong>."
    );
    const chatData = {
      content: `<p>${rollResult}</p><p>${result}</p>`,
      flavor: formatLocalized("N5EB.AmmunitionRoll", { name: ammunition.name }, "{name} - Ammunition Roll"),
      flags: {
        n5eb: {
          ...this.messageFlags,
          messageType: "roll",
          roll: {
            type: "ammunition",
            itemId: ammunition.id,
            currentDie,
            newDie
          }
        }
      },
      rolls: [roll],
      speaker: ChatMessage.getSpeaker({ actor: this.actor })
    };
    if ( messageConfig.create !== false ) {
      ChatMessage.applyRollMode(chatData, messageConfig.rollMode ?? CONFIG.Dice.BasicRoll.getMessageMode());
      await ChatMessage.create(chatData);
    }
    if ( newDie === currentDie ) return null;
    return { id: ammunition.id, die: newDie, previousDie: currentDie };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getFavoriteData() {
    return foundry.utils.mergeObject(await super.getFavoriteData(), { modifier: this.labels.modifier });
  }
}
