import Application5e from "./api/application.mjs";
import {
  applyJutsuLookupOwnership,
  getCachedJutsuLookupEntries,
  getJutsuCostOptions,
  getJutsuKindOptions,
  getJutsuRankFilterOptions,
  getMultiValueFilterOptions,
  getPackFilterOptions,
  getSingleValueFilterOptions,
  invalidateJutsuLookupCache,
  jutsuRankMatchesFilter
} from "./jutsu-lookup-data.mjs";

const FILTER_DEBOUNCE_MS = 150;
const RESULT_INCREMENT = 150;

/**
 * Standalone jutsu lookup for browsing compendium and world jutsu.
 */
export default class JutsuLookup extends Application5e {
  /** @override */
  static DEFAULT_OPTIONS = {
    actor: null,
    classes: ["jutsu-lookup"],
    position: {
      width: 980,
      height: 780
    },
    tag: "section",
    window: {
      resizable: true,
      title: "N5EB.JutsuLookup.Title"
    }
  };

  /** @override */
  static PARTS = {
    content: {
      template: "systems/n5eb/templates/apps/jutsu-lookup.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Base cached jutsu lookup entries without actor ownership state.
   * @type {object[]}
   */
  #baseEntries = [];

  /**
   * Actor-aware jutsu lookup entries.
   * @type {object[]}
   */
  #entries = [];

  /**
   * Entries that match the current filters.
   * @type {object[]}
   */
  #filteredEntries = [];

  /**
   * Lookup map of entries by UUID.
   * @type {Map<string, object>}
   */
  #entriesByUuid = new Map();

  /**
   * Current load state.
   * @type {"idle"|"loading"|"ready"|"error"}
   */
  #loadState = "idle";

  /**
   * Active load promise.
   * @type {Promise<object[]>|null}
   */
  #loadPromise = null;

  /**
   * Last load error.
   * @type {Error|null}
   */
  #loadError = null;

  /**
   * Current number of filtered rows to render.
   * @type {number}
   */
  #visibleLimit = RESULT_INCREMENT;

  /**
   * Currently previewed jutsu UUID.
   * @type {string}
   */
  #previewUuid = "";

  /**
   * Debounced filter timer.
   * @type {number|null}
   */
  #filterTimeout = null;

  /**
   * Actor item hook registrations.
   * @type {{ hook: string, id: number }[]}
   */
  #actorHooks = [];

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.#getActor();
    context.count = this.#entries.length;
    context.filterRanks = getJutsuRankFilterOptions("", { allLabel: "N5EB.JutsuLookup.Filters.AllRanks" });
    context.jutsuKinds = getJutsuKindOptions(this.#entries, { allLabel: "N5EB.JutsuLookup.Filters.AllTypes" });
    context.jutsuActions = getSingleValueFilterOptions(
      this.#entries, "activation", "activationLabel", "N5EB.JutsuLookup.Filters.AllActions"
    );
    context.jutsuActionTypes = getSingleValueFilterOptions(
      this.#entries, "actionType", "actionTypeLabel", "N5EB.JutsuLookup.Filters.AllRollTypes"
    );
    context.jutsuCosts = getJutsuCostOptions(this.#entries, { allLabel: "N5EB.JutsuLookup.Filters.AllCosts" });
    context.jutsuComponents = getMultiValueFilterOptions(
      this.#entries, "components", "componentLabels", "N5EB.JutsuLookup.Filters.AllComponents"
    );
    context.jutsuKeywords = getMultiValueFilterOptions(
      this.#entries, "keywords", "keywordLabels", "N5EB.JutsuLookup.Filters.AllKeywords"
    );
    context.jutsuSources = getPackFilterOptions(this.#entries, { allLabel: "N5EB.JutsuLookup.Filters.AllSources" });
    context.initialPreview = this.#getBlankPreview();
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.addEventListener("input", this.#onFilterInput.bind(this));
    this.element.addEventListener("change", this.#onFilterInput.bind(this));
    this.element.addEventListener("click", this.#onClick.bind(this));
    this.element.addEventListener("dragstart", this.#onDragStart.bind(this));
    this.#registerActorHooks();
    this.#populateFilterControls();
    this.#syncLoadState();

    if ( this.#loadState === "idle" ) this.#loadEntries();
    else if ( this.#loadState === "ready" ) this.#applyFilters({ resetLimit: false });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onClose(options) {
    if ( this.#filterTimeout ) window.clearTimeout(this.#filterTimeout);
    this.#filterTimeout = null;
    for ( const { hook, id } of this.#actorHooks ) Hooks.off(hook, id);
    this.#actorHooks = [];
    await super._onClose(options);
  }

  /* -------------------------------------------- */
  /*  Event Listeners                             */
  /* -------------------------------------------- */

  /**
   * Handle filter input changes.
   * @param {Event} event  Triggering event.
   */
  #onFilterInput(event) {
    if ( !event.target.closest?.(".jutsu-lookup-filter") ) return;
    this.#scheduleFilterUpdate();
  }

  /* -------------------------------------------- */

  /**
   * Handle clicks in the lookup.
   * @param {PointerEvent} event  Triggering event.
   */
  async #onClick(event) {
    const clear = event.target.closest("[data-filter-clear]");
    if ( clear ) {
      this.#clearFilters();
      return;
    }

    const refresh = event.target.closest("[data-lookup-refresh]");
    if ( refresh ) {
      event.preventDefault();
      invalidateJutsuLookupCache();
      this.#loadEntries({ refresh: true });
      return;
    }

    const retry = event.target.closest("[data-lookup-retry]");
    if ( retry ) {
      event.preventDefault();
      this.#loadEntries({ refresh: true });
      return;
    }

    const showMore = event.target.closest("[data-show-more]");
    if ( showMore ) {
      event.preventDefault();
      this.#visibleLimit += RESULT_INCREMENT;
      this.#renderResults();
      return;
    }

    const open = event.target.closest("[data-open-uuid]");
    if ( open ) {
      event.preventDefault();
      event.stopPropagation();
      if ( !open.dataset.openUuid ) return;
      const item = await fromUuid(open.dataset.openUuid);
      item?.sheet?.render(true);
      return;
    }

    const row = event.target.closest(".jutsu-result");
    if ( !row ) return;
    if ( event.target.closest("button, a, input, select, textarea") ) return;
    const entry = this.#entriesByUuid.get(row.dataset.uuid);
    if ( entry ) this.#previewEntry(entry, row);
  }

  /* -------------------------------------------- */

  /**
   * Handle dragging a lookup row.
   * @param {DragEvent} event  Drag event.
   */
  #onDragStart(event) {
    const row = event.target.closest(".jutsu-result");
    const entry = this.#entriesByUuid.get(row?.dataset.uuid);
    if ( !row || !entry || entry.known ) {
      event.preventDefault();
      return;
    }

    try {
      const { type } = foundry.utils.parseUuid(entry.uuid);
      event.dataTransfer.setData("text/plain", JSON.stringify({ type, uuid: entry.uuid }));
    } catch(err) {
      console.error(err);
    }
  }

  /* -------------------------------------------- */
  /*  Loading                                     */
  /* -------------------------------------------- */

  /**
   * Load lookup data.
   * @param {object} [options]
   * @param {boolean} [options.refresh=false]  Force rebuilding the source cache.
   * @returns {Promise<object[]>}
   */
  async #loadEntries({ refresh=false }={}) {
    if ( this.#loadPromise && !refresh ) return this.#loadPromise;

    this.#loadState = "loading";
    this.#loadError = null;
    this.#filteredEntries = [];
    this.#visibleLimit = RESULT_INCREMENT;
    this.#syncLoadState();
    this.#renderResults();

    this.#loadPromise = getCachedJutsuLookupEntries({ refresh })
      .then(entries => {
        this.#baseEntries = entries;
        this.#loadState = "ready";
        this.#loadError = null;
        this.#loadPromise = null;
        this.#refreshActorOwnership();
        if ( !this.element?.isConnected ) return entries;
        this.#populateFilterControls();
        this.#syncLoadState();
        this.#applyFilters();
        return entries;
      })
      .catch(err => {
        console.error(err);
        this.#loadState = "error";
        this.#loadError = err;
        this.#loadPromise = null;
        this.#entries = [];
        this.#filteredEntries = [];
        this.#entriesByUuid = new Map();
        this.#syncLoadState();
        this.#renderResults();
        return [];
      });
    return this.#loadPromise;
  }

  /* -------------------------------------------- */

  /**
   * Refresh actor-specific known state without rebuilding the base index.
   */
  #refreshActorOwnership() {
    this.#entries = applyJutsuLookupOwnership(this.#baseEntries, this.#getActor());
    this.#entriesByUuid = new Map(this.#entries.map(entry => [entry.uuid, entry]));
  }

  /* -------------------------------------------- */

  /**
   * Register actor item change hooks for known-state updates.
   */
  #registerActorHooks() {
    if ( this.#actorHooks.length ) return;
    const actor = this.#getActor();
    if ( !actor ) return;

    const updateKnownState = item => {
      if ( item?.parent?.uuid !== actor.uuid ) return;
      if ( item.type !== "spell" ) return;
      this.#refreshActorOwnership();
      this.#applyFilters({ resetLimit: false });
    };
    for ( const hook of ["createItem", "updateItem", "deleteItem"] ) {
      this.#actorHooks.push({ hook, id: Hooks.on(hook, updateKnownState) });
    }
  }

  /* -------------------------------------------- */
  /*  Filtering                                   */
  /* -------------------------------------------- */

  /**
   * Debounce filter updates.
   */
  #scheduleFilterUpdate() {
    if ( this.#filterTimeout ) window.clearTimeout(this.#filterTimeout);
    this.#filterTimeout = window.setTimeout(() => {
      this.#filterTimeout = null;
      this.#applyFilters();
    }, FILTER_DEBOUNCE_MS);
  }

  /* -------------------------------------------- */

  /**
   * Apply current filters to lookup entries.
   * @param {object} [options]
   * @param {boolean} [options.resetLimit=true]  Reset rendered row count.
   */
  #applyFilters({ resetLimit=true }={}) {
    if ( resetLimit ) this.#visibleLimit = RESULT_INCREMENT;
    const filters = this.#getFilters();
    this.#filteredEntries = this.#entries.filter(entry => this.#entryMatchesFilters(entry, filters));
    this.#renderResults();
    this.#syncFilterState();
  }

  /* -------------------------------------------- */

  /**
   * Get active filter values.
   * @returns {object}
   */
  #getFilters() {
    return {
      search: this.element.querySelector("[data-filter='search']")?.value
        ?.trim().toLocaleLowerCase(game.i18n.lang) ?? "",
      rank: this.element.querySelector("[data-filter='rank']")?.value ?? "",
      kind: this.element.querySelector("[data-filter='kind']")?.value ?? "",
      source: this.element.querySelector("[data-filter='source']")?.value ?? "",
      activation: this.element.querySelector("[data-filter='activation']")?.value ?? "",
      actionType: this.element.querySelector("[data-filter='actionType']")?.value ?? "",
      cost: this.element.querySelector("[data-filter='cost']")?.value ?? "",
      components: Array.from(this.element.querySelectorAll("[data-filter='component']:checked"))
        .map(input => input.value).filter(Boolean),
      keywords: Array.from(this.element.querySelectorAll("[data-filter='keyword']:checked"))
        .map(input => input.value).filter(Boolean)
    };
  }

  /* -------------------------------------------- */

  /**
   * Test an entry against the active filters.
   * @param {object} entry    Lookup entry.
   * @param {object} filters  Active filters.
   * @returns {boolean}
   */
  #entryMatchesFilters(entry, filters) {
    return (!filters.search || entry.search.includes(filters.search))
      && jutsuRankMatchesFilter(entry.rank, filters.rank)
      && (!filters.kind || entry.kind === filters.kind)
      && (!filters.source || entry.sourceKey === filters.source)
      && (!filters.activation || entry.activation === filters.activation)
      && (!filters.actionType || entry.actionType === filters.actionType)
      && (!filters.cost || entry.costKey === filters.cost)
      && (!filters.components.length || filters.components.every(component => entry.components.includes(component)))
      && (!filters.keywords.length || filters.keywords.every(keyword => entry.keywords.includes(keyword)));
  }

  /* -------------------------------------------- */

  /**
   * Clear all filters except search.
   */
  #clearFilters() {
    for ( const filter of this.element.querySelectorAll(".jutsu-lookup-filter") ) {
      if ( filter.dataset.filter === "search" ) continue;
      if ( filter instanceof HTMLInputElement && (filter.type === "checkbox") ) filter.checked = false;
      else if ( "value" in filter ) filter.value = "";
    }
    this.#applyFilters();
  }

  /* -------------------------------------------- */

  /**
   * Update active filter count.
   */
  #syncFilterState() {
    const active = Array.from(this.element.querySelectorAll(".jutsu-lookup-filter")).filter(filter => {
      if ( filter.dataset.filter === "search" ) return false;
      if ( filter instanceof HTMLInputElement && (filter.type === "checkbox") ) return filter.checked;
      return Boolean(filter.value);
    }).length;
    const count = this.element.querySelector("[data-filter-count]");
    if ( count ) {
      count.hidden = active === 0;
      count.replaceChildren(`${active}`);
    }
  }

  /* -------------------------------------------- */
  /*  DOM Updates                                 */
  /* -------------------------------------------- */

  /**
   * Populate filter controls from loaded entries.
   */
  #populateFilterControls() {
    this.#replaceSelectOptions(
      "rank", getJutsuRankFilterOptions(this.element?.querySelector("[data-filter='rank']")?.value ?? "", {
        allLabel: "N5EB.JutsuLookup.Filters.AllRanks"
      })
    );
    this.#replaceSelectOptions(
      "kind", getJutsuKindOptions(this.#entries, { allLabel: "N5EB.JutsuLookup.Filters.AllTypes" })
    );
    this.#replaceSelectOptions(
      "source", getPackFilterOptions(this.#entries, { allLabel: "N5EB.JutsuLookup.Filters.AllSources" })
    );
    this.#replaceSelectOptions(
      "activation", getSingleValueFilterOptions(
        this.#entries, "activation", "activationLabel", "N5EB.JutsuLookup.Filters.AllActions"
      )
    );
    this.#replaceSelectOptions(
      "actionType", getSingleValueFilterOptions(
        this.#entries, "actionType", "actionTypeLabel", "N5EB.JutsuLookup.Filters.AllRollTypes"
      )
    );
    this.#replaceSelectOptions(
      "cost", getJutsuCostOptions(this.#entries, { allLabel: "N5EB.JutsuLookup.Filters.AllCosts" })
    );
    this.#replaceCheckboxOptions(
      "component", "[data-component-options]", getMultiValueFilterOptions(
        this.#entries, "components", "componentLabels", "N5EB.JutsuLookup.Filters.AllComponents"
      )
    );
    this.#replaceCheckboxOptions("keyword", "[data-keyword-options]", getMultiValueFilterOptions(
      this.#entries, "keywords", "keywordLabels", "N5EB.JutsuLookup.Filters.AllKeywords"
    ));
  }

  /* -------------------------------------------- */

  /**
   * Replace select options while preserving selection where possible.
   * @param {string} filter    Filter key.
   * @param {object[]} options Filter options.
   */
  #replaceSelectOptions(filter, options) {
    const select = this.element?.querySelector(`[data-filter='${filter}']`);
    if ( !select ) return;
    const selected = select.value;
    select.replaceChildren(...options.map(option => new Option(option.label, option.value)));
    select.value = options.some(option => option.value === selected) ? selected : "";
  }

  /* -------------------------------------------- */

  /**
   * Replace checkbox filter options.
   * @param {string} filter             Filter key.
   * @param {string} containerSelector  Options container selector.
   * @param {object[]} options          Filter options.
   */
  #replaceCheckboxOptions(filter, containerSelector, options) {
    const container = this.element?.querySelector(containerSelector);
    if ( !container ) return;
    const selected = new Set(Array.from(container.querySelectorAll(`[data-filter='${filter}']:checked`))
      .map(input => input.value));
    const controls = [];
    for ( const option of options ) {
      if ( !option.value ) continue;
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "jutsu-lookup-filter";
      input.dataset.filter = filter;
      input.value = option.value;
      input.checked = selected.has(option.value);
      const span = document.createElement("span");
      span.textContent = option.label;
      label.append(input, span);
      controls.push(label);
    }
    container.replaceChildren(...controls);
  }

  /* -------------------------------------------- */

  /**
   * Render the current filtered result slice.
   */
  #renderResults() {
    const list = this.element?.querySelector("[data-results-list]");
    if ( !list ) return;

    const shownEntries = this.#loadState === "ready"
      ? this.#filteredEntries.slice(0, this.#visibleLimit)
      : [];
    list.replaceChildren(...shownEntries.map(entry => this.#createResultRow(entry)));

    this.element.querySelector("[data-source-summary]")?.replaceChildren(
      game.i18n.format("N5EB.JutsuLookup.SourceSummary", { count: this.#entries.length })
    );
    this.element.querySelector("[data-rendered-count]")?.replaceChildren(`${shownEntries.length}`);
    this.element.querySelector("[data-visible-count]")?.replaceChildren(`${this.#filteredEntries.length}`);
    this.element.querySelector("[data-total-count]")?.replaceChildren(`${this.#entries.length}`);

    const empty = this.element.querySelector("[data-filter-empty]");
    if ( empty ) empty.hidden = (this.#loadState !== "ready") || (this.#filteredEntries.length > 0);

    const showMore = this.element.querySelector("[data-show-more]");
    if ( showMore ) showMore.hidden = (this.#loadState !== "ready") || (shownEntries.length >= this.#filteredEntries.length);

    if ( this.#loadState !== "ready" ) {
      this.#previewEntry(null);
      return;
    }

    const preview = this.#filteredEntries.find(entry => entry.uuid === this.#previewUuid) ?? this.#filteredEntries[0];
    this.#previewEntry(preview ?? null);
  }

  /* -------------------------------------------- */

  /**
   * Create a result row.
   * @param {object} entry  Lookup entry.
   * @returns {HTMLLIElement}
   */
  #createResultRow(entry) {
    const li = document.createElement("li");
    li.classList.add("jutsu-result", "item");
    li.dataset.uuid = entry.uuid;
    li.draggable = !entry.known;
    if ( entry.known ) li.classList.add("known");
    if ( entry.uuid === this.#previewUuid ) li.classList.add("previewed");

    const row = document.createElement("div");
    row.className = "item-row";
    row.append(
      this.#createNameCell(entry),
      this.#createDetailCell("item-rank", entry.rankLabel),
      this.#createDetailCell("item-type", entry.kindLabel),
      this.#createDetailCell("item-cost", entry.costLabel),
      this.#createSourceCell(entry.sourceLabel),
      this.#createControlsCell(entry)
    );
    li.append(row);
    return li;
  }

  /* -------------------------------------------- */

  /**
   * Create the name cell for a result row.
   * @param {object} entry  Lookup entry.
   * @returns {HTMLDivElement}
   */
  #createNameCell(entry) {
    const cell = document.createElement("div");
    cell.className = "item-name";

    const image = document.createElement("img");
    image.className = "item-image gold-icon";
    image.loading = "lazy";
    image.src = entry.img;
    image.alt = entry.name;
    image.draggable = false;

    const name = document.createElement("div");
    name.className = "name name-stacked";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = entry.name;
    const subtitle = document.createElement("span");
    subtitle.className = "subtitle";
    subtitle.textContent = entry.detailLabel;
    name.append(title, subtitle);

    cell.append(image, name);
    return cell;
  }

  /* -------------------------------------------- */

  /**
   * Create a row detail cell.
   * @param {string} className  Detail class.
   * @param {string} text       Cell text.
   * @returns {HTMLDivElement}
   */
  #createDetailCell(className, text) {
    const cell = document.createElement("div");
    cell.className = `item-detail ${className}`;
    cell.textContent = text ?? "";
    return cell;
  }

  /* -------------------------------------------- */

  /**
   * Create a source cell.
   * @param {string} source  Source label.
   * @returns {HTMLDivElement}
   */
  #createSourceCell(source) {
    const cell = this.#createDetailCell("item-source", "");
    const span = document.createElement("span");
    span.className = "condensed";
    span.textContent = source ?? "";
    cell.append(span);
    return cell;
  }

  /* -------------------------------------------- */

  /**
   * Create row control buttons.
   * @param {object} entry  Lookup entry.
   * @returns {HTMLDivElement}
   */
  #createControlsCell(entry) {
    const controls = this.#createDetailCell("item-controls", "");
    if ( entry.known ) {
      const badge = document.createElement("span");
      badge.className = "known-badge";
      badge.textContent = game.i18n.localize("N5EB.JutsuLookup.Known");
      controls.append(badge);
    }

    const open = document.createElement("button");
    open.type = "button";
    open.className = "unbutton";
    open.dataset.openUuid = entry.uuid;
    open.dataset.tooltip = "N5EB.JutsuLookup.OpenItem";
    open.ariaLabel = game.i18n.localize("N5EB.JutsuLookup.OpenItem");
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-arrow-up-right-from-square";
    icon.inert = true;
    open.append(icon);
    controls.append(open);
    return controls;
  }

  /* -------------------------------------------- */

  /**
   * Update loading and error UI.
   */
  #syncLoadState() {
    if ( !this.element ) return;
    const loading = this.#loadState === "loading";
    const error = this.#loadState === "error";
    const status = this.element.querySelector("[data-lookup-status]");
    if ( status ) {
      status.hidden = !loading && !error;
      status.classList.toggle("error", error);
    }

    const message = this.element.querySelector("[data-lookup-status-message]");
    if ( message ) {
      if ( loading ) message.textContent = game.i18n.localize("N5EB.JutsuLookup.Loading");
      else if ( error ) message.textContent = game.i18n.localize("N5EB.JutsuLookup.LoadError");
      else message.textContent = "";
      if ( error && this.#loadError?.message ) message.title = this.#loadError.message;
      else message.removeAttribute("title");
    }

    const retry = this.element.querySelector("[data-lookup-retry]");
    if ( retry ) retry.hidden = !error;
    const refresh = this.element.querySelector("[data-lookup-refresh]");
    if ( refresh ) refresh.disabled = loading;
    for ( const filter of this.element.querySelectorAll(".jutsu-lookup-filter") ) {
      filter.disabled = this.#loadState !== "ready";
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the preview panel from an entry.
   * @param {object|null} entry     Lookup entry.
   * @param {HTMLElement} [row]     Result row.
   */
  #previewEntry(entry, row=null) {
    const preview = this.element?.querySelector("[data-preview]");
    if ( !preview ) return;
    entry ??= this.#getBlankPreview();
    this.#previewUuid = entry.uuid ?? "";

    preview.dataset.uuid = entry.uuid ?? "";
    preview.querySelector("[data-preview-name]")?.replaceChildren(entry.name ?? "");
    preview.querySelector("[data-preview-type]")?.replaceChildren(entry.kindLabel ?? "");
    preview.querySelector("[data-preview-rank]")?.replaceChildren(entry.rankLabel ?? "");
    this.#setPreviewTag(preview, "source", entry.sourceLabel);
    this.#setPreviewTag(preview, "cost", entry.costLabel);
    this.#setPreviewTag(preview, "activation", entry.activationLabel);
    this.#setPreviewTag(preview, "action-type", entry.actionTypeLabel);
    this.#setPreviewTag(preview, "components", entry.componentsLabel);
    this.#setPreviewTag(preview, "keywords", entry.keywordsLabel);

    const image = preview.querySelector("[data-preview-image]");
    if ( image ) {
      image.src = entry.img;
      image.alt = entry.name ?? "";
    }

    const open = preview.querySelector("[data-preview-open]");
    if ( open ) {
      open.dataset.openUuid = entry.uuid ?? "";
      open.disabled = !entry.uuid;
    }

    const description = preview.querySelector("[data-preview-description]");
    if ( description ) description.innerHTML = entry.description?.trim()
      || `<p>${game.i18n.localize("N5EB.JutsuLookup.NoPreview")}</p>`;

    for ( const candidate of this.element.querySelectorAll(".jutsu-result.previewed") ) {
      candidate.classList.remove("previewed");
    }
    row ??= Array.from(this.element.querySelectorAll(".jutsu-result")).find(candidate => {
      return candidate.dataset.uuid === entry.uuid;
    });
    row?.classList.add("previewed");
  }

  /* -------------------------------------------- */

  /**
   * Set an optional preview tag.
   * @param {HTMLElement} preview  Preview root.
   * @param {string} key           Tag key.
   * @param {string} value         Tag value.
   */
  #setPreviewTag(preview, key, value) {
    const tag = preview.querySelector(`[data-preview-tag='${key}']`);
    if ( !tag ) return;
    tag.hidden = !value;
    tag.replaceChildren(value ?? "");
  }

  /* -------------------------------------------- */

  /**
   * Get a blank preview model.
   * @returns {object}
   */
  #getBlankPreview() {
    return {
      img: "icons/svg/mystery-man.svg",
      name: "",
      rankLabel: "",
      kindLabel: "",
      sourceLabel: "",
      costLabel: "",
      activationLabel: "",
      actionTypeLabel: "",
      componentsLabel: "",
      keywordsLabel: "",
      description: "",
      uuid: ""
    };
  }

  /* -------------------------------------------- */

  /**
   * Get the actor associated with this lookup.
   * @returns {Actor5e|null}
   */
  #getActor() {
    const actor = this.options.actor;
    if ( actor?.documentName === "Actor" ) return actor;
    if ( typeof actor === "string" ) return game.actors.get(actor) ?? null;
    return null;
  }
}
