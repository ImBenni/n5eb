/**
 * Mixin used to add support for registering documents in the dependents registry.
 * @template {foundry.abstract.Document} T
 * @param {typeof T} Base  The base document class to wrap.
 * @returns {typeof DependentDocument}
 * @mixin
 */
export default function DependentDocumentMixin(Base) {
  class DependentDocument extends Base {
    /** @inheritDoc */
    prepareData() {
      super.prepareData();
      if ( this.flags?.n5eb?.dependentOn && this.uuid ) {
        dnd5e.registry.dependents.track(this.flags.n5eb.dependentOn, this);
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onDelete(options, userId) {
      super._onDelete(options, userId);
      if ( this.flags?.n5eb?.dependentOn && this.uuid ) {
        dnd5e.registry.dependents.untrack(this.flags.n5eb.dependentOn, this);
      }
    }
  }
  return DependentDocument;
}
