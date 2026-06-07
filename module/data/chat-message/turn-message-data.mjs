import ChatMessageDataModel from "../abstract/chat-message-data-model.mjs";
import ActivationsField from "./fields/activations-field.mjs";
import { ActorDeltasField } from "./fields/deltas-field.mjs";

const { ArrayField, BooleanField, DocumentIdField, NumberField, SchemaField, SetField, StringField } =
  foundry.data.fields;

/**
 * @import { TurnMessageSystemData } from "./_types.mjs";
 */

/**
 * Data stored in a combat turn chat message.
 * @extends {ChatMessageDataModel<TurnMessageSystemData>}
 * @mixes TurnMessageSystemData
 */
export default class TurnMessageData extends ChatMessageDataModel {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static defineSchema() {
    return {
      activations: new ActivationsField(),
      concentration: new ArrayField(new SchemaField({
        cost: new NumberField({ integer: true, min: 0 }),
        effect: new DocumentIdField({ nullable: false, required: true }),
        ended: new BooleanField(),
        img: new StringField(),
        insufficient: new BooleanField(),
        name: new StringField(),
        paid: new BooleanField(),
        rank: new StringField(),
        rankLabel: new StringField()
      })),
      deltas: new ActorDeltasField(),
      origin: new SchemaField({
        combat: new DocumentIdField({ nullable: false, required: true }),
        combatant: new DocumentIdField({ nullable: false, required: true })
      }),
      trigger: new SetField(new StringField())
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    actions: {
      ...super.metadata.actions,
      endConcentration: TurnMessageData.#endConcentration,
      payConcentration: TurnMessageData.#payConcentration
    },
    template: "systems/n5eb/templates/chat/turn-card.hbs"
  }, { inplace: false }));

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The actor belonging to the combatant.
   * @type {Actor5e}
   */
  get actor() {
    return this.combatant?.actor ?? this.parent.getAssociatedActor();
  }

  /* -------------------------------------------- */

  /**
   * The combat during which this message was triggered.
   * @type {Combat5e}
   */
  get combat() {
    return game.combats.get(this.origin.combat);
  }

  /* -------------------------------------------- */

  /**
   * The combatant to whom this message applies.
   * @type {Combatant5e}
   */
  get combatant() {
    return this.combat?.combatants.get(this.origin.combatant);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = {
      actor: this.actor,
      combat: this.combat,
      combatant: this.combatant
    };

    if ( context.actor?.isOwner ) {
      context.activities = ActivationsField.processActivations.call(this.activations, this.actor);
      context.concentration = this.concentration.map(entry => {
        entry = entry.toObject?.() ?? { ...entry };
        return {
          ...entry,
          canPay: !entry.paid && !entry.ended,
          rankLabel: game.i18n.localize(entry.rankLabel)
        };
      });
      context.deltas = ActorDeltasField.processDeltas.call(this.deltas, this.actor, this.parent.rolls);
    }

    return context;
  }

  /* -------------------------------------------- */

  /**
   * Pay a concentration maintain cost from a turn card.
   * @this {TurnMessageData}
   * @param {PointerEvent} event  Triggering event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #payConcentration(event, target) {
    event.preventDefault();
    target.disabled = true;
    try {
      const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
      if ( !effectId || !this.actor?.isOwner ) return;
      const result = await this.actor.payConcentrationMaintainCost(effectId, {
        combat: this.combat, combatant: this.combatant
      });
      if ( result ) await this.#updateConcentrationEntry(effectId, result);
    } finally {
      target.disabled = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * End a concentration effect from a turn card.
   * @this {TurnMessageData}
   * @param {PointerEvent} event  Triggering event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #endConcentration(event, target) {
    event.preventDefault();
    target.disabled = true;
    try {
      const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
      if ( !effectId || !this.actor?.isOwner ) return;
      await this.actor.endConcentration(effectId);
      await this.#updateConcentrationEntry(effectId, { ended: true });
    } finally {
      target.disabled = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update a concentration entry in this chat card.
   * @param {string} effectId  Effect ID.
   * @param {object} changes   Changes to apply.
   * @returns {Promise<void>}
   */
  async #updateConcentrationEntry(effectId, changes) {
    const concentration = this.concentration.map(entry => {
      entry = entry.toObject?.() ?? { ...entry };
      if ( entry.effect !== effectId ) return entry;
      return { ...entry, ...changes };
    });
    await this.parent.update({ "system.concentration": concentration });
  }
}
