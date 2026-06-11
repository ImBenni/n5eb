/* eslint-disable jsdoc/require-jsdoc */

import BaseConfigSheet from "../api/base-config-sheet.mjs";

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
  "flags.n5eb.legacyImport.sourcePath", "_stats.legacyImport.sourcePath"
];

/**
 * NPC sheet child application for configuring N5eB summons.
 */
export default class SummonBuilderConfig extends BaseConfigSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["summon-builder"],
    actions: {
      addSelected: SummonBuilderConfig.#addSelected,
      applyDefaults: SummonBuilderConfig.#applyDefaults,
      save: SummonBuilderConfig.#save,
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

  /** @override */
  get title() {
    return game.i18n.format("N5EB.Summon.Builder.Title", { name: this.document.name });
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.document;
    const source = getSummonSource(this.document);
    context.source = source;
    context.identity = getSummonIdentity(source);
    context.summary = getSummonSummary(source);
    context.warnings = getSummonWarnings(this.document, source);
    context.suggestions = await getSummonSuggestions(this.document, source);
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
    const defaults = CONFIG.DND5E.summonTribeDefaults[summon.tribe] ?? {};
    this.#setFormValue("summon.toughness", defaults.toughness ?? summon.toughness);
    this.#setFormValue("summon.summonType", defaults.summonType ?? summon.summonType);
    this.#setFormValue("summon.defenseAbility", defaults.defenseAbility ?? summon.defenseAbility);
    this.#setFormValue("summon.jutsuAbility", defaults.jutsuAbility ?? summon.jutsuAbility);
    this.#syncSummary();
    this.#syncIdentity();
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
    const identity = getSummonIdentity(summon);
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
    let visible = 0;

    for ( const row of panel.querySelectorAll(".adversary-suggestion") ) {
      const matchesSearch = !search || row.dataset.search?.includes(search);
      const matchesRank = !rank || !row.dataset.rank || (getRankSortValue(row.dataset.rank) <= getRankSortValue(rank));
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
      summonType: normalizeChoice(this.#formValue("summon.summonType"), CONFIG.DND5E.summonTypes, ""),
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
      "system.details.summon.summonType": normalizeChoice(summon.summonType, CONFIG.DND5E.summonTypes, ""),
      "system.details.summon.toughness": Math.max(0, Number(summon.toughness) || 0),
      "system.details.summon.defenseAbility": normalizeChoice(summon.defenseAbility, CONFIG.DND5E.abilities, ""),
      "system.details.summon.jutsuAbility": normalizeChoice(summon.jutsuAbility, CONFIG.DND5E.abilities, ""),
      "system.details.summon.migrated": (summon.migrated === true) || (summon.migrated === "true"),
      "system.details.summon.sourceUuid": `${summon.sourceUuid ?? ""}`,
      "system.details.adversary.enabled": false
    });
  }
}

function getSummonSource(actor) {
  const source = foundry.utils.deepClone(
    actor.system._source.details?.summon ?? actor.system.details.summon ?? {}
  );
  source.enabled ??= false;
  source.level = Math.clamp(Number(source.level) || actor.system.details.level || actor.system.details.cr || 1, 1, 30);
  source.rank = normalizeChoice(source.rank, CONFIG.DND5E.summonRanks, "d");
  source.category = normalizeChoice(source.category, CONFIG.DND5E.summonCategories, "tribe");
  source.tribe = normalizeSummonTribe(source.tribe);
  source.variant ??= "";
  source.role = normalizeChoice(source.role, CONFIG.DND5E.summonRoles, "striker");
  source.summonType = normalizeChoice(source.summonType, CONFIG.DND5E.summonTypes, "");
  source.toughness = Math.max(0, Number(source.toughness) || 0);
  source.defenseAbility = normalizeChoice(source.defenseAbility, CONFIG.DND5E.abilities, "");
  source.jutsuAbility = normalizeChoice(source.jutsuAbility, CONFIG.DND5E.abilities, "");
  source.migrated ??= false;
  source.sourceUuid ??= "";
  return source;
}

function getSummonIdentity(summon) {
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
      label: CONFIG.DND5E.summonTribes[summon.tribe]?.label ?? summon.tribe
    } : null,
    role: {
      key: summon.role,
      label: CONFIG.DND5E.summonRoles[summon.role]?.label ?? summon.role
    },
    summonType: summon.summonType ? {
      key: summon.summonType,
      label: CONFIG.DND5E.summonTypes[summon.summonType]?.label ?? summon.summonType
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

async function getSummonSuggestions(actor, summon) {
  const existing = getExistingSourceKeys(actor);
  const features = [];
  const weapons = [];
  const jutsu = [];

  for ( const pack of getN5eItemPacks() ) {
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    for ( const entry of index ) {
      if ( entry.type === "class" ) continue;
      if ( entry.type === "feat" && isSummonFeature(entry, pack) ) {
        features.push(formatSuggestion(entry, pack, "feat", existing));
      }
      else if ( entry.type === "weapon" && isSummonWeapon(entry, pack) ) {
        weapons.push(formatSuggestion(entry, pack, "weapon", existing));
      }
      else if ( entry.type === "spell" && isSummonJutsu(entry, pack) ) {
        jutsu.push(formatSuggestion(entry, pack, "spell", existing));
      }
    }
  }

  for ( const item of game.items ) {
    if ( item.type === "feat" && isSummonFeature(item, null) ) features.push(formatSuggestion(item, null, "feat", existing));
    else if ( item.type === "weapon" && isSummonWeapon(item, null) ) {
      weapons.push(formatSuggestion(item, null, "weapon", existing));
    }
    else if ( item.type === "spell" && isSummonJutsu(item, null) ) {
      jutsu.push(formatSuggestion(item, null, "spell", existing));
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

function getN5eItemPacks() {
  const packs = [];
  for ( const pack of game.packs ) {
    const metadata = pack.metadata ?? {};
    if ( (pack.documentName !== "Item") && (metadata.type !== "Item") ) continue;
    const label = `${metadata.label ?? ""} ${pack.collection ?? ""}`.toLowerCase();
    const isSystemPack = (metadata.packageName === "n5eb") || (metadata.package === "n5eb")
      || (metadata.system === "n5eb") || pack.collection?.startsWith("n5eb.");
    const isJiraiyaPack = label.includes("jiraiya");
    if ( isSystemPack || isJiraiyaPack ) packs.push(pack);
  }
  return packs;
}

function isSummonFeature(entry, pack) {
  const type = foundry.utils.getProperty(entry, "system.type.value");
  if ( type === "summon" ) return true;
  return isSummonSourced(entry, pack);
}

function isSummonWeapon(entry, pack) {
  const path = getSourcePath(entry);
  const weaponPath = /(^|-)(natural-weapons|tribe-weapons|weapon|bite|tail|talons|kicks)($|-)/;
  return isSummonSourced(entry, pack) && weaponPath.test(path);
}

function isSummonJutsu(entry, pack) {
  const path = getSourcePath(entry);
  const name = `${entry.name ?? ""}`.slugify({ strict: true });
  return path.includes("summon-jutsus") || name.startsWith("summoning-")
    || (isSummonSourced(entry, pack) && (entry.type === "spell"));
}

function isSummonSourced(entry, pack) {
  const path = getSourcePath(entry);
  const packText = `${pack?.collection ?? ""} ${pack?.metadata?.label ?? ""}`.toLowerCase();
  return path.includes("summon") || packText.includes("summon") || packText.includes("jiraiya");
}

function formatSuggestion(entry, pack, type, existing) {
  const uuid = entry.uuid ?? (pack ? `Compendium.${pack.collection}.Item.${entry._id}` : `Item.${entry.id}`);
  const rank = getEntryRank(entry);
  const labels = getSuggestionLabels(entry, type);
  const sourcePath = getSourcePath(entry);
  const sourceLabel = pack?.metadata.label ?? game.i18n.localize("N5EB.Summon.Builder.WorldItems");
  const sourceKey = pack?.collection.slugify({ strict: true }) ?? "world-items";
  const rankLabel = rank ? CONFIG.DND5E.summonRanks[rank]?.abbreviation ?? rank.toUpperCase() : "";
  const description = foundry.utils.getProperty(entry, "system.description.value") ?? "";
  const nameKey = entry.name?.slugify({ strict: true });
  const disabled = existing.has(uuid) || existing.has(sourcePath) || existing.has(nameKey);
  const search = [entry.name, rankLabel, labels.categoryLabel, labels.typeLabel, sourceLabel, sourcePath]
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

function getSuggestionLabels(entry, type) {
  if ( type === "weapon" ) {
    return {
      category: getSourceTribe(entry) || "weapon",
      categoryLabel: getSourceTribeLabel(entry) || game.i18n.localize("N5EB.Feature.Summon.NaturalWeapon"),
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

function getSourceTribe(entry) {
  const path = getSourcePath(entry);
  if ( path.includes("dog-wolf") ) return "dogWolf";
  if ( path.includes("hare-rabbit") ) return "hareRabbit";
  for ( const tribe of Object.keys(CONFIG.DND5E.summonTribes) ) {
    if ( path.includes(tribe.slugify({ strict: true })) ) return tribe;
  }
  return "";
}

function getSourceTribeLabel(entry) {
  const tribe = getSourceTribe(entry);
  return tribe ? CONFIG.DND5E.summonTribes[tribe]?.label : "";
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
  return (slug in CONFIG.DND5E.summonTribes) ? slug : "custom";
}

function normalizeChoice(value, choices, fallback) {
  value = `${value ?? ""}`;
  return value in choices ? value : fallback;
}
