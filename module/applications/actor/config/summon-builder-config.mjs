/* eslint-disable jsdoc/require-jsdoc */

import BaseConfigSheet from "../api/base-config-sheet.mjs";
import AdvancementManager from "../../advancement/advancement-manager.mjs";
import CompendiumBrowser from "../../compendium-browser.mjs";
import { switchNpcBuilderMode } from "./npc-builder-mode-switch.mjs";

const RANK_ORDER = ["d", "c", "b", "a", "s"];
const LEGACY_RANKS = {
  erank: "d",
  drank: "d",
  crank: "c",
  brank: "b",
  arank: "a",
  srank: "s"
};
const DEFAULT_ICON = "icons/svg/mystery-man.svg";
const INDEX_FIELDS = [
  "img", "type", "system.description.value", "system.identifier", "system.rank", "system.jutsu.type",
  "system.type.value", "system.type.subtype", "system.type.nestedsubtype",
  "flags.n5eb.legacyImport.sourcePath", "_stats.legacyImport.sourcePath",
  "flags.n5eb.summonDefinition.kind", "flags.n5eb.summonDefinition.key",
  "flags.n5eb.summonDefinition.label", "flags.n5eb.summonDefinition.summonType",
  "flags.n5eb.summonDefinition.toughness", "flags.n5eb.summonDefinition.defenseAbility",
  "flags.n5eb.summonDefinition.jutsuAbility", "flags.n5eb.summonDefinition.baseTribe",
  "flags.n5eb.summonDefinition.category", "flags.n5eb.summonDefinition.variant",
  "flags.n5eb.summonContent.tribes", "flags.n5eb.summonContent.types",
  "flags.n5eb.summonContent.roles", "flags.n5eb.summonContent.ranks"
];

/**
 * NPC sheet child application for configuring N5eB summons.
 */
export default class SummonBuilderConfig extends BaseConfigSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["npc-builder", "summon-builder"],
    actions: {
      addSelected: SummonBuilderConfig.#addSelected,
      applyDefaults: SummonBuilderConfig.#applyDefaults,
      createDefinition: SummonBuilderConfig.#createDefinition,
      openDefinition: SummonBuilderConfig.#openDefinition,
      save: SummonBuilderConfig.#save,
      selectBreed: SummonBuilderConfig.#selectBreed,
      selectTribe: SummonBuilderConfig.#selectTribe,
      switchBuilderMode: SummonBuilderConfig.#switchBuilderMode,
      switchTab: SummonBuilderConfig.#switchTab
    },
    form: {
      submitOnChange: false
    },
    position: {
      width: 980,
      height: 780
    }
  };

  /** @override */
  static PARTS = {
    config: {
      template: "systems/n5eb/templates/actors/config/summon-builder-config.hbs"
    }
  };

  #activeTab = "features";

  #definitions = null;

  /** @override */
  get title() {
    return game.i18n.format("N5EB.NPCBuilder.Title", { name: this.document.name });
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.document;
    context.builderMode = "summon";
    const source = getSummonSource(this.document);
    context.definitions = await getSummonDefinitions();
    this.#definitions = context.definitions;
    context.source = source;
    context.summonTribeOptions = getSummonChoiceOptions("tribe", source.tribe, context.definitions);
    context.summonTypeOptions = getSummonChoiceOptions("type", source.summonType, context.definitions);
    context.selectedTribe = getSelectedSummonDefinition("tribe", source.tribe, source.sourceUuid, context.definitions);
    context.selectedBreed = getSelectedSummonDefinition(
      "inuzukaBreed", source.variant, source.sourceUuid, context.definitions
    );
    context.showInuzukaBreed = source.category === "inuzuka";
    context.identity = getSummonIdentity(source, context.definitions);
    context.summary = getSummonSummary(source);
    context.warnings = getSummonWarnings(this.document, source);
    context.suggestions = await getSummonSuggestions(this.document, source, context.definitions);
    context.contentTabs = [
      {
        id: "features",
        label: "N5EB.Summon.Builder.SuggestedFeatures",
        count: context.suggestions.features.length,
        active: this.#activeTab === "features"
      },
      {
        id: "weapons",
        label: "N5EB.Summon.Builder.SuggestedWeapons",
        count: context.suggestions.weapons.length,
        active: this.#activeTab === "weapons"
      },
      {
        id: "jutsu",
        label: "N5EB.Summon.Builder.SuggestedJutsu",
        count: context.suggestions.jutsu.length,
        active: this.#activeTab === "jutsu"
      },
      {
        id: "selected",
        label: "N5EB.Summon.Builder.Selected",
        count: 0,
        active: this.#activeTab === "selected"
      }
    ];
    context.filterRanks = getRankFilterOptions();
    context.featureKinds = getFeatureKindOptions(context.suggestions.features);
    context.weaponKinds = getWeaponKindOptions();
    context.jutsuKinds = getJutsuKindOptions();
    context.featureCategories = getCategoryFilterOptions(context.suggestions.features);
    context.weaponCategories = getCategoryFilterOptions(context.suggestions.weapons);
    context.jutsuCategories = getCategoryFilterOptions(context.suggestions.jutsu);
    context.featurePacks = getPackFilterOptions(context.suggestions.features);
    context.weaponPacks = getPackFilterOptions(context.suggestions.weapons);
    context.jutsuPacks = getPackFilterOptions(context.suggestions.jutsu);
    context.tribeFilters = getDefinitionFilterOptions("tribe", context.definitions);
    context.typeFilters = getDefinitionFilterOptions("type", context.definitions);
    context.preview = context.suggestions.features.find(s => !s.disabled)
      ?? context.suggestions.weapons.find(s => !s.disabled)
      ?? context.suggestions.jutsu.find(s => !s.disabled)
      ?? context.suggestions.features[0]
      ?? context.suggestions.weapons[0]
      ?? context.suggestions.jutsu[0]
      ?? null;
    return context;
  }

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

  static async #save(event, target) {
    event.preventDefault();
    await this.#saveSummon();
    this.render();
  }

  static async #addSelected(event, target) {
    event.preventDefault();
    await this.#saveSummon();

    const selected = Array.from(this.element.querySelectorAll("input[name='itemUuids']:checked:not(:disabled)"))
      .map(input => input.value);
    const existing = new Set(this.document.items.map(item => item.getFlag("n5eb", "summonBuilder.sourceUuid")));
    const toCreate = [];
    for ( const uuid of selected ) {
      if ( existing.has(uuid) ) continue;
      const item = await fromUuid(uuid);
      if ( !item ) continue;
      const data = item.pack ? game.items.fromCompendium(item, { keepId: false }) : item.toObject();
      delete data._id;
      foundry.utils.setProperty(data, "flags.n5eb.summonBuilder.sourceUuid", uuid);
      toCreate.push(data);
    }
    if ( toCreate.length ) await this.document.createEmbeddedDocuments("Item", toCreate);
    this.render();
  }

  static async #applyDefaults(event, target) {
    event.preventDefault();
    const summon = this.#currentSummon();
    const defaults = getSummonDefaults(summon, this.#definitions);
    this.#setFormValue("summon.toughness", defaults.toughness ?? summon.toughness);
    this.#setFormValue("summon.summonType", defaults.summonType ?? summon.summonType);
    this.#setFormValue("summon.defenseAbility", defaults.defenseAbility ?? summon.defenseAbility);
    this.#setFormValue("summon.jutsuAbility", defaults.jutsuAbility ?? summon.jutsuAbility);
    this.#syncSummary();
    this.#syncIdentity();
  }

  static async #createDefinition(event, target) {
    event.preventDefault();
    const kind = target.dataset.kind === "type" ? "type" : "tribe";
    const summon = this.#currentSummon();
    const definition = buildNewDefinitionData(kind, summon, this.#definitions);
    const item = await Item.create(definition, { renderSheet: false });
    item?.sheet?.render(true);
    this.render();
  }

  static async #openDefinition(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if ( !uuid ) return;
    const item = await fromUuid(uuid);
    item?.sheet?.render(true);
  }

  static async #selectTribe(event, target) {
    event.preventDefault();
    await this.#saveSummon();

    const filters = {
      locked: {
        documentClass: "Item",
        types: new Set(["feat"]),
        additional: {
          category: { summon: 1 },
          subtype: { tribeDefinition: 1 }
        }
      },
      initial: {
        documentClass: "Item",
        types: new Set(["feat"]),
        additional: {
          category: { summon: 1 },
          subtype: { tribeDefinition: 1 }
        }
      }
    };
    const uuid = await CompendiumBrowser.selectOne({
      filters,
      includeWorld: true,
      tab: "feats",
      hint: game.i18n.localize("N5EB.Summon.Builder.SelectTribeHint")
    }, this._detachOptions());
    if ( !uuid ) return;

    const item = await fromUuid(uuid);
    if ( !item ) return;
    await this.#applyTribeDefinition(item, uuid);
  }

  static async #selectBreed(event, target) {
    event.preventDefault();
    await this.#saveSummon();

    const filters = {
      locked: {
        documentClass: "Item",
        types: new Set(["feat"]),
        additional: {
          category: { summon: 1 },
          subtype: { inuzukaBreedDefinition: 1 }
        }
      },
      initial: {
        documentClass: "Item",
        types: new Set(["feat"]),
        additional: {
          category: { summon: 1 },
          subtype: { inuzukaBreedDefinition: 1 }
        }
      }
    };
    const uuid = await CompendiumBrowser.selectOne({
      filters,
      includeWorld: true,
      tab: "feats",
      hint: game.i18n.localize("N5EB.Summon.Builder.SelectBreedHint")
    }, this._detachOptions());
    if ( !uuid ) return;

    const item = await fromUuid(uuid);
    if ( !item ) return;
    await this.#applyInuzukaBreedDefinition(item, uuid);
  }

  static async #switchBuilderMode(event, target) {
    event.preventDefault();
    if ( target.dataset.mode !== "adversary" ) return;
    const { default: AdversaryBuilderConfig } = await import("./adversary-builder-config.mjs");
    await switchNpcBuilderMode(this, AdversaryBuilderConfig);
  }

  static async #switchTab(event, target) {
    event.preventDefault();
    this.#activeTab = target.dataset.tab ?? "features";
    this.#syncActiveTab();
  }

  #bindBuilderControls() {
    const root = this.element.querySelector(".summon-builder");
    if ( !root ) return;

    root.addEventListener("input", event => {
      const target = event.target;
      if ( !(target instanceof HTMLElement) ) return;
      if ( target.matches(".adversary-filter") ) this.#applyFilters(target.closest("[data-content-panel]"));
      if ( ["summon.level", "summon.toughness"].includes(target.name) ) this.#syncSummary();
    });

    root.addEventListener("change", event => {
      const target = event.target;
      if ( !(target instanceof HTMLElement) ) return;
      if ( target.matches(".adversary-filter") ) this.#applyFilters(target.closest("[data-content-panel]"));
      if ( target.matches("input[name='itemUuids']") ) {
        target.closest(".adversary-suggestion")?.classList.toggle("selected", target.checked);
        this.#refreshSelection();
      }
      if ( target.name?.startsWith("summon.") ) {
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

  #syncSummary() {
    const summary = this.#currentSummary();
    this.element.querySelector("[data-summary-slots]")?.replaceChildren(`${summary.jutsuSlots}`);
    this.element.querySelector("[data-summary-toughness]")?.replaceChildren(`${summary.toughness}`);
    this.element.querySelector("[data-summary-defense]")?.replaceChildren(summary.defenseAbilityLabel);
    this.element.querySelector("[data-summary-jutsu]")?.replaceChildren(summary.jutsuAbilityLabel);
  }

  #syncIdentity() {
    const summon = this.#currentSummon();
    const identity = getSummonIdentity(summon, this.#definitions);
    this.element.querySelector("[data-identity-rank]")?.replaceChildren(identity.rank.abbreviation);
    this.element.querySelector("[data-identity-category]")?.replaceChildren(identity.category.label);
    this.element.querySelector("[data-identity-role]")?.replaceChildren(identity.role.label);

    const tribe = this.element.querySelector("[data-identity-tribe]");
    if ( tribe ) {
      tribe.hidden = !identity.tribe;
      tribe.replaceChildren(identity.tribe?.label ?? "");
    }

    const type = this.element.querySelector("[data-identity-type]");
    if ( type ) {
      type.hidden = !identity.summonType;
      type.replaceChildren(identity.summonType?.label ?? "");
    }

    const variant = this.element.querySelector("[data-identity-variant]");
    if ( variant ) {
      variant.hidden = !identity.variant;
      variant.replaceChildren(identity.variant?.label ?? "");
    }

    for ( const card of this.element.querySelectorAll("[data-inuzuka-breed-card]") ) {
      card.hidden = summon.category !== "inuzuka";
    }
  }

  #refreshAllFilters() {
    for ( const panel of this.element.querySelectorAll("[data-content-panel]") ) this.#applyFilters(panel);
  }

  #applyFilters(panel) {
    if ( !panel || (panel.dataset.contentPanel === "selected") ) return;
    const search = panel.querySelector("[data-filter='search']")?.value?.trim().toLocaleLowerCase(game.i18n.lang) ?? "";
    const rank = panel.querySelector("[data-filter='rank']")?.value ?? "";
    const kind = panel.querySelector("[data-filter='kind']")?.value ?? "";
    const category = panel.querySelector("[data-filter='category']")?.value ?? "";
    const source = panel.querySelector("[data-filter='source']")?.value ?? "";
    const tribe = panel.querySelector("[data-filter='tribe']")?.value ?? "";
    const summonType = panel.querySelector("[data-filter='summonType']")?.value ?? "";
    let visible = 0;

    for ( const row of panel.querySelectorAll(".adversary-suggestion") ) {
      const rowTribes = (row.dataset.tribes ?? "").split(" ").filter(Boolean);
      const rowTypes = (row.dataset.types ?? "").split(" ").filter(Boolean);
      const matchesSearch = !search || row.dataset.search?.includes(search);
      const matchesRank = !rank || !row.dataset.rank || (getRankSortValue(row.dataset.rank) <= getRankSortValue(rank));
      const matchesKind = !kind || row.dataset.kind === kind;
      const matchesCategory = !category || row.dataset.category === category;
      const matchesSource = !source || row.dataset.source === source;
      const matchesTribe = !tribe || rowTribes.includes(tribe);
      const matchesType = !summonType || rowTypes.includes(summonType);
      const hidden = !(matchesSearch && matchesRank && matchesKind && matchesCategory && matchesSource
        && matchesTribe && matchesType);
      row.hidden = hidden;
      if ( !hidden ) visible++;
    }

    const empty = panel.querySelector("[data-filter-empty]");
    if ( empty ) empty.hidden = visible > 0;
  }

  #previewInitialSuggestion() {
    const panel = this.element.querySelector(`[data-content-panel='${this.#activeTab}']`);
    if ( !panel || (this.#activeTab === "selected") ) return;
    const row = panel.querySelector(".adversary-suggestion:not([hidden])");
    if ( row ) this.#previewSuggestion(row);
  }

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
      || `<p>${game.i18n.localize("N5EB.Summon.Builder.NoPreview")}</p>`;

    for ( const candidate of this.element.querySelectorAll(".adversary-suggestion.previewed") ) {
      candidate.classList.remove("previewed");
    }
    row.classList.add("previewed");
  }

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
    remove.ariaLabel = game.i18n.localize("N5EB.Summon.Builder.RemoveSelected");
    remove.innerHTML = '<i class="fa-solid fa-xmark" inert></i>';

    item.append(icon, name, meta, remove);
    return item;
  }

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

  #currentSummon() {
    return {
      level: Math.clamp(Number(this.#formValue("summon.level")) || 1, 1, 30),
      rank: normalizeChoice(this.#formValue("summon.rank"), CONFIG.DND5E.summonRanks, "d"),
      category: normalizeChoice(this.#formValue("summon.category"), CONFIG.DND5E.summonCategories, "tribe"),
      tribe: normalizeSummonTribe(this.#formValue("summon.tribe")),
      variant: `${this.#formValue("summon.variant") ?? ""}`,
      role: normalizeChoice(this.#formValue("summon.role"), CONFIG.DND5E.summonRoles, "striker"),
      summonType: normalizeSummonType(this.#formValue("summon.summonType")),
      toughness: Math.max(0, Number(this.#formValue("summon.toughness")) || 0),
      defenseAbility: normalizeChoice(this.#formValue("summon.defenseAbility"), CONFIG.DND5E.abilities, ""),
      jutsuAbility: normalizeChoice(this.#formValue("summon.jutsuAbility"), CONFIG.DND5E.abilities, "")
    };
  }

  #currentSummary() {
    return getSummonSummary(this.#currentSummon());
  }

  #formValue(name) {
    return this.form?.elements.namedItem(name)?.value;
  }

  #setFormValue(name, value) {
    const field = this.form?.elements.namedItem(name);
    if ( field ) field.value = value ?? "";
  }

  async #saveSummon() {
    const formData = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.form).object);
    const summon = formData.summon ?? {};

    await this.document.update({
      "system.details.summon.enabled": true,
      "system.details.summon.level": Math.clamp(Number(summon.level) || 1, 1, 30),
      "system.details.summon.rank": normalizeChoice(summon.rank, CONFIG.DND5E.summonRanks, "d"),
      "system.details.summon.category": normalizeChoice(summon.category, CONFIG.DND5E.summonCategories, "tribe"),
      "system.details.summon.tribe": normalizeSummonTribe(summon.tribe),
      "system.details.summon.variant": `${summon.variant ?? ""}`.trim(),
      "system.details.summon.role": normalizeChoice(summon.role, CONFIG.DND5E.summonRoles, "striker"),
      "system.details.summon.summonType": normalizeSummonType(summon.summonType),
      "system.details.summon.toughness": Math.max(0, Number(summon.toughness) || 0),
      "system.details.summon.defenseAbility": normalizeChoice(summon.defenseAbility, CONFIG.DND5E.abilities, ""),
      "system.details.summon.jutsuAbility": normalizeChoice(summon.jutsuAbility, CONFIG.DND5E.abilities, ""),
      "system.details.summon.migrated": (summon.migrated === true) || (summon.migrated === "true"),
      "system.details.summon.sourceUuid": `${summon.sourceUuid ?? ""}`,
      "system.details.adversary.enabled": false
    });
  }

  async #applyTribeDefinition(item, uuid) {
    const pack = item.pack ? game.packs.get(item.pack) : null;
    const definition = formatSummonDefinition(item, pack);
    if ( definition?.kind !== "tribe" ) {
      ui.notifications.warn(game.i18n.localize("N5EB.Summon.Builder.InvalidTribeDefinition"));
      return;
    }

    const defaults = cleanSummonDefaults(definition.defaults ?? {});
    this.#setFormValue("summon.tribe", definition.key);
    this.#setFormValue("summon.sourceUuid", uuid);
    this.#setFormValue("summon.category", "tribe");
    this.#setFormValue("summon.variant", "");
    if ( defaults.summonType ) this.#setFormValue("summon.summonType", defaults.summonType);
    if ( defaults.toughness ) this.#setFormValue("summon.toughness", defaults.toughness);
    if ( defaults.defenseAbility ) this.#setFormValue("summon.defenseAbility", defaults.defenseAbility);
    if ( defaults.jutsuAbility ) this.#setFormValue("summon.jutsuAbility", defaults.jutsuAbility);

    const existingBreed = getEmbeddedInuzukaBreedRoot(this.document);
    if ( existingBreed ) {
      const manager = AdvancementManager.forDeletedItem(this.document, existingBreed.id);
      if ( manager.steps.length ) {
        ui.notifications.warn(game.i18n.localize("N5EB.Summon.Builder.ReplaceBreedRequiresCleanup"));
        this._renderChild(manager);
        return;
      }
      await existingBreed.delete();
    }

    const existing = getEmbeddedTribeRoot(this.document);
    if ( existing && !isSameTribeRoot(existing, uuid, definition) ) {
      const manager = AdvancementManager.forDeletedItem(this.document, existing.id);
      if ( manager.steps.length ) {
        ui.notifications.warn(game.i18n.localize("N5EB.Summon.Builder.ReplaceTribeRequiresCleanup"));
        this._renderChild(manager);
        return;
      }
      await existing.delete();
    }
    else if ( existing ) {
      ui.notifications.info(game.i18n.localize("N5EB.Summon.Builder.TribeAlreadyApplied"));
      this.render();
      return;
    }

    await this.#saveSummon();

    const itemData = prepareTribeRootData(item, uuid, definition);
    if ( !foundry.utils.isEmpty(itemData.system?.advancement) && !game.settings.get("n5eb", "disableAdvancements") ) {
      const manager = AdvancementManager.forNewItem(this.document, itemData);
      if ( manager.steps.length ) {
        this._renderChild(manager);
        return;
      }
    }

    await this.document.createEmbeddedDocuments("Item", [itemData]);
    ui.notifications.info(game.i18n.localize("N5EB.Summon.Builder.TribeApplied"));
    this.render();
  }

  async #applyInuzukaBreedDefinition(item, uuid) {
    const pack = item.pack ? game.packs.get(item.pack) : null;
    const definition = formatSummonDefinition(item, pack);
    if ( definition?.kind !== "inuzukaBreed" ) {
      ui.notifications.warn(game.i18n.localize("N5EB.Summon.Builder.InvalidBreedDefinition"));
      return;
    }

    const defaults = cleanSummonDefaults(definition.defaults ?? {});
    this.#setFormValue("summon.tribe", definition.baseTribe || "dogWolf");
    this.#setFormValue("summon.sourceUuid", uuid);
    this.#setFormValue("summon.category", "inuzuka");
    this.#setFormValue("summon.variant", definition.variant || definition.key);
    if ( defaults.summonType ) this.#setFormValue("summon.summonType", defaults.summonType);
    if ( defaults.toughness ) this.#setFormValue("summon.toughness", defaults.toughness);
    if ( defaults.defenseAbility ) this.#setFormValue("summon.defenseAbility", defaults.defenseAbility);
    if ( defaults.jutsuAbility ) this.#setFormValue("summon.jutsuAbility", defaults.jutsuAbility);

    const existingTribe = getEmbeddedTribeRoot(this.document);
    if ( existingTribe ) {
      const manager = AdvancementManager.forDeletedItem(this.document, existingTribe.id);
      if ( manager.steps.length ) {
        ui.notifications.warn(game.i18n.localize("N5EB.Summon.Builder.ReplaceTribeRequiresCleanup"));
        this._renderChild(manager);
        return;
      }
      await existingTribe.delete();
    }

    const existingBreed = getEmbeddedInuzukaBreedRoot(this.document);
    if ( existingBreed && !isSameInuzukaBreedRoot(existingBreed, uuid, definition) ) {
      const manager = AdvancementManager.forDeletedItem(this.document, existingBreed.id);
      if ( manager.steps.length ) {
        ui.notifications.warn(game.i18n.localize("N5EB.Summon.Builder.ReplaceBreedRequiresCleanup"));
        this._renderChild(manager);
        return;
      }
      await existingBreed.delete();
    }
    else if ( existingBreed ) {
      ui.notifications.info(game.i18n.localize("N5EB.Summon.Builder.BreedAlreadyApplied"));
      this.render();
      return;
    }

    await this.#saveSummon();

    const itemData = prepareInuzukaBreedRootData(item, uuid, definition);
    if ( !foundry.utils.isEmpty(itemData.system?.advancement) && !game.settings.get("n5eb", "disableAdvancements") ) {
      const manager = AdvancementManager.forNewItem(this.document, itemData);
      if ( manager.steps.length ) {
        this._renderChild(manager);
        return;
      }
    }

    await this.document.createEmbeddedDocuments("Item", [itemData]);
    ui.notifications.info(game.i18n.localize("N5EB.Summon.Builder.BreedApplied"));
    this.render();
  }
}

function getSummonSource(actor) {
  const source = foundry.utils.deepClone(
    actor.system._source.details?.summon ?? actor.system.details.summon ?? {}
  );
  source.enabled ??= false;
  source.level = getNpcBuilderLevel(actor, source.level);
  source.rank = normalizeChoice(source.rank, CONFIG.DND5E.summonRanks, "d");
  source.category = normalizeChoice(source.category, CONFIG.DND5E.summonCategories, "tribe");
  source.tribe = normalizeSummonTribe(source.tribe);
  source.variant ??= "";
  source.role = normalizeChoice(source.role, CONFIG.DND5E.summonRoles, "striker");
  source.summonType = normalizeSummonType(source.summonType);
  source.toughness = Math.max(0, Number(source.toughness) || 0);
  source.defenseAbility = normalizeChoice(source.defenseAbility, CONFIG.DND5E.abilities, "");
  source.jutsuAbility = normalizeChoice(source.jutsuAbility, CONFIG.DND5E.abilities, "");
  source.migrated ??= false;
  source.sourceUuid ??= "";
  return source;
}

/**
 * Resolve the builder level without letting the schema's default level hide existing NPC scaling.
 * @param {Actor5e} actor            Actor being configured.
 * @param {number|string} rawLevel   Stored summon level.
 * @returns {number}
 */
function getNpcBuilderLevel(actor, rawLevel) {
  const storedLevel = normalizeNpcBuilderLevel(rawLevel);
  const actorLevel = normalizeNpcBuilderLevel(actor.system.details.level);
  const actorCr = normalizeNpcBuilderLevel(actor.system.details.cr);

  const fallbackLevel = Math.max(actorLevel ?? 0, actorCr ?? 0);
  if ( storedLevel && ((storedLevel > 1) || (fallbackLevel <= 1)) ) return storedLevel;
  if ( fallbackLevel ) return Math.clamp(fallbackLevel, 1, 30);
  return storedLevel ?? 1;
}

/* -------------------------------------------- */

/**
 * Normalize a level-like value for builder comparisons.
 * @param {number|string} level  Candidate level.
 * @returns {number|null}
 */
function normalizeNpcBuilderLevel(level) {
  level = Number(level);
  if ( !Number.isFinite(level) || (level <= 0) ) return null;
  return Math.clamp(Math.trunc(level), 1, 30);
}

/* -------------------------------------------- */

function getEmbeddedTribeRoot(actor) {
  return actor.items.find(item => item.getFlag("n5eb", "summonBuilder.tribeRoot"))
    ?? actor.items.find(item => (item.type === "feat") && (getSummonDefinitionKind(item) === "tribe"));
}

function getEmbeddedInuzukaBreedRoot(actor) {
  return actor.items.find(item => item.getFlag("n5eb", "summonBuilder.inuzukaBreedRoot"))
    ?? actor.items.find(item => (item.type === "feat") && (getSummonDefinitionKind(item) === "inuzukaBreed"));
}

function isSameTribeRoot(item, uuid, definition) {
  if ( item.getFlag("n5eb", "summonBuilder.sourceUuid") === uuid ) return true;
  const key = foundry.utils.getProperty(item, "flags.n5eb.summonDefinition.key")
    || item.system.identifier || item.name;
  return normalizeDefinitionKey("tribe", key) === definition.key;
}

function isSameInuzukaBreedRoot(item, uuid, definition) {
  if ( item.getFlag("n5eb", "summonBuilder.sourceUuid") === uuid ) return true;
  const key = foundry.utils.getProperty(item, "flags.n5eb.summonDefinition.key")
    || foundry.utils.getProperty(item, "flags.n5eb.summonDefinition.variant")
    || item.system.identifier || item.name;
  return normalizeDefinitionKey("inuzukaBreed", key) === definition.key;
}

function prepareTribeRootData(item, uuid, definition) {
  const data = item.pack ? game.items.fromCompendium(item, { keepId: false }) : item.toObject();
  delete data._id;
  data.system ??= {};
  data.system.type ??= {};
  data.system.type.value = "summon";
  data.system.type.subtype = "tribeDefinition";
  data.system.type.nestedsubtype = "";
  foundry.utils.setProperty(data, "flags.n5eb.summonDefinition", {
    kind: "tribe",
    key: definition.key,
    label: definition.label,
    ...cleanSummonDefaults(definition.defaults ?? {})
  });
  foundry.utils.setProperty(data, "flags.n5eb.summonBuilder.sourceUuid", uuid);
  foundry.utils.setProperty(data, "flags.n5eb.summonBuilder.tribeRoot", true);
  return data;
}

function prepareInuzukaBreedRootData(item, uuid, definition) {
  const data = item.pack ? game.items.fromCompendium(item, { keepId: false }) : item.toObject();
  delete data._id;
  data.system ??= {};
  data.system.type ??= {};
  data.system.type.value = "summon";
  data.system.type.subtype = "inuzukaBreedDefinition";
  data.system.type.nestedsubtype = "";
  foundry.utils.setProperty(data, "flags.n5eb.summonDefinition", {
    kind: "inuzukaBreed",
    key: definition.key,
    label: definition.label,
    baseTribe: definition.baseTribe || "dogWolf",
    category: "inuzuka",
    variant: definition.variant || definition.key,
    ...cleanSummonDefaults(definition.defaults ?? {})
  });
  foundry.utils.setProperty(data, "flags.n5eb.summonBuilder.sourceUuid", uuid);
  foundry.utils.setProperty(data, "flags.n5eb.summonBuilder.inuzukaBreedRoot", true);
  return data;
}

function getSummonIdentity(summon, definitions=null) {
  return {
    rank: {
      key: summon.rank,
      label: CONFIG.DND5E.summonRanks[summon.rank]?.label ?? summon.rank.toUpperCase(),
      abbreviation: CONFIG.DND5E.summonRanks[summon.rank]?.abbreviation ?? summon.rank.toUpperCase()
    },
    category: {
      key: summon.category,
      label: CONFIG.DND5E.summonCategories[summon.category]?.label ?? summon.category
    },
    tribe: summon.tribe ? {
      key: summon.tribe,
      label: getSummonDefinitionLabel("tribe", summon.tribe, definitions)
    } : null,
    role: {
      key: summon.role,
      label: CONFIG.DND5E.summonRoles[summon.role]?.label ?? summon.role
    },
    summonType: summon.summonType ? {
      key: summon.summonType,
      label: getSummonDefinitionLabel("type", summon.summonType, definitions)
    } : null,
    variant: summon.variant ? {
      key: summon.variant,
      label: summon.category === "inuzuka"
        ? getSummonDefinitionLabel("inuzukaBreed", summon.variant, definitions)
        : formatDefinitionLabel(summon.variant)
    } : null
  };
}

function getSummonSummary(summon) {
  const toughness = Math.max(0, Number(summon.toughness) || 0);
  const defenseAbility = CONFIG.DND5E.abilities[summon.defenseAbility]?.label ?? game.i18n.localize("N5EB.None");
  const jutsuAbility = CONFIG.DND5E.abilities[summon.jutsuAbility]?.label ?? game.i18n.localize("N5EB.None");
  return {
    jutsuSlots: getSummonJutsuSlots(summon.level),
    toughness: toughness || game.i18n.localize("N5EB.Summon.Builder.Manual"),
    defenseAbilityLabel: defenseAbility,
    jutsuAbilityLabel: jutsuAbility
  };
}

function getSummonWarnings(actor, summon) {
  const warnings = [];
  if ( actor.itemTypes.class.length ) warnings.push(game.i18n.localize("N5EB.Summon.Builder.WarnLegacyClass"));
  if ( !summon.tribe && (summon.category !== "jutsu") ) {
    warnings.push(game.i18n.localize("N5EB.Summon.Builder.WarnMissingTribe"));
  }
  return warnings;
}

async function getSummonSuggestions(actor, summon, definitions=null) {
  const existing = getExistingSourceKeys(actor);
  const features = [];
  const weapons = [];
  const jutsu = [];

  for ( const pack of getSummonItemPacks({ includeCustom: true }) ) {
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    for ( const entry of index ) {
      if ( entry.type === "class" ) continue;
      if ( entry.type === "feat" && isSummonFeature(entry, pack) ) {
        features.push(formatSuggestion(entry, pack, "feat", existing, definitions));
      }
      else if ( entry.type === "weapon" && isSummonWeapon(entry, pack) ) {
        weapons.push(formatSuggestion(entry, pack, "weapon", existing, definitions));
      }
      else if ( entry.type === "spell" && isSummonJutsu(entry, pack) ) {
        jutsu.push(formatSuggestion(entry, pack, "spell", existing, definitions));
      }
    }
  }

  for ( const item of game.items ) {
    if ( item.type === "feat" && isSummonFeature(item, null) ) {
      features.push(formatSuggestion(item, null, "feat", existing, definitions));
    }
    else if ( item.type === "weapon" && isSummonWeapon(item, null) ) {
      weapons.push(formatSuggestion(item, null, "weapon", existing, definitions));
    }
    else if ( item.type === "spell" && isSummonJutsu(item, null) ) {
      jutsu.push(formatSuggestion(item, null, "spell", existing, definitions));
    }
  }

  return {
    features: dedupeSuggestions(features).toSorted((lhs, rhs) => sortSummonSuggestion(lhs, rhs, summon)).slice(0, 160),
    weapons: dedupeSuggestions(weapons).toSorted((lhs, rhs) => sortSummonSuggestion(lhs, rhs, summon)).slice(0, 80),
    jutsu: dedupeSuggestions(jutsu).toSorted((lhs, rhs) => sortSummonSuggestion(lhs, rhs, summon)).slice(0, 80)
  };
}

function getExistingSourceKeys(actor) {
  const existing = new Set();
  for ( const item of actor.items ) {
    existing.add(item.getFlag("n5eb", "summonBuilder.sourceUuid"));
    existing.add(item.getFlag("n5eb", "legacyImport.sourcePath"));
    existing.add(item.uuid);
    existing.add(item.name?.slugify({ strict: true }));
  }
  existing.delete(undefined);
  existing.delete("");
  return existing;
}

function getSummonItemPacks({ includeCustom=false }={}) {
  const packs = [];
  for ( const pack of game.packs ) {
    const metadata = pack.metadata ?? {};
    if ( (pack.documentName !== "Item") && (metadata.type !== "Item") ) continue;
    if ( includeCustom ) {
      packs.push(pack);
      continue;
    }
    const label = `${metadata.label ?? ""} ${pack.collection ?? ""}`.toLowerCase();
    const isSystemPack = (metadata.packageName === "n5eb") || (metadata.package === "n5eb")
      || (metadata.system === "n5eb") || pack.collection?.startsWith("n5eb.");
    const isJiraiyaPack = label.includes("jiraiya");
    if ( isSystemPack || isJiraiyaPack ) packs.push(pack);
  }
  return packs;
}

function isSummonFeature(entry, pack) {
  if ( isSummonDefinition(entry) ) return false;
  const type = foundry.utils.getProperty(entry, "system.type.value");
  if ( type === "summon" ) return true;
  return hasSummonContentFlags(entry) || isSummonSourced(entry, pack);
}

function isSummonWeapon(entry, pack) {
  const path = getSourcePath(entry);
  const weaponPath = /(^|-)(natural-weapons|tribe-weapons|weapon|bite|tail|talons|kicks)($|-)/;
  return hasSummonContentFlags(entry) || (isSummonSourced(entry, pack) && weaponPath.test(path));
}

function isSummonJutsu(entry, pack) {
  const path = getSourcePath(entry);
  const name = `${entry.name ?? ""}`.slugify({ strict: true });
  if ( hasSummonContentFlags(entry) ) return true;
  return path.includes("summon-jutsus") || name.startsWith("summoning-")
    || (isSummonSourced(entry, pack) && (entry.type === "spell"));
}

function isSummonSourced(entry, pack) {
  const path = getSourcePath(entry);
  const packText = `${pack?.collection ?? ""} ${pack?.metadata?.label ?? ""}`.toLowerCase();
  return path.includes("summon") || packText.includes("summon") || packText.includes("jiraiya");
}

function formatSuggestion(entry, pack, type, existing, definitions=null) {
  const uuid = entry.uuid ?? (pack ? `Compendium.${pack.collection}.Item.${entry._id}` : `Item.${entry.id}`);
  const rank = getEntryRank(entry);
  const labels = getSuggestionLabels(entry, type, definitions);
  const tags = getSummonContentTags(entry, definitions);
  const sourcePath = getSourcePath(entry);
  const sourceLabel = pack?.metadata.label ?? game.i18n.localize("N5EB.Summon.Builder.WorldItems");
  const sourceKey = pack?.collection.slugify({ strict: true }) ?? "world-items";
  const rankLabel = rank ? CONFIG.DND5E.summonRanks[rank]?.abbreviation ?? rank.toUpperCase() : "";
  const description = foundry.utils.getProperty(entry, "system.description.value") ?? "";
  const nameKey = entry.name?.slugify({ strict: true });
  const disabled = existing.has(uuid) || existing.has(sourcePath) || existing.has(nameKey);
  const tagLabels = [
    ...tags.tribes.map(key => getSummonDefinitionLabel("tribe", key, definitions)),
    ...tags.types.map(key => getSummonDefinitionLabel("type", key, definitions))
  ];
  const search = [entry.name, rankLabel, labels.categoryLabel, labels.typeLabel, sourceLabel, sourcePath, ...tagLabels]
    .join(" ")
    .toLocaleLowerCase(game.i18n.lang);

  return {
    category: labels.category,
    categoryLabel: labels.categoryLabel,
    description,
    disabled,
    img: entry.img || DEFAULT_ICON,
    kind: labels.kind,
    kindLabel: labels.categoryLabel,
    pack: sourceLabel,
    packKey: sourceKey,
    rank,
    rankLabel,
    ranks: tags.ranks.join(" "),
    search,
    sourcePath,
    sourceKey,
    sourceLabel,
    roles: tags.roles.join(" "),
    tribes: tags.tribes.join(" "),
    type,
    types: tags.types.join(" "),
    typeLabel: labels.typeLabel,
    uuid,
    name: entry.name
  };
}

function getSuggestionLabels(entry, type, definitions=null) {
  if ( type === "weapon" ) {
    return {
      category: getSourceTribe(entry, definitions) || "weapon",
      categoryLabel: getSourceTribeLabel(entry, definitions) || game.i18n.localize("N5EB.Feature.Summon.NaturalWeapon"),
      kind: "weapon",
      typeLabel: game.i18n.localize(CONFIG.Item.typeLabels.weapon)
    };
  }

  if ( type === "spell" ) {
    const kind = foundry.utils.getProperty(entry, "system.jutsu.type") ?? "summon";
    return {
      category: kind,
      categoryLabel: CONFIG.DND5E.jutsuTypes[kind]?.label ?? game.i18n.localize("N5EB.Summon.Builder.SummonJutsu"),
      kind,
      typeLabel: game.i18n.localize(CONFIG.Item.typeLabels.spell)
    };
  }

  const summonConfig = CONFIG.DND5E.featureTypes.summon ?? {};
  const subtype = foundry.utils.getProperty(entry, "system.type.subtype") || inferSummonFeatureSubtype(entry);
  const subtypeConfig = summonConfig.subtypes?.[subtype];
  return {
    category: subtype || "uncategorized",
    categoryLabel: subtypeConfig?.label ?? subtypeConfig ?? game.i18n.localize("N5EB.Summon.Builder.Uncategorized"),
    kind: subtype || "summon",
    typeLabel: summonConfig.label ?? game.i18n.localize("N5EB.Feature.Summon.Label")
  };
}

function inferSummonFeatureSubtype(entry) {
  const path = getSourcePath(entry);
  if ( path.includes("role-features") ) return "role";
  if ( path.includes("natural-weapons") || path.includes("tribe-weapons") ) return "naturalWeapon";
  if ( path.includes("senses") ) return "senses";
  if ( path.includes("summon-jutsus") ) return "jutsu";
  if ( path.includes("inuzuka-summon-features") ) return "variant";
  if ( path.includes("rank") ) return "rank";
  if ( path.includes("features") ) return "tribe";
  return "";
}

function sortSummonSuggestion(lhs, rhs, summon) {
  const lhsRelevance = getSummonRelevance(lhs, summon);
  const rhsRelevance = getSummonRelevance(rhs, summon);
  if ( lhsRelevance !== rhsRelevance ) return rhsRelevance - lhsRelevance;
  const typeSort = lhs.type.localeCompare(rhs.type, game.i18n.lang);
  if ( typeSort ) return typeSort;
  const rankSort = getRankSortValue(lhs.rank) - getRankSortValue(rhs.rank);
  if ( rankSort ) return rankSort;
  const categorySort = lhs.category.localeCompare(rhs.category, game.i18n.lang);
  if ( categorySort ) return categorySort;
  const sourceSort = lhs.sourceLabel.localeCompare(rhs.sourceLabel, game.i18n.lang);
  if ( sourceSort ) return sourceSort;
  return lhs.name.localeCompare(rhs.name, game.i18n.lang);
}

function getSummonRelevance(entry, summon) {
  let score = 0;
  const path = entry.sourcePath ?? "";
  const rank = entry.rank;
  if ( rank && (getRankSortValue(rank) <= getRankSortValue(summon.rank)) ) score += 4;
  if ( summon.tribe && entry.tribes?.split(" ").includes(summon.tribe) ) score += 24;
  if ( summon.summonType && entry.types?.split(" ").includes(summon.summonType) ) score += 12;
  if ( summon.role && entry.roles?.split(" ").includes(summon.role) ) score += 8;
  if ( summon.rank && entry.ranks?.split(" ").some(candidate => {
    return getRankSortValue(candidate) <= getRankSortValue(summon.rank);
  }) ) score += 4;
  if ( summon.tribe && path.includes(summon.tribe.slugify({ strict: true })) ) score += 16;
  if ( summon.tribe === "dogWolf" && path.includes("dog-wolf") ) score += 16;
  if ( summon.tribe === "hareRabbit" && path.includes("hare-rabbit") ) score += 16;
  if ( summon.category && path.includes(summon.category) ) score += 8;
  if ( summon.role && path.includes(summon.role) ) score += 8;
  if ( entry.category === "role" ) score += 4;
  if ( entry.category === "tribe" ) score += 4;
  return score;
}

function dedupeSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter(suggestion => {
    const key = `${suggestion.uuid}|${suggestion.sourcePath}|${suggestion.name}`;
    if ( seen.has(key) ) return false;
    seen.add(key);
    return true;
  });
}

function getEntryRank(entry) {
  let rank = foundry.utils.getProperty(entry, "system.rank")
    ?? foundry.utils.getProperty(entry, "system.type.nestedsubtype")
    ?? entry.rank;
  rank = `${rank ?? ""}`.toLowerCase();
  if ( LEGACY_RANKS[rank] ) return LEGACY_RANKS[rank];
  if ( RANK_ORDER.includes(rank) ) return rank;
  const nameRank = `${entry.name ?? ""}`.match(/\[?([dcbas])-rank\]?/i)?.[1]?.toLowerCase();
  if ( nameRank && RANK_ORDER.includes(nameRank) ) return nameRank;
  const path = getSourcePath(entry);
  const pathRank = path.match(/(^|-)([dcbas])-rank($|-)/)?.[2] ?? path.match(/(^|-)([dcbas])rank($|-)/)?.[2];
  return pathRank && RANK_ORDER.includes(pathRank) ? pathRank : "";
}

function getSourcePath(entry) {
  return `${foundry.utils.getProperty(entry, "flags.n5eb.legacyImport.sourcePath")
    ?? foundry.utils.getProperty(entry, "_stats.legacyImport.sourcePath") ?? ""}`.slugify({ strict: true });
}

function getSourceTribe(entry, definitions=null) {
  const tags = getSummonContentTags(entry, definitions);
  if ( tags.tribes.length ) return tags.tribes[0];
  const path = getSourcePath(entry);
  if ( path.includes("dog-wolf") ) return "dogWolf";
  if ( path.includes("hare-rabbit") ) return "hareRabbit";
  for ( const tribe of Object.keys(CONFIG.DND5E.summonTribes) ) {
    if ( path.includes(tribe.slugify({ strict: true })) ) return tribe;
  }
  return "";
}

function getSourceTribeLabel(entry, definitions=null) {
  const tribe = getSourceTribe(entry, definitions);
  return tribe ? getSummonDefinitionLabel("tribe", tribe, definitions) : "";
}

async function getSummonDefinitions() {
  const registry = createSummonDefinitionRegistry();

  for ( const pack of getSummonItemPacks({ includeCustom: true }) ) {
    let index;
    try {
      index = await pack.getIndex({ fields: INDEX_FIELDS });
    } catch(err) {
      console.warn(`n5eb | Could not index summon definitions from ${pack.collection}`, err);
      continue;
    }
    for ( const entry of index ) {
      const definition = formatSummonDefinition(entry, pack);
      if ( definition ) addSummonDefinition(registry, definition);
    }
  }

  for ( const item of game.items ) {
    const definition = formatSummonDefinition(item, null);
    if ( definition ) addSummonDefinition(registry, definition);
  }

  return finalizeSummonDefinitions(registry);
}

function createSummonDefinitionRegistry() {
  const registry = {
    tribeMap: new Map(),
    typeMap: new Map(),
    breedMap: new Map(),
    tribes: [],
    types: [],
    breeds: [],
    customTribes: [],
    customTypes: [],
    customBreeds: [],
    tribeChoices: {},
    typeChoices: {},
    breedChoices: {}
  };

  for ( const [key, config] of Object.entries(CONFIG.DND5E.summonTribes) ) {
    addSummonDefinition(registry, {
      kind: "tribe",
      key,
      label: config.label,
      defaults: cleanSummonDefaults(CONFIG.DND5E.summonTribeDefaults[key] ?? {}),
      core: true,
      priority: 0,
      sourceLabel: game.i18n.localize("N5EB.Summon.Builder.CoreLibrary")
    });
  }

  registry.typeChoices[""] = { label: CONFIG.DND5E.summonTypes[""]?.label ?? game.i18n.localize("N5EB.None") };
  for ( const [key, config] of Object.entries(CONFIG.DND5E.summonTypes) ) {
    if ( !key ) continue;
    addSummonDefinition(registry, {
      kind: "type",
      key,
      label: config.label,
      core: true,
      priority: 0,
      sourceLabel: game.i18n.localize("N5EB.Summon.Builder.CoreLibrary")
    });
  }

  return registry;
}

function addSummonDefinition(registry, definition) {
  if ( !definition?.kind || !definition.key ) return;
  const map = getDefinitionMap(registry, definition.kind);
  if ( !map ) return;
  const existing = map.get(definition.key);
  if ( existing && ((existing.priority ?? 0) > (definition.priority ?? 0)) ) return;
  map.set(definition.key, {
    ...definition,
    label: definition.label || formatDefinitionLabel(definition.key)
  });
}

function finalizeSummonDefinitions(registry) {
  registry.tribes = Array.from(registry.tribeMap.values()).toSorted(sortDefinition);
  registry.types = Array.from(registry.typeMap.values()).toSorted(sortDefinition);
  registry.breeds = Array.from(registry.breedMap.values()).toSorted(sortDefinition);
  registry.customTribes = registry.tribes.filter(definition => !definition.core);
  registry.customTypes = registry.types.filter(definition => !definition.core);
  registry.customBreeds = registry.breeds.filter(definition => !definition.core);
  registry.tribeChoices = Object.fromEntries(registry.tribes.map(definition => {
    return [definition.key, { label: definition.label }];
  }));
  registry.typeChoices = {
    "": { label: CONFIG.DND5E.summonTypes[""]?.label ?? game.i18n.localize("N5EB.None") },
    ...Object.fromEntries(registry.types.map(definition => [definition.key, { label: definition.label }]))
  };
  registry.breedChoices = Object.fromEntries(registry.breeds.map(definition => {
    return [definition.key, { label: definition.label }];
  }));
  return registry;
}

function getDefinitionMap(registry, kind) {
  if ( kind === "type" ) return registry.typeMap;
  if ( kind === "inuzukaBreed" ) return registry.breedMap;
  if ( kind === "tribe" ) return registry.tribeMap;
  return null;
}

function sortDefinition(lhs, rhs) {
  if ( lhs.core !== rhs.core ) return lhs.core ? -1 : 1;
  return lhs.label.localeCompare(rhs.label, game.i18n.lang);
}

function formatSummonDefinition(entry, pack) {
  const kind = getSummonDefinitionKind(entry);
  if ( !kind ) return null;
  const flag = foundry.utils.getProperty(entry, "flags.n5eb.summonDefinition") ?? {};
  const key = normalizeDefinitionKey(kind, flag.key || flag.variant || entry.name);
  if ( !key ) return null;
  const uuid = entry.uuid ?? (pack ? `Compendium.${pack.collection}.Item.${entry._id}` : `Item.${entry.id}`);
  const sourceLabel = pack?.metadata.label ?? game.i18n.localize("N5EB.Summon.Builder.WorldItems");
  const definition = {
    kind,
    key,
    uuid,
    img: entry.img || "icons/svg/book.svg",
    label: `${flag.label || entry.name || formatDefinitionLabel(key)}`.trim(),
    sourceLabel,
    core: false,
    priority: pack ? 10 : 20
  };
  if ( kind === "tribe" ) {
    definition.defaults = cleanSummonDefaults({
      summonType: normalizeSummonType(flag.summonType),
      toughness: flag.toughness,
      defenseAbility: normalizeChoice(flag.defenseAbility, CONFIG.DND5E.abilities, ""),
      jutsuAbility: normalizeChoice(flag.jutsuAbility, CONFIG.DND5E.abilities, "")
    });
  }
  if ( kind === "inuzukaBreed" ) {
    definition.baseTribe = normalizeSummonTribe(flag.baseTribe || "dogWolf") || "dogWolf";
    definition.category = normalizeChoice(flag.category, CONFIG.DND5E.summonCategories, "inuzuka");
    definition.variant = normalizeInuzukaBreed(flag.variant || key) || key;
    definition.defaults = cleanSummonDefaults({
      summonType: normalizeSummonType(flag.summonType),
      toughness: flag.toughness,
      defenseAbility: normalizeChoice(flag.defenseAbility, CONFIG.DND5E.abilities, ""),
      jutsuAbility: normalizeChoice(flag.jutsuAbility, CONFIG.DND5E.abilities, "")
    });
  }
  return definition;
}

function getSummonDefinitionKind(entry) {
  const flagKind = foundry.utils.getProperty(entry, "flags.n5eb.summonDefinition.kind");
  if ( ["tribe", "type", "inuzukaBreed"].includes(flagKind) ) return flagKind;
  const subtype = foundry.utils.getProperty(entry, "system.type.subtype");
  if ( subtype === "tribeDefinition" ) return "tribe";
  if ( subtype === "typeDefinition" ) return "type";
  if ( subtype === "inuzukaBreedDefinition" ) return "inuzukaBreed";
  return "";
}

function isSummonDefinition(entry) {
  return entry.type === "feat" && !!getSummonDefinitionKind(entry);
}

function getSummonChoiceOptions(kind, selected, definitions) {
  const choices = { ...getDefinitionChoices(kind, definitions) };
  if ( selected && !(selected in choices) ) choices[selected] = { label: formatDefinitionLabel(selected) };
  return choices;
}

function getSelectedSummonDefinition(kind, selected, sourceUuid, definitions) {
  const entries = getDefinitionEntries(kind, definitions);
  const map = getDefinitionMap(definitions, kind);
  const selectedDefinition = sourceUuid ? entries.find(definition => definition.uuid === sourceUuid) : null;
  if ( selectedDefinition ) return selectedDefinition;
  if ( selected && map.has(selected) ) return map.get(selected);
  if ( !selected ) return null;
  return {
    kind,
    key: selected,
    label: formatDefinitionLabel(selected),
    sourceLabel: game.i18n.localize("N5EB.Summon.Builder.Manual")
  };
}

function getDefinitionFilterOptions(kind, definitions) {
  const entries = getDefinitionEntries(kind, definitions);
  const label = kind === "type" ? "N5EB.Summon.Builder.AllSummonTypes" : "N5EB.Summon.Builder.AllTribes";
  return [
    { value: "", label: game.i18n.localize(label) },
    ...entries.map(definition => ({ value: definition.key, label: definition.label }))
  ];
}

function getSummonDefinitionLabel(kind, key, definitions=null) {
  if ( !key ) return "";
  const map = definitions ? getDefinitionMap(definitions, kind) : null;
  const definition = map?.get(key);
  if ( definition ) return definition.label;
  const config = kind === "type" ? CONFIG.DND5E.summonTypes[key] : CONFIG.DND5E.summonTribes[key];
  return config?.label ?? formatDefinitionLabel(key);
}

function getDefinitionEntries(kind, definitions) {
  if ( kind === "type" ) return definitions.types;
  if ( kind === "inuzukaBreed" ) return definitions.breeds;
  return definitions.tribes;
}

function getDefinitionChoices(kind, definitions) {
  if ( kind === "type" ) return definitions.typeChoices;
  if ( kind === "inuzukaBreed" ) return definitions.breedChoices;
  return definitions.tribeChoices;
}

function getSummonTribeDefaults(tribe, definitions=null) {
  const coreDefaults = cleanSummonDefaults(CONFIG.DND5E.summonTribeDefaults[tribe] ?? {});
  const customDefaults = cleanSummonDefaults(definitions?.tribeMap?.get(tribe)?.defaults ?? {});
  return { ...coreDefaults, ...customDefaults };
}

function getSummonDefaults(summon, definitions=null) {
  if ( summon.category === "inuzuka" ) {
    const breedDefaults = cleanSummonDefaults(definitions?.breedMap?.get(summon.variant)?.defaults ?? {});
    if ( !foundry.utils.isEmpty(breedDefaults) ) return breedDefaults;
  }
  return getSummonTribeDefaults(summon.tribe, definitions);
}

function buildNewDefinitionData(kind, summon, definitions) {
  const isType = kind === "type";
  const selected = isType ? summon.summonType : summon.tribe;
  const coreChoices = isType ? CONFIG.DND5E.summonTypes : CONFIG.DND5E.summonTribes;
  const fallback = isType ? "custom-type" : "custom-tribe";
  const base = selected && !(selected in coreChoices) ? selected : fallback;
  const key = getUniqueDefinitionKey(normalizeDefinitionKey(kind, base), kind, definitions);
  const label = formatDefinitionLabel(key);
  const definition = { kind, key, label };
  if ( !isType ) {
    Object.assign(definition, cleanSummonDefaults({
      summonType: summon.summonType,
      toughness: summon.toughness,
      defenseAbility: summon.defenseAbility,
      jutsuAbility: summon.jutsuAbility
    }));
  }

  return {
    name: label,
    type: "feat",
    img: "icons/svg/book.svg",
    system: {
      type: {
        value: "summon",
        subtype: isType ? "typeDefinition" : "tribeDefinition"
      },
      description: {
        value: `<p>${game.i18n.localize("N5EB.Summon.Definition.Description")}</p>`
      }
    },
    flags: {
      n5eb: {
        summonDefinition: definition
      }
    }
  };
}

function getUniqueDefinitionKey(base, kind, definitions) {
  base ||= kind === "type" ? "custom-type" : "custom-tribe";
  const map = kind === "type" ? definitions?.typeMap : definitions?.tribeMap;
  if ( !map?.has(base) ) return base;
  for ( let index = 2; index < 100; index++ ) {
    const candidate = `${base}-${index}`;
    if ( !map.has(candidate) ) return candidate;
  }
  return `${base}-${foundry.utils.randomID(4)}`;
}

function cleanSummonDefaults(defaults) {
  const cleaned = {};
  if ( defaults.summonType ) cleaned.summonType = normalizeSummonType(defaults.summonType);
  if ( Number(defaults.toughness) ) cleaned.toughness = Math.max(0, Number(defaults.toughness) || 0);
  if ( defaults.defenseAbility ) {
    cleaned.defenseAbility = normalizeChoice(defaults.defenseAbility, CONFIG.DND5E.abilities, "");
  }
  if ( defaults.jutsuAbility ) cleaned.jutsuAbility = normalizeChoice(defaults.jutsuAbility, CONFIG.DND5E.abilities, "");
  return cleaned;
}

function hasSummonContentFlags(entry) {
  return ["tribes", "types", "roles", "ranks"].some(key => {
    const value = foundry.utils.getProperty(entry, `flags.n5eb.summonContent.${key}`);
    return normalizeTagList(value, candidate => `${candidate ?? ""}`.trim()).length > 0;
  });
}

function getSummonContentTags(entry, definitions=null) {
  const inferred = inferSummonContentTags(entry, definitions);
  const tribes = normalizeTagList(
    foundry.utils.getProperty(entry, "flags.n5eb.summonContent.tribes"),
    normalizeSummonTribe
  );
  const types = normalizeTagList(
    foundry.utils.getProperty(entry, "flags.n5eb.summonContent.types"),
    normalizeSummonType
  );
  const roles = normalizeTagList(
    foundry.utils.getProperty(entry, "flags.n5eb.summonContent.roles"),
    normalizeRoleTag
  );
  const ranks = normalizeTagList(
    foundry.utils.getProperty(entry, "flags.n5eb.summonContent.ranks"),
    normalizeRankTag
  );
  return {
    tribes: tribes.length ? tribes : inferred.tribes,
    types: types.length ? types : inferred.types,
    roles: roles.length ? roles : inferred.roles,
    ranks: ranks.length ? ranks : inferred.ranks
  };
}

function inferSummonContentTags(entry, definitions=null) {
  const path = getSourcePath(entry);
  const tribes = new Set();
  const types = new Set();
  const roles = new Set();
  const ranks = new Set();

  for ( const definition of definitions?.tribes ?? [] ) {
    if ( pathIncludesDefinition(path, definition.key) ) tribes.add(definition.key);
  }
  for ( const definition of definitions?.types ?? [] ) {
    if ( pathIncludesDefinition(path, definition.key) ) types.add(definition.key);
  }
  if ( path.includes("dog-wolf") ) tribes.add("dogWolf");
  if ( path.includes("hare-rabbit") ) tribes.add("hareRabbit");
  for ( const role of Object.keys(CONFIG.DND5E.summonRoles) ) {
    if ( path.includes(role.slugify({ strict: true })) ) roles.add(role);
  }
  const rank = getEntryRank(entry);
  if ( rank ) ranks.add(rank);

  return {
    tribes: Array.from(tribes),
    types: Array.from(types),
    roles: Array.from(roles),
    ranks: Array.from(ranks)
  };
}

function pathIncludesDefinition(path, key) {
  if ( !path || !key ) return false;
  const needles = new Set([
    `${key}`.toLowerCase(),
    `${key}`.slugify({ strict: true }),
    formatDefinitionLabel(key).slugify({ strict: true })
  ]);
  return Array.from(needles).some(needle => needle && path.includes(needle));
}

function normalizeTagList(value, normalize) {
  let values;
  if ( value instanceof Set ) values = Array.from(value);
  else if ( Array.isArray(value) ) values = value;
  else if ( (value === undefined) || (value === null) ) values = [];
  else values = `${value}`.split(/[,;\n]+/);
  return Array.from(new Set(values.map(candidate => normalize(candidate)).filter(Boolean)));
}

function normalizeRoleTag(value) {
  const slug = `${value ?? ""}`.slugify({ strict: true });
  return slug in CONFIG.DND5E.summonRoles ? slug : "";
}

function normalizeRankTag(value) {
  const slug = `${value ?? ""}`.slugify({ strict: true }).toLowerCase();
  if ( LEGACY_RANKS[slug] ) return LEGACY_RANKS[slug];
  const rank = slug.match(/^([dcbas])(?:-?rank)?$/)?.[1] ?? "";
  return RANK_ORDER.includes(rank) ? rank : "";
}

function normalizeDefinitionKey(kind, value) {
  if ( kind === "type" ) return normalizeSummonType(value);
  if ( kind === "inuzukaBreed" ) return normalizeInuzukaBreed(value);
  return normalizeSummonTribe(value);
}

function formatDefinitionLabel(key) {
  return `${key ?? ""}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function getRankSortValue(rank) {
  const index = RANK_ORDER.indexOf(rank);
  return index === -1 ? RANK_ORDER.length : index;
}

function getSummonJutsuSlots(level) {
  level = Math.clamp(Number(level) || 1, 1, 30);
  return CONFIG.DND5E.summonJutsuSlots.find(config => level >= config.level)?.slots ?? 5;
}

function getRankFilterOptions() {
  return [
    { value: "", label: game.i18n.localize("N5EB.Summon.Builder.AllRanks") },
    ...Object.entries(CONFIG.DND5E.summonRanks).map(([value, { label }]) => ({ value, label }))
  ];
}

function getFeatureKindOptions(suggestions) {
  const kinds = new Map(suggestions.map(s => [s.kind, s.kindLabel]));
  return [
    { value: "", label: game.i18n.localize("N5EB.Summon.Builder.AllTypes") },
    ...Array.from(kinds, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

function getWeaponKindOptions() {
  return [
    { value: "", label: game.i18n.localize("N5EB.Summon.Builder.AllTypes") },
    { value: "weapon", label: game.i18n.localize("N5EB.Feature.Summon.NaturalWeapon") }
  ];
}

function getJutsuKindOptions() {
  return [
    { value: "", label: game.i18n.localize("N5EB.Summon.Builder.AllTypes") },
    ...Object.entries(CONFIG.DND5E.jutsuTypes).map(([value, { label }]) => ({ value, label })),
    { value: "summon", label: game.i18n.localize("N5EB.Summon.Builder.SummonJutsu") }
  ];
}

function getCategoryFilterOptions(suggestions) {
  const categories = new Map(suggestions.map(s => [s.category, s.categoryLabel]));
  return [
    { value: "", label: game.i18n.localize("N5EB.Summon.Builder.AllCategories") },
    ...Array.from(categories, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

function getPackFilterOptions(suggestions) {
  const packs = new Map(suggestions.map(s => [s.sourceKey, s.sourceLabel]));
  return [
    { value: "", label: game.i18n.localize("N5EB.Summon.Builder.AllSources") },
    ...Array.from(packs, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

function normalizeSummonTribe(tribe) {
  tribe = `${tribe ?? ""}`;
  if ( tribe === "dog-wolf" ) return "dogWolf";
  if ( tribe === "hare-rabbit" ) return "hareRabbit";
  if ( tribe in CONFIG.DND5E.summonTribes ) return tribe;
  const slug = tribe.slugify({ strict: true });
  if ( slug === "dog-wolf" ) return "dogWolf";
  if ( slug === "hare-rabbit" ) return "hareRabbit";
  return (slug in CONFIG.DND5E.summonTribes) ? slug : slug;
}

function normalizeSummonType(type) {
  type = `${type ?? ""}`;
  if ( type in CONFIG.DND5E.summonTypes ) return type;
  const slug = type.slugify({ strict: true });
  if ( slug === "rodents" ) return "rodent";
  return (slug in CONFIG.DND5E.summonTypes) ? slug : slug;
}

function normalizeInuzukaBreed(value) {
  const slug = `${value ?? ""}`.slugify({ strict: true });
  if ( slug.includes("inuit") ) return "inuit";
  if ( slug.includes("kugsha") ) return "kugsha";
  if ( slug.includes("tamaskan") || slug.includes("yamaskan") ) return "tamaskan";
  return slug;
}

function normalizeChoice(value, choices, fallback) {
  value = `${value ?? ""}`;
  return value in choices ? value : fallback;
}
