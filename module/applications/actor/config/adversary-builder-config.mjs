import BaseConfigSheet from "../api/base-config-sheet.mjs";

const JUTSU_PACKS = ["jutsus", "t7-jutsus", "hb-jutsus"];
const RANK_ORDER = ["e", "d", "c", "b", "a", "s"];
const DEFAULT_ICON = "icons/svg/mystery-man.svg";
const ADVERSARY_FEATURE_TYPES = new Set(["adversaryTrait", "adversaryPassive"]);
const FEATURE_INDEX_FIELDS = [
  "img", "type", "system.description.value", "system.type.value", "system.type.subtype",
  "system.type.nestedsubtype", "system.prerequisites.level", "system.requirements",
  "flags.n5eb.legacyImport.sourcePath", "_stats.legacyImport.sourcePath"
];

/**
 * NPC sheet child application for configuring N5eB adversaries.
 */
export default class AdversaryBuilderConfig extends BaseConfigSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["adversary-builder"],
    actions: {
      addSelected: AdversaryBuilderConfig.#addSelected,
      applyDefaults: AdversaryBuilderConfig.#applyDefaults,
      save: AdversaryBuilderConfig.#save,
      switchTab: AdversaryBuilderConfig.#switchTab
    },
    form: {
      submitOnChange: false
    },
    position: {
      width: 960,
      height: 780
    }
  };

  /** @override */
  static PARTS = {
    config: {
      template: "systems/n5eb/templates/actors/config/adversary-builder-config.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Currently active content picker tab.
   * @type {string}
   */
  #activeTab = "features";

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.format("N5EB.Adversary.Builder.Title", { name: this.document.name });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.document;
    const source = getAdversarySource(this.document);
    context.source = source;
    context.sourceSpecialRoles = Object.fromEntries(
      Object.keys(CONFIG.DND5E.adversarySpecialRoles).map(key => [key, source.specialRoles.has(key)])
    );

    const resources = this.document.system._source.resources ?? {};
    context.resources = {
      tenacity: resources.tenacity ?? { max: 0, spent: 0, softMax: 0 },
      eliteact: resources.eliteact ?? { max: 0, spent: 0 }
    };

    context.identity = getAdversaryIdentity(source);
    context.summary = getAdversarySummary(source);
    context.warnings = getAdversaryWarnings(this.document, source);
    context.suggestions = await getAdversarySuggestions(this.document, source);
    context.contentTabs = [
      {
        id: "features",
        label: "N5EB.Adversary.Builder.SuggestedFeatures",
        count: context.suggestions.features.length,
        active: this.#activeTab === "features"
      },
      {
        id: "jutsu",
        label: "N5EB.Adversary.Builder.SuggestedJutsu",
        count: context.suggestions.jutsu.length,
        active: this.#activeTab === "jutsu"
      },
      {
        id: "selected",
        label: "N5EB.Adversary.Builder.Selected",
        count: 0,
        active: this.#activeTab === "selected"
      }
    ];
    context.filterRanks = getRankFilterOptions();
    context.featureKinds = getFeatureKindOptions();
    context.featureCategories = getFeatureCategoryOptions(context.suggestions.features);
    context.jutsuKinds = getJutsuKindOptions();
    context.featurePacks = getPackFilterOptions(context.suggestions.features);
    context.jutsuPacks = getPackFilterOptions(context.suggestions.jutsu);
    context.preview = context.suggestions.features.find(s => !s.disabled)
      ?? context.suggestions.jutsu.find(s => !s.disabled)
      ?? context.suggestions.features[0]
      ?? context.suggestions.jutsu[0]
      ?? null;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#syncActiveTab();
    this.#bindBuilderControls();
    this.#syncSummary();
    this.#syncIdentity();
    this.#refreshAllFilters();
    this.#refreshSelection();
    this.#previewInitialSuggestion();
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Save adversary metadata.
   * @this {AdversaryBuilderConfig}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static async #save(event, target) {
    event.preventDefault();
    await this.#saveAdversary();
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Save metadata and embed selected suggestions.
   * @this {AdversaryBuilderConfig}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static async #addSelected(event, target) {
    event.preventDefault();
    await this.#saveAdversary();

    const selected = Array.from(this.element.querySelectorAll("input[name='itemUuids']:checked:not(:disabled)"))
      .map(input => input.value);
    const existing = new Set(this.document.items.map(item => item.getFlag("n5eb", "adversaryBuilder.sourceUuid")));
    const toCreate = [];
    for ( const uuid of selected ) {
      if ( existing.has(uuid) ) continue;
      const item = await fromUuid(uuid);
      if ( !item ) continue;
      const data = item.pack ? game.items.fromCompendium(item, { keepId: false }) : item.toObject();
      delete data._id;
      foundry.utils.setProperty(data, "flags.n5eb.adversaryBuilder.sourceUuid", uuid);
      toCreate.push(data);
    }
    if ( toCreate.length ) await this.document.createEmbeddedDocuments("Item", toCreate);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Apply calculated resource defaults for the selected adversary class and level.
   * @this {AdversaryBuilderConfig}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static async #applyDefaults(event, target) {
    event.preventDefault();
    const summary = this.#currentSummary();
    const tenacity = this.element.querySelector("input[name='resources.tenacity.max']");
    const eliteActions = this.element.querySelector("input[name='resources.eliteact.max']");
    if ( tenacity ) tenacity.value = summary.tenacity;
    if ( eliteActions ) eliteActions.value = summary.eliteActionValue;
    this.#syncSummary();
  }

  /* -------------------------------------------- */

  /**
   * Switch the content picker tab.
   * @this {AdversaryBuilderConfig}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static async #switchTab(event, target) {
    event.preventDefault();
    this.#activeTab = target.dataset.tab ?? "features";
    this.#syncActiveTab();
  }

  /* -------------------------------------------- */
  /*  Event Wiring                                */
  /* -------------------------------------------- */

  /**
   * Bind local builder controls after render.
   */
  #bindBuilderControls() {
    const root = this.element.querySelector(".adversary-builder");
    if ( !root ) return;

    root.addEventListener("input", event => {
      const target = event.target;
      if ( !(target instanceof HTMLElement) ) return;
      if ( target.matches(".adversary-filter") ) this.#applyFilters(target.closest("[data-content-panel]"));
      if ( target.matches("[name='adversary.level']") ) this.#syncSummary();
    });

    root.addEventListener("change", event => {
      const target = event.target;
      if ( !(target instanceof HTMLElement) ) return;
      if ( target.matches(".adversary-filter") ) this.#applyFilters(target.closest("[data-content-panel]"));
      if ( target.matches("input[name='itemUuids']") ) {
        target.closest(".adversary-suggestion")?.classList.toggle("selected", target.checked);
        this.#refreshSelection();
      }
      if ( target.name?.startsWith("adversary.") ) {
        this.#syncSummary();
        this.#syncIdentity();
      }
    });

    root.addEventListener("click", async event => {
      const target = event.target;
      if ( !(target instanceof HTMLElement) ) return;

      const remove = target.closest("[data-remove-selected]");
      if ( remove ) {
        event.preventDefault();
        this.#removeSelected(remove.dataset.removeSelected);
        return;
      }

      const openPreview = target.closest("[data-preview-open]");
      if ( openPreview ) {
        event.preventDefault();
        const uuid = this.element.querySelector("[data-preview]")?.dataset.uuid;
        if ( uuid ) (await fromUuid(uuid))?.sheet?.render(true);
        return;
      }

      const row = target.closest(".adversary-suggestion");
      if ( row ) this.#previewSuggestion(row);
    });
  }

  /* -------------------------------------------- */

  /**
   * Synchronize visible content picker tab state.
   */
  #syncActiveTab() {
    for ( const button of this.element.querySelectorAll("[data-action='switchTab']") ) {
      const active = button.dataset.tab === this.#activeTab;
      button.classList.toggle("active", active);
      button.ariaPressed = active;
    }
    for ( const panel of this.element.querySelectorAll("[data-content-panel]") ) {
      panel.hidden = panel.dataset.contentPanel !== this.#activeTab;
    }
    this.#refreshSelection();
    this.#previewInitialSuggestion();
  }

  /* -------------------------------------------- */

  /**
   * Recalculate the live summary from current form controls.
   */
  #syncSummary() {
    const summary = this.#currentSummary();
    this.element.querySelector("[data-summary-mission-xp]")?.replaceChildren(`${summary.missionXp}`);
    this.element.querySelector("[data-summary-tenacity]")?.replaceChildren(`${summary.tenacity}`);
    this.element.querySelector("[data-summary-elite-actions]")?.replaceChildren(summary.eliteActions);
    this.element.querySelector("[data-summary-fixed-cost]")?.replaceChildren(summary.fixedCostLabel);

    const phaseList = this.element.querySelector("[data-summary-phases]");
    if ( phaseList ) phaseList.hidden = this.#currentAdversary().class !== "solo";
  }

  /* -------------------------------------------- */

  /**
   * Refresh the compact identity preview from current form controls.
   */
  #syncIdentity() {
    const adversary = this.#currentAdversary();
    const identity = getAdversaryIdentity(adversary);
    this.element.querySelector("[data-identity-rank]")?.replaceChildren(identity.rank.abbreviation);
    this.element.querySelector("[data-identity-class]")?.replaceChildren(identity.class.label);
    this.element.querySelector("[data-identity-role]")?.replaceChildren(identity.role.label);

    const discipline = this.element.querySelector("[data-identity-discipline]");
    if ( discipline ) {
      discipline.hidden = !identity.discipline;
      discipline.replaceChildren(identity.discipline?.label ?? "");
    }

    const specialRoles = this.element.querySelector("[data-identity-special-roles]");
    if ( specialRoles ) {
      specialRoles.replaceChildren();
      specialRoles.hidden = !identity.specialRoles.length;
      for ( const role of identity.specialRoles ) {
        const chip = document.createElement("span");
        chip.className = "identity-chip special";
        chip.textContent = role.label;
        specialRoles.append(chip);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply all content panel filters.
   */
  #refreshAllFilters() {
    for ( const panel of this.element.querySelectorAll("[data-content-panel]") ) this.#applyFilters(panel);
  }

  /* -------------------------------------------- */

  /**
   * Apply filters to one content panel.
   * @param {HTMLElement|null} panel  Panel to filter.
   */
  #applyFilters(panel) {
    if ( !panel || (panel.dataset.contentPanel === "selected") ) return;
    const search = panel.querySelector("[data-filter='search']")?.value?.trim().toLocaleLowerCase(game.i18n.lang) ?? "";
    const rank = panel.querySelector("[data-filter='rank']")?.value ?? "";
    const kind = panel.querySelector("[data-filter='kind']")?.value ?? "";
    const category = panel.querySelector("[data-filter='category']")?.value ?? "";
    const source = panel.querySelector("[data-filter='source']")?.value ?? "";
    let visible = 0;

    for ( const row of panel.querySelectorAll(".adversary-suggestion") ) {
      const matchesSearch = !search || row.dataset.search?.includes(search);
      const matchesRank = !rank || row.dataset.rank === rank;
      const matchesKind = !kind || row.dataset.kind === kind;
      const matchesCategory = !category || row.dataset.category === category;
      const matchesSource = !source || row.dataset.source === source;
      const hidden = !(matchesSearch && matchesRank && matchesKind && matchesCategory && matchesSource);
      row.hidden = hidden;
      if ( !hidden ) visible++;
    }

    const empty = panel.querySelector("[data-filter-empty]");
    if ( empty ) empty.hidden = visible > 0;
  }

  /* -------------------------------------------- */

  /**
   * Preview the first visible suggestion in the active panel.
   */
  #previewInitialSuggestion() {
    const panel = this.element.querySelector(`[data-content-panel='${this.#activeTab}']`);
    if ( !panel || (this.#activeTab === "selected") ) return;
    const row = panel.querySelector(".adversary-suggestion:not([hidden])");
    if ( row ) this.#previewSuggestion(row);
  }

  /* -------------------------------------------- */

  /**
   * Update the preview panel from a suggestion row.
   * @param {HTMLElement} row  Suggestion row.
   */
  #previewSuggestion(row) {
    const preview = this.element.querySelector("[data-preview]");
    if ( !preview ) return;
    preview.dataset.uuid = row.dataset.uuid ?? "";
    preview.querySelector("[data-preview-name]")?.replaceChildren(row.dataset.name ?? "");
    preview.querySelector("[data-preview-type]")?.replaceChildren(row.dataset.typeLabel ?? "");
    preview.querySelector("[data-preview-rank]")?.replaceChildren(row.dataset.rankLabel ?? "");
    preview.querySelector("[data-preview-pack]")?.replaceChildren(row.dataset.packLabel ?? "");
    preview.querySelector("[data-preview-kind]")?.replaceChildren(row.dataset.kindLabel ?? "");

    const image = preview.querySelector("[data-preview-image]");
    if ( image ) {
      image.src = row.dataset.img || DEFAULT_ICON;
      image.alt = row.dataset.name ?? "";
    }

    const description = preview.querySelector("[data-preview-description]");
    const template = row.querySelector("template");
    if ( description ) description.innerHTML = template?.innerHTML?.trim()
      || `<p>${game.i18n.localize("N5EB.Adversary.Builder.NoPreview")}</p>`;

    for ( const candidate of this.element.querySelectorAll(".adversary-suggestion.previewed") ) {
      candidate.classList.remove("previewed");
    }
    row.classList.add("previewed");
  }

  /* -------------------------------------------- */

  /**
   * Refresh selected count and selected tray.
   */
  #refreshSelection() {
    const rows = Array.from(this.element.querySelectorAll("input[name='itemUuids']:checked"))
      .map(input => input.closest(".adversary-suggestion"))
      .filter(row => row);

    for ( const counter of this.element.querySelectorAll("[data-selected-count]") ) {
      counter.replaceChildren(`${rows.length}`);
    }

    for ( const button of this.element.querySelectorAll("[data-action='addSelected']") ) {
      button.disabled = !rows.length;
    }

    const list = this.element.querySelector("[data-selected-list]");
    const empty = this.element.querySelector("[data-selected-empty]");
    if ( !list || !empty ) return;
    list.replaceChildren();
    empty.hidden = rows.length > 0;

    for ( const row of rows ) list.append(this.#renderSelectedRow(row));
  }

  /* -------------------------------------------- */

  /**
   * Render a selected content row.
   * @param {HTMLElement} row  Source suggestion row.
   * @returns {HTMLElement}
   */
  #renderSelectedRow(row) {
    const item = document.createElement("li");
    item.className = "adversary-selected-item";

    const icon = document.createElement("img");
    icon.src = row.dataset.img || DEFAULT_ICON;
    icon.alt = "";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = row.dataset.name ?? "";

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = [row.dataset.rankLabel, row.dataset.kindLabel, row.dataset.sourceLabel]
      .filter(Boolean).join(" | ");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "unbutton";
    remove.dataset.removeSelected = row.dataset.uuid ?? "";
    remove.ariaLabel = game.i18n.localize("N5EB.Adversary.Builder.RemoveSelected");
    remove.innerHTML = '<i class="fa-solid fa-xmark" inert></i>';

    item.append(icon, name, meta, remove);
    return item;
  }

  /* -------------------------------------------- */

  /**
   * Uncheck a selected suggestion.
   * @param {string} uuid  Suggestion UUID.
   */
  #removeSelected(uuid) {
    if ( !uuid ) return;
    const input = Array.from(this.element.querySelectorAll("input[name='itemUuids']"))
      .find(candidate => candidate.value === uuid);
    if ( input ) {
      input.checked = false;
      input.closest(".adversary-suggestion")?.classList.remove("selected");
    }
    this.#refreshSelection();
  }

  /* -------------------------------------------- */

  /**
   * Get current adversary form values.
   * @returns {object}
   */
  #currentAdversary() {
    return {
      level: Math.clamp(Number(this.#formValue("adversary.level")) || 1, 1, 30),
      rank: normalizeChoice(this.#formValue("adversary.rank"), CONFIG.DND5E.adversaryRanks, "e"),
      class: normalizeChoice(this.#formValue("adversary.class"), CONFIG.DND5E.adversaryClasses, "standard"),
      role: normalizeChoice(this.#formValue("adversary.role"), CONFIG.DND5E.adversaryRoles, "striker"),
      discipline: normalizeChoice(this.#formValue("adversary.discipline"), CONFIG.DND5E.adversaryDisciplines, ""),
      specialRoles: Array.from(this.element.querySelectorAll("input[name^='adversary.specialRoles.']:checked"))
        .map(input => input.name.split(".").at(-1)),
      fixedJutsuCost: Boolean(this.form?.elements.namedItem("adversary.fixedJutsuCost")?.checked)
    };
  }

  /* -------------------------------------------- */

  /**
   * Get current summary from form values.
   * @returns {object}
   */
  #currentSummary() {
    return getAdversarySummary(this.#currentAdversary());
  }

  /* -------------------------------------------- */

  /**
   * Read a named form value.
   * @param {string} name  Form control name.
   * @returns {string|undefined}
   */
  #formValue(name) {
    return this.form?.elements.namedItem(name)?.value;
  }

  /* -------------------------------------------- */

  /**
   * Save form data to the actor.
   * @returns {Promise<void>}
   * @private
   */
  async #saveAdversary() {
    const formData = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.form).object);
    const adversary = formData.adversary ?? {};
    const resources = formData.resources ?? {};
    const specialRoles = Object.entries(adversary.specialRoles ?? {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    const level = Math.clamp(Number(adversary.level) || 1, 1, 30);
    const rank = normalizeChoice(adversary.rank, CONFIG.DND5E.adversaryRanks, "e");
    const cls = normalizeChoice(adversary.class, CONFIG.DND5E.adversaryClasses, "standard");
    const role = normalizeChoice(adversary.role, CONFIG.DND5E.adversaryRoles, "striker");
    const discipline = normalizeChoice(adversary.discipline, CONFIG.DND5E.adversaryDisciplines, "");

    await this.document.update({
      "system.details.adversary.enabled": true,
      "system.details.adversary.level": level,
      "system.details.adversary.rank": rank,
      "system.details.adversary.class": cls,
      "system.details.adversary.role": role,
      "system.details.adversary.discipline": discipline,
      "system.details.adversary.clan": `${adversary.clan ?? ""}`.slugify({ strict: true }),
      "system.details.adversary.affiliation": `${adversary.affiliation ?? ""}`.slugify({ strict: true }),
      "system.details.adversary.specialRoles": specialRoles,
      "system.details.adversary.fixedJutsuCost": Boolean(adversary.fixedJutsuCost),
      "system.details.adversary.migrated": (adversary.migrated === true) || (adversary.migrated === "true"),
      "system.resources.tenacity.max": Math.max(0, Number(resources.tenacity?.max) || 0),
      "system.resources.tenacity.spent": Math.max(0, Number(resources.tenacity?.spent) || 0),
      "system.resources.eliteact.max": Math.max(0, Number(resources.eliteact?.max) || 0),
      "system.resources.eliteact.spent": Math.max(0, Number(resources.eliteact?.spent) || 0)
    });
  }
}

/* -------------------------------------------- */

/**
 * Get a normalized adversary source object from an actor.
 * @param {Actor5e} actor  Actor being configured.
 * @returns {object}
 */
function getAdversarySource(actor) {
  const source = foundry.utils.deepClone(
    actor.system._source.details?.adversary ?? actor.system.details.adversary ?? {}
  );
  source.enabled ??= false;
  source.level = Math.clamp(Number(source.level) || actor.system.details.level || actor.system.details.cr || 1, 1, 30);
  source.rank = normalizeChoice(source.rank, CONFIG.DND5E.adversaryRanks, "e");
  source.class = normalizeChoice(source.class, CONFIG.DND5E.adversaryClasses, "standard");
  source.role = normalizeChoice(source.role, CONFIG.DND5E.adversaryRoles, "striker");
  source.discipline = normalizeChoice(source.discipline, CONFIG.DND5E.adversaryDisciplines, "");
  source.clan ??= "";
  source.affiliation ??= "";
  source.fixedJutsuCost ??= true;
  source.migrated ??= false;
  source.specialRoles = new Set(source.specialRoles ?? []);
  return source;
}

/* -------------------------------------------- */

/**
 * Prepare calculated builder summary values.
 * @param {object} adversary  Adversary source data.
 * @returns {object}
 */
function getAdversarySummary(adversary) {
  const cls = CONFIG.DND5E.adversaryClasses[adversary.class] ?? CONFIG.DND5E.adversaryClasses.standard;
  const tenacityDefault = CONFIG.DND5E.adversaryTenacityDefaults[adversary.class];
  const eliteActionDefault = CONFIG.DND5E.adversaryEliteActionDefaults[adversary.class];
  const tenacity = Math.floor(adversary.level * (tenacityDefault?.levelMultiplier ?? 0));
  const eliteActions = eliteActionDefault?.label ?? "N5EB.Adversary.EliteAction.None";
  const fixedCost = adversary.fixedJutsuCost ? "N5EB.Adversary.Builder.FixedCostOn"
    : "N5EB.Adversary.Builder.FixedCostOff";
  return {
    missionXp: cls.missionXp ?? 0,
    tenacity,
    eliteActions: game.i18n.localize(eliteActions),
    eliteActionValue: Math.max(0, Number(eliteActionDefault?.value) || 0),
    fixedCostLabel: game.i18n.localize(fixedCost),
    phases: adversary.class === "solo" ? CONFIG.DND5E.adversarySoloPhases : []
  };
}

/* -------------------------------------------- */

/**
 * Prepare display identity for an adversary.
 * @param {object} adversary  Adversary source data.
 * @returns {object}
 */
function getAdversaryIdentity(adversary) {
  const specialRoles = Array.from(adversary.specialRoles ?? []).map(key => ({
    key,
    label: CONFIG.DND5E.adversarySpecialRoles[key]?.label ?? key
  })).filter(role => role.key in CONFIG.DND5E.adversarySpecialRoles);

  return {
    rank: {
      key: adversary.rank,
      label: CONFIG.DND5E.adversaryRanks[adversary.rank]?.label ?? adversary.rank.toUpperCase(),
      abbreviation: CONFIG.DND5E.adversaryRanks[adversary.rank]?.abbreviation ?? adversary.rank.toUpperCase()
    },
    class: {
      key: adversary.class,
      label: CONFIG.DND5E.adversaryClasses[adversary.class]?.label ?? adversary.class
    },
    role: {
      key: adversary.role,
      label: CONFIG.DND5E.adversaryRoles[adversary.role]?.label ?? adversary.role
    },
    discipline: adversary.discipline ? {
      key: adversary.discipline,
      label: CONFIG.DND5E.adversaryDisciplines[adversary.discipline]?.label ?? adversary.discipline
    } : null,
    specialRoles
  };
}

/* -------------------------------------------- */

/**
 * Prepare warning messages for the current builder state.
 * @param {Actor5e} actor      Actor being configured.
 * @param {object} adversary   Adversary source data.
 * @returns {string[]}
 */
function getAdversaryWarnings(actor, adversary) {
  const warnings = [];
  if ( adversary.class === "minion" ) {
    const invalid = actor.itemTypes.spell.filter(item => {
      const rank = item.system.effectiveRank ?? item.system.rank;
      return !["d", "c"].includes(rank);
    });
    if ( invalid.length ) warnings.push(game.i18n.format("N5EB.Adversary.Builder.WarnMinionJutsu", {
      count: invalid.length
    }));
  }
  if ( adversary.class === "solo" ) warnings.push(game.i18n.localize("N5EB.Adversary.Builder.WarnSoloManual"));
  return warnings;
}

/* -------------------------------------------- */

/**
 * Collect eligible adversary content from system packs.
 * @param {Actor5e} actor      Actor being configured.
 * @param {object} adversary   Adversary metadata.
 * @returns {Promise<object>}
 */
async function getAdversarySuggestions(actor, adversary) {
  const existing = new Set(actor.items.map(item => item.getFlag("n5eb", "adversaryBuilder.sourceUuid")));
  const features = [];
  const jutsu = [];

  for ( const pack of getN5eItemPacks() ) {
    const index = await pack.getIndex({ fields: FEATURE_INDEX_FIELDS });
    for ( const entry of index ) {
      if ( entry.type !== "feat" ) continue;
      const featureType = foundry.utils.getProperty(entry, "system.type.value");
      if ( !ADVERSARY_FEATURE_TYPES.has(featureType) ) continue;
      features.push(formatSuggestion(entry, pack, featureType, existing));
    }
  }

  for ( const item of game.items ) {
    if ( item.type !== "feat" ) continue;
    const featureType = item.system.type?.value;
    if ( !ADVERSARY_FEATURE_TYPES.has(featureType) ) continue;
    features.push(formatSuggestion(item, null, featureType, existing));
  }

  for ( const packName of JUTSU_PACKS ) {
    const pack = game.packs.get(`n5eb.${packName}`);
    if ( !pack ) continue;
    const index = await pack.getIndex({ fields: [
      "img", "type", "system.description.value", "system.rank", "system.jutsu.type",
      "flags.n5eb.legacyImport.sourcePath"
    ] });
    for ( const entry of index ) {
      if ( entry.type !== "spell" ) continue;
      if ( !isJutsuEligible(entry, adversary) ) continue;
      jutsu.push(formatSuggestion(entry, pack, "spell", existing));
    }
  }

  return {
    features: features.toSorted((lhs, rhs) => sortFeatureSuggestion(lhs, rhs, adversary)),
    jutsu: jutsu.toSorted(sortSuggestion).slice(0, 80)
  };
}

/* -------------------------------------------- */

/**
 * Collect system Item packs for adversary feature indexing.
 * @returns {CompendiumCollection[]}
 */
function getN5eItemPacks() {
  const packs = [];
  for ( const pack of game.packs ) {
    const metadata = pack.metadata ?? {};
    if ( (pack.documentName !== "Item") && (metadata.type !== "Item") ) continue;
    const isSystemPack = (metadata.packageName === "n5eb") || (metadata.package === "n5eb")
      || (metadata.system === "n5eb") || pack.collection?.startsWith("n5eb.");
    if ( isSystemPack ) packs.push(pack);
  }
  return packs;
}

/* -------------------------------------------- */

/**
 * Score how strongly a feature entry matches the current adversary metadata.
 * @param {object} entry      Compendium index entry or Item document.
 * @param {object} adversary  Adversary metadata.
 * @returns {number}
 */
function getFeatureRelevance(entry, adversary) {
  const subtype = foundry.utils.getProperty(entry, "system.type.subtype") ?? entry.category ?? "";
  const sourcePath = entry.sourcePath ?? getSourcePath(entry);
  const rank = getEntryRank(entry);
  let score = 0;

  if ( rank && (RANK_ORDER.indexOf(rank) <= RANK_ORDER.indexOf(adversary.rank)) ) score += 3;

  if ( subtype === "general" ) score += 8;
  if ( subtype === "classMod" ) score += 6;
  if ( subtype === "role" ) {
    const role = adversary.discipline ? `${adversary.role}-${adversary.discipline}` : adversary.role;
    if ( !sourcePath || sourcePath.includes(adversary.role) || sourcePath.includes(role) ) score += 12;
  }
  if ( subtype === "affiliation" ) {
    if ( adversary.affiliation && (!sourcePath || sourcePath.includes(adversary.affiliation)) ) score += 10;
  }
  if ( subtype === "clan" ) {
    if ( adversary.clan && (!sourcePath || sourcePath.includes(adversary.clan)) ) score += 10;
  }
  return score;
}

/* -------------------------------------------- */

/**
 * Determine whether a jutsu entry matches the adversary metadata.
 * @param {object} entry      Compendium index entry.
 * @param {object} adversary  Adversary metadata.
 * @returns {boolean}
 */
function isJutsuEligible(entry, adversary) {
  const rank = getEntryRank(entry) ?? "d";
  const rankIndex = RANK_ORDER.indexOf(rank);
  if ( adversary.class === "minion" ) return ["d", "c"].includes(rank);
  if ( rankIndex > RANK_ORDER.indexOf(adversary.rank) ) return false;

  const jutsuType = foundry.utils.getProperty(entry, "system.jutsu.type") ?? "";
  if ( !adversary.discipline ) return true;
  if ( adversary.discipline === "taijutsu" ) return ["taijutsu", "bukijutsu"].includes(jutsuType);
  return jutsuType === adversary.discipline;
}

/* -------------------------------------------- */

/**
 * Format a compendium index entry or world item for the template.
 * @param {object} entry                  Compendium index entry or Item document.
 * @param {CompendiumCollection|null} pack Source compendium, if any.
 * @param {string} type                   Suggestion type.
 * @param {Set<string>} existing  Embedded source UUIDs.
 * @returns {object}
 */
function formatSuggestion(entry, pack, type, existing) {
  const uuid = entry.uuid ?? (pack ? `Compendium.${pack.collection}.Item.${entry._id}` : `Item.${entry.id}`);
  const rank = getEntryRank(entry);
  const labels = getSuggestionLabels(entry, type);
  const sourcePath = getSourcePath(entry);
  const sourceLabel = pack?.metadata.label ?? game.i18n.localize("N5EB.Adversary.Builder.WorldItems");
  const sourceKey = pack?.collection.slugify({ strict: true }) ?? "world-items";
  const rankLabel = rank ? CONFIG.DND5E.adversaryRanks[rank]?.abbreviation ?? rank.toUpperCase() : "";
  const description = foundry.utils.getProperty(entry, "system.description.value") ?? "";
  const search = [entry.name, rankLabel, labels.categoryLabel, labels.typeLabel, sourceLabel]
    .join(" ")
    .toLocaleLowerCase(game.i18n.lang);

  return {
    category: labels.category,
    categoryLabel: labels.categoryLabel,
    description,
    disabled: existing.has(uuid),
    img: entry.img || DEFAULT_ICON,
    kind: labels.kind,
    kindLabel: labels.categoryLabel,
    pack: sourceLabel,
    packKey: sourceKey,
    rank,
    rankLabel,
    search,
    sourcePath,
    sourceKey,
    sourceLabel,
    type,
    typeLabel: labels.typeLabel,
    uuid,
    name: entry.name
  };
}

/* -------------------------------------------- */

/**
 * Get suggestion labels and kind keys.
 * @param {object} entry     Compendium index entry.
 * @param {string} type      Suggestion type.
 * @returns {object}
 */
function getSuggestionLabels(entry, type) {
  if ( type === "spell" ) {
    const kind = foundry.utils.getProperty(entry, "system.jutsu.type") ?? "";
    return {
      category: kind,
      categoryLabel: CONFIG.DND5E.jutsuTypes[kind]?.label ?? game.i18n.localize("N5EB.JUTSU.Unclassified"),
      kind,
      typeLabel: game.i18n.localize("TYPES.Item.spell")
    };
  }

  const typeConfig = CONFIG.DND5E.featureTypes[type] ?? {};
  const subtype = foundry.utils.getProperty(entry, "system.type.subtype") ?? "";
  const subtypeConfig = typeConfig.subtypes?.[subtype];
  return {
    category: subtype || "uncategorized",
    categoryLabel: subtypeConfig?.label ?? subtypeConfig ?? game.i18n.localize("N5EB.Adversary.Builder.Uncategorized"),
    kind: type,
    typeLabel: typeConfig.label ?? game.i18n.localize(CONFIG.Item.typeLabels.feat)
  };
}

/* -------------------------------------------- */

/**
 * Sort feature suggestions with actor-relevant options first.
 * @param {object} lhs       Left suggestion.
 * @param {object} rhs       Right suggestion.
 * @param {object} adversary Current adversary metadata.
 * @returns {number}
 */
function sortFeatureSuggestion(lhs, rhs, adversary) {
  const lhsRelevance = getFeatureRelevance(lhs, adversary);
  const rhsRelevance = getFeatureRelevance(rhs, adversary);
  if ( lhsRelevance !== rhsRelevance ) return rhsRelevance - lhsRelevance;
  const typeSort = lhs.type.localeCompare(rhs.type, game.i18n.lang);
  if ( typeSort ) return typeSort;
  const categorySort = lhs.category.localeCompare(rhs.category, game.i18n.lang);
  if ( categorySort ) return categorySort;
  const rankSort = getRankSortValue(lhs.rank) - getRankSortValue(rhs.rank);
  if ( rankSort ) return rankSort;
  const sourceSort = lhs.sourceLabel.localeCompare(rhs.sourceLabel, game.i18n.lang);
  if ( sourceSort ) return sourceSort;
  return lhs.name.localeCompare(rhs.name, game.i18n.lang);
}

/* -------------------------------------------- */

/**
 * Sort suggestions by rank and name.
 * @param {object} lhs  Left suggestion.
 * @param {object} rhs  Right suggestion.
 * @returns {number}
 */
function sortSuggestion(lhs, rhs) {
  const lhsRank = getRankSortValue(lhs.rank);
  const rhsRank = getRankSortValue(rhs.rank);
  if ( lhsRank !== rhsRank ) return lhsRank - rhsRank;
  return lhs.name.localeCompare(rhs.name, game.i18n.lang);
}

/* -------------------------------------------- */

/**
 * Get a sortable rank value.
 * @param {string|null} rank  Rank key.
 * @returns {number}
 */
function getRankSortValue(rank) {
  const index = RANK_ORDER.indexOf(rank);
  return index === -1 ? RANK_ORDER.length : index;
}

/* -------------------------------------------- */

/**
 * Retrieve a slugified legacy source path from an index entry.
 * @param {object} entry  Compendium index entry.
 * @returns {string}
 */
function getSourcePath(entry) {
  return `${foundry.utils.getProperty(entry, "flags.n5eb.legacyImport.sourcePath")
    ?? foundry.utils.getProperty(entry, "_stats.legacyImport.sourcePath") ?? ""}`.slugify({ strict: true });
}

/* -------------------------------------------- */

/**
 * Infer an adversary or jutsu rank from an index entry.
 * @param {object} entry  Compendium index entry.
 * @returns {string|null}
 */
function getEntryRank(entry) {
  const rank = foundry.utils.getProperty(entry, "system.rank")
    ?? foundry.utils.getProperty(entry, "system.type.nestedsubtype")
    ?? entry.rank;
  if ( rank && RANK_ORDER.includes(rank) ) return rank;
  const nameRank = `${entry.name ?? ""}`.match(/\[?([edcbas])-rank\]?/i)?.[1]?.toLowerCase();
  if ( nameRank && RANK_ORDER.includes(nameRank) ) return nameRank;
  const path = getSourcePath(entry);
  return path.match(/(^|-)([edcbas])-rank($|-)/)?.[2] ?? null;
}

/* -------------------------------------------- */

/**
 * Prepare rank filter choices.
 * @returns {object[]}
 */
function getRankFilterOptions() {
  return [
    { value: "", label: game.i18n.localize("N5EB.Adversary.Builder.AllRanks") },
    ...Object.entries(CONFIG.DND5E.adversaryRanks).map(([value, { label }]) => ({ value, label }))
  ];
}

/* -------------------------------------------- */

/**
 * Prepare feature kind filter choices.
 * @returns {object[]}
 */
function getFeatureKindOptions() {
  return [
    { value: "", label: game.i18n.localize("N5EB.Adversary.Builder.AllTypes") },
    {
      value: "adversaryTrait",
      label: CONFIG.DND5E.featureTypes.adversaryTrait?.label ?? game.i18n.localize("N5EB.AdversaryTraits")
    },
    {
      value: "adversaryPassive",
      label: CONFIG.DND5E.featureTypes.adversaryPassive?.label ?? game.i18n.localize("N5EB.AdversaryPassives")
    }
  ];
}

/* -------------------------------------------- */

/**
 * Prepare feature category filter choices.
 * @param {object[]} suggestions  Suggestions to derive choices from.
 * @returns {object[]}
 */
function getFeatureCategoryOptions(suggestions) {
  const categories = new Map(suggestions.map(s => [s.category, s.categoryLabel]));
  return [
    { value: "", label: game.i18n.localize("N5EB.Adversary.Builder.AllCategories") },
    ...Array.from(categories, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

/* -------------------------------------------- */

/**
 * Prepare jutsu kind filter choices.
 * @returns {object[]}
 */
function getJutsuKindOptions() {
  return [
    { value: "", label: game.i18n.localize("N5EB.Adversary.Builder.AllTypes") },
    ...Object.entries(CONFIG.DND5E.jutsuTypes).map(([value, { label }]) => ({ value, label }))
  ];
}

/* -------------------------------------------- */

/**
 * Prepare source pack filter choices.
 * @param {object[]} suggestions  Suggestions to derive choices from.
 * @returns {object[]}
 */
function getPackFilterOptions(suggestions) {
  const packs = new Map(suggestions.map(s => [s.sourceKey, s.sourceLabel]));
  return [
    { value: "", label: game.i18n.localize("N5EB.Adversary.Builder.AllSources") },
    ...Array.from(packs, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

/* -------------------------------------------- */

/**
 * Normalize a submitted select value against a choice object.
 * @param {string} value      Submitted value.
 * @param {object} choices    Valid choices.
 * @param {string} fallback   Fallback value.
 * @returns {string}
 */
function normalizeChoice(value, choices, fallback) {
  value = `${value ?? ""}`;
  return value in choices ? value : fallback;
}
