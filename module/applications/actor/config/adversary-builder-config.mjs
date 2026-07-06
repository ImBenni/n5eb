import BaseConfigSheet from "../api/base-config-sheet.mjs";
import CompendiumBrowser from "../../compendium-browser.mjs";
import { switchNpcBuilderMode } from "./npc-builder-mode-switch.mjs";
import {
  JUTSU_INDEX_FIELDS,
  formatJutsuLookupEntry,
  getJutsuItemPacks
} from "../../jutsu-lookup-data.mjs";

const CLAN_PACKS = ["clan", "t7-clan", "hb-clan"];
const RANK_ORDER = ["e", "d", "c", "b", "a", "s"];
const DEFAULT_ICON = "icons/svg/mystery-man.svg";
const ADVERSARY_FEATURE_TYPES = new Set(["adversaryTrait", "adversaryPassive"]);
const RANK_ALIASES = {
  erank: "e",
  "e-rank": "e",
  drank: "d",
  "d-rank": "d",
  crank: "c",
  "c-rank": "c",
  brank: "b",
  "b-rank": "b",
  arank: "a",
  "a-rank": "a",
  srank: "s",
  "s-rank": "s"
};
const AFFILIATION_OPTIONS = [
  { value: "", label: "None" },
  { value: "leaf", label: "Leaf Shinobi" },
  { value: "sand", label: "Sand Shinobi" },
  { value: "earth", label: "Earth Shinobi" },
  { value: "cloud", label: "Cloud Shinobi" },
  { value: "mist", label: "Mist Shinobi" },
  { value: "grass", label: "Grass Shinobi" },
  { value: "sound", label: "Sound Shinobi" },
  { value: "waterfall", label: "Waterfall Shinobi" },
  { value: "rain", label: "Rain Shinobi" },
  { value: "snow", label: "Snow Shinobi" },
  { value: "iron", label: "Iron Samurai" },
  { value: "sky", label: "Sky Shinobi" },
  { value: "jashin", label: "Jashin Follower" },
  { value: "silent", label: "Silent Shinobi" },
  { value: "akatsuki-subordinate", label: "Akatsuki Subordinate" },
  { value: "kara-subordinate", label: "Kara Subordinate" },
  { value: "cultist", label: "Cultist" },
  { value: "star", label: "Star Shinobi" },
  { value: "wolf", label: "Wolf Shinobi" },
  { value: "key", label: "Key Shinobi" },
  { value: "moon", label: "Moon Shinobi" },
  { value: "factionless", label: "Factionless" },
  { value: "bandit", label: "Bandit" },
  { value: "puppet-tool", label: "Puppet Tool" },
  { value: "custom", label: "Custom" }
];
const AFFILIATION_OPTION_KEYS = new Set(AFFILIATION_OPTIONS.map(option => option.value).filter(Boolean));
const AFFILIATION_ALIASES = {
  "leaf-shinobi": "leaf",
  "land-of-fire": "leaf",
  fire: "leaf",
  "hidden-leaf": "leaf",
  "leaf-village": "leaf",
  konoha: "leaf",
  konohagakure: "leaf",
  "konohagakure-no-sato": "leaf",
  "sand-shinobi": "sand",
  "land-of-wind": "sand",
  wind: "sand",
  "hidden-sand": "sand",
  "sand-village": "sand",
  suna: "sand",
  sunagakure: "sand",
  "cloud-shinobi": "cloud",
  "land-of-lightning": "cloud",
  lightning: "cloud",
  "hidden-cloud": "cloud",
  "cloud-village": "cloud",
  kumo: "cloud",
  kumogakure: "cloud",
  "mist-shinobi": "mist",
  "land-of-water": "mist",
  water: "mist",
  "hidden-mist": "mist",
  "mist-village": "mist",
  kiri: "mist",
  kirigakure: "mist",
  "earth-shinobi": "earth",
  "land-of-earth": "earth",
  stone: "earth",
  "hidden-stone": "earth",
  "stone-village": "earth",
  iwa: "earth",
  iwagakure: "earth",
  "grass-shinobi": "grass",
  "hidden-grass": "grass",
  kusa: "grass",
  kusagakure: "grass",
  "sound-shinobi": "sound",
  "hidden-sound": "sound",
  oto: "sound",
  otogakure: "sound",
  "waterfall-shinobi": "waterfall",
  "hidden-waterfall": "waterfall",
  taki: "waterfall",
  takigakure: "waterfall",
  "rain-shinobi": "rain",
  "hidden-rain": "rain",
  ame: "rain",
  amegakure: "rain",
  "snow-shinobi": "snow",
  "hidden-snow": "snow",
  yuki: "snow",
  yukigakure: "snow",
  "iron-samurai": "iron",
  "land-of-iron": "iron",
  "sky-shinobi": "sky",
  "hidden-sky": "sky",
  sora: "sky",
  soragakure: "sky",
  "jashin-follower": "jashin",
  "silent-shinobi": "silent",
  "akatsuki-subordinate": "akatsuki-subordinate",
  akatsuki: "akatsuki-subordinate",
  "kara-subordinate": "kara-subordinate",
  kara: "kara-subordinate",
  "star-shinobi": "star",
  "hidden-star": "star",
  hoshi: "star",
  hoshigakure: "star",
  "wolf-shinobi": "wolf",
  "key-shinobi": "key",
  jomae: "key",
  "jomae-village": "key",
  "moon-shinobi": "moon",
  "puppet-tool": "puppet-tool"
};
const AFFILIATION_SEARCH_ALIASES = {
  leaf: ["Leaf Shinobi", "Land of Fire", "Fire", "Hidden Leaf", "Konoha", "Konohagakure"],
  sand: ["Sand Shinobi", "Land of Wind", "Wind", "Hidden Sand", "Suna", "Sunagakure"],
  earth: ["Earth Shinobi", "Land of Earth", "Earth", "Hidden Stone", "Iwa", "Iwagakure"],
  cloud: ["Cloud Shinobi", "Land of Lightning", "Lightning", "Hidden Cloud", "Kumo", "Kumogakure"],
  mist: ["Mist Shinobi", "Land of Water", "Water", "Hidden Mist", "Kiri", "Kirigakure"],
  grass: ["Grass Shinobi", "Hidden Grass", "Kusa", "Kusagakure"],
  sound: ["Sound Shinobi", "Hidden Sound", "Oto", "Otogakure"],
  waterfall: ["Waterfall Shinobi", "Hidden Waterfall", "Taki", "Takigakure"],
  rain: ["Rain Shinobi", "Hidden Rain", "Ame", "Amegakure"],
  snow: ["Snow Shinobi", "Hidden Snow", "Yuki", "Yukigakure"],
  iron: ["Iron Samurai", "Land of Iron"],
  sky: ["Sky Shinobi", "Hidden Sky", "Sora", "Soragakure"],
  jashin: ["Jashin Follower"],
  silent: ["Silent Shinobi"],
  "akatsuki-subordinate": ["Akatsuki Subordinate", "Akatsuki"],
  "kara-subordinate": ["Kara Subordinate", "Kara"],
  cultist: ["Cultist"],
  star: ["Star Shinobi", "Hidden Star", "Hoshi", "Hoshigakure"],
  wolf: ["Wolf Shinobi"],
  key: ["Key Shinobi", "Jomae", "Jomae Village"],
  moon: ["Moon Shinobi"],
  factionless: ["Factionless"],
  bandit: ["Bandit"],
  "puppet-tool": ["Puppet Tool"]
};
const FEATURE_INDEX_FIELDS = [
  "img", "type", "system.description.value", "system.type.value", "system.type.subtype",
  "system.type.nestedsubtype", "system.prerequisites.level", "system.requirements",
  "system.identifier", "flags.n5eb.legacyImport.sourcePath", "_stats.legacyImport.sourcePath",
  "_stats.compendiumSource"
];
const CLAN_INDEX_FIELDS = ["img", "type", "system.identifier"];

let clanChoicesCache = null;

/**
 * NPC sheet child application for configuring N5eB adversaries.
 */
export default class AdversaryBuilderConfig extends BaseConfigSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["npc-builder", "adversary-builder"],
    actions: {
      addSelected: AdversaryBuilderConfig.#addSelected,
      applyDefaults: AdversaryBuilderConfig.#applyDefaults,
      chooseClan: AdversaryBuilderConfig.#chooseClan,
      clearClan: AdversaryBuilderConfig.#clearClan,
      save: AdversaryBuilderConfig.#save,
      switchBuilderMode: AdversaryBuilderConfig.#switchBuilderMode,
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
    return game.i18n.format("N5EB.NPCBuilder.Title", { name: this.document.name });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.document;
    context.builderMode = "adversary";
    const source = getAdversarySource(this.document);
    source.clanDisplay = await getClanDisplay(source.clan);
    source.affiliationChoice = getAffiliationChoice(source.affiliation);
    source.affiliationCustom = source.affiliationChoice === "custom" ? titleCaseKey(source.affiliation) : "";
    source.affiliationIsCustom = source.affiliationChoice === "custom";
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
    context.suggestions = await getAdversarySuggestions(this.document, source);
    context.warnings = getAdversaryWarnings(this.document, source, context.suggestions);
    context.contentTabs = [
      {
        id: "features",
        label: "N5EB.Adversary.Builder.SuggestedFeatures",
        count: context.suggestions.features.length,
        active: this.#activeTab === "features"
      },
      {
        id: "jutsu",
        label: "N5EB.Adversary.Builder.JutsuLookup",
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
    context.featureFilterRanks = getRankFilterOptions();
    context.affiliationOptions = getAffiliationOptions();
    context.featureKinds = getFeatureKindOptions();
    context.featureCategories = getFeatureCategoryOptions(context.suggestions.features);
    context.jutsuKinds = getJutsuKindOptions(context.suggestions.jutsu);
    context.jutsuActions = getSingleValueFilterOptions(context.suggestions.jutsu, "activation", "activationLabel",
      "N5EB.Adversary.Builder.AllActions");
    context.jutsuActionTypes = getSingleValueFilterOptions(context.suggestions.jutsu, "actionType", "actionTypeLabel",
      "N5EB.Adversary.Builder.AllRollTypes");
    context.jutsuCosts = getJutsuCostOptions(context.suggestions.jutsu);
    context.jutsuComponents = getMultiValueFilterOptions(context.suggestions.jutsu, "components", "componentLabels",
      "N5EB.Adversary.Builder.AllComponents");
    context.jutsuKeywords = getMultiValueFilterOptions(context.suggestions.jutsu, "keywords", "keywordLabels",
      "N5EB.Adversary.Builder.AllKeywords");
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
    this.#syncAffiliationCustom();
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
    const adversary = await this.#saveAdversary();
    await addAutomaticPassives(this.document, adversary);
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
    const adversary = await this.#saveAdversary();

    const selected = Array.from(this.element.querySelectorAll("input[name='itemUuids']:checked:not(:disabled)"))
      .map(input => input.value);
    await clearSuppressedAutoPassives(this.document, selected);
    const existing = getExistingSuggestionKeys(this.document);
    const toCreate = [];
    for ( const uuid of selected ) {
      const item = await fromUuid(uuid);
      if ( !item ) continue;
      if ( existing.hasSuggestion(item, uuid) ) continue;
      const data = item.pack ? game.items.fromCompendium(item, { keepId: false }) : item.toObject();
      delete data._id;
      foundry.utils.setProperty(data, "flags.n5eb.adversaryBuilder.sourceUuid", uuid);
      foundry.utils.setProperty(data, "flags.n5eb.adversaryBuilder.autoPassive", false);
      toCreate.push(data);
      existing.addData(data, uuid);
    }
    if ( toCreate.length ) await this.document.createEmbeddedDocuments("Item", toCreate);
    await addAutomaticPassives(this.document, adversary);
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
   * Select a clan from the compendium browser.
   * @this {AdversaryBuilderConfig}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static async #chooseClan(event, target) {
    event.preventDefault();
    const filters = {
      locked: {
        documentClass: "Item",
        types: new Set(["race"])
      },
      initial: {
        documentClass: "Item",
        types: new Set(["race"])
      }
    };
    const uuid = await CompendiumBrowser.selectOne({
      filters,
      includeWorld: true,
      tab: "races",
      hint: game.i18n.localize("N5EB.Adversary.Builder.SelectClanHint")
    }, this._detachOptions());
    if ( !uuid ) return;

    const item = await fromUuid(uuid);
    if ( !item ) return;
    const clan = normalizeClanKey(item.system?.identifier || item.name);
    this.#setClanField(clan, { label: item.name, img: item.img || DEFAULT_ICON });
    const adversary = await this.#saveAdversary();
    await addAutomaticPassives(this.document, adversary);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Clear the selected clan.
   * @this {AdversaryBuilderConfig}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static async #clearClan(event, target) {
    event.preventDefault();
    this.#setClanField("", { label: game.i18n.localize("N5EB.Adversary.Builder.NoClan"), img: DEFAULT_ICON });
    await this.#saveAdversary();
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Switch to another NPC builder mode.
   * @this {AdversaryBuilderConfig}
   * @param {Event} event         Triggering event.
   * @param {HTMLElement} target  Action target.
   */
  static async #switchBuilderMode(event, target) {
    event.preventDefault();
    if ( target.dataset.mode !== "summon" ) return;
    const { default: SummonBuilderConfig } = await import("./summon-builder-config.mjs");
    await switchNpcBuilderMode(this, SummonBuilderConfig);
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
        if ( target.name === "adversary.affiliation" ) this.#syncAffiliationCustom();
        this.#syncSummary();
        this.#syncIdentity();
      }
    });

    root.addEventListener("click", async event => {
      const target = event.target;
      if ( !(target instanceof HTMLElement) ) return;

      const clearFilters = target.closest("[data-filter-clear]");
      if ( clearFilters ) {
        event.preventDefault();
        this.#clearFilters(clearFilters.closest("[data-content-panel]"));
        return;
      }

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
   * Toggle the custom affiliation input.
   */
  #syncAffiliationCustom() {
    const select = this.form?.elements.namedItem("adversary.affiliation");
    const custom = this.form?.elements.namedItem("adversary.affiliationCustom");
    if ( !custom ) return;
    const isCustom = select?.value === "custom";
    custom.hidden = !isCustom;
    custom.disabled = !isCustom;
    custom.closest(".affiliation-fields")?.classList.toggle("custom", isCustom);
  }

  /* -------------------------------------------- */

  /**
   * Update the selected clan form field and readout.
   * @param {string} clan      Normalized clan key.
   * @param {object} display   Clan display data.
   * @param {string} display.label  Label to show.
   * @param {string} display.img    Icon to show.
   */
  #setClanField(clan, { label, img }={}) {
    const input = this.form?.elements.namedItem("adversary.clan");
    if ( input ) input.value = clan;

    const readout = this.element.querySelector("[data-clan-label]");
    if ( readout ) readout.replaceChildren(label || titleCaseKey(clan)
      || game.i18n.localize("N5EB.Adversary.Builder.NoClan"));

    const image = this.element.querySelector("[data-clan-image]");
    if ( image ) {
      image.src = img || DEFAULT_ICON;
      image.alt = label || "";
    }

    const clear = this.element.querySelector("[data-action='clearClan']");
    if ( clear ) clear.hidden = !clan;
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
    const activation = panel.querySelector("[data-filter='activation']")?.value ?? "";
    const actionType = panel.querySelector("[data-filter='actionType']")?.value ?? "";
    const cost = panel.querySelector("[data-filter='cost']")?.value ?? "";
    const component = panel.querySelector("[data-filter='component']")?.value ?? "";
    const keywords = Array.from(panel.querySelectorAll("[data-filter='keyword']:checked"))
      .map(input => input.value).filter(Boolean);
    let visible = 0;

    for ( const row of panel.querySelectorAll(".adversary-suggestion") ) {
      const rowKeywords = row.dataset.keywords?.split(/\s+/).filter(Boolean) ?? [];
      const matchesSearch = !search || row.dataset.search?.includes(search);
      const matchesRank = rankMatchesFilter(row.dataset.rank, rank, panel.dataset.contentPanel);
      const matchesKind = !kind || row.dataset.kind === kind;
      const matchesCategory = !category || row.dataset.category === category;
      const matchesSource = !source || row.dataset.source === source;
      const matchesActivation = !activation || row.dataset.activation === activation;
      const matchesActionType = !actionType || row.dataset.actionType === actionType;
      const matchesCost = !cost || row.dataset.cost === cost;
      const matchesComponent = !component || row.dataset.components?.split(/\s+/).includes(component);
      const matchesKeyword = !keywords.length || keywords.every(keyword => rowKeywords.includes(keyword));
      const hidden = !(matchesSearch && matchesRank && matchesKind && matchesCategory && matchesSource
        && matchesActivation && matchesActionType && matchesCost && matchesComponent && matchesKeyword);
      row.hidden = hidden;
      if ( !hidden ) visible++;
    }

    for ( const group of panel.querySelectorAll("[data-suggestion-group]") ) {
      const groupVisible = Array.from(group.querySelectorAll(".adversary-suggestion"))
        .filter(row => !row.hidden).length;
      group.hidden = groupVisible === 0;
      group.querySelector("[data-group-visible]")?.replaceChildren(`${groupVisible}`);
    }

    const empty = panel.querySelector("[data-filter-empty]");
    if ( empty ) empty.hidden = visible > 0;
    this.#syncFilterMenuState(panel);
  }

  /* -------------------------------------------- */

  /**
   * Clear non-search filters for a panel.
   * @param {HTMLElement|null} panel  Panel whose filters should be reset.
   */
  #clearFilters(panel) {
    if ( !panel ) return;
    for ( const filter of panel.querySelectorAll(".adversary-filter") ) {
      if ( filter.dataset.filter === "search" ) continue;
      if ( filter instanceof HTMLInputElement && (filter.type === "checkbox") ) filter.checked = false;
      else if ( "value" in filter ) filter.value = "";
    }
    this.#applyFilters(panel);
  }

  /* -------------------------------------------- */

  /**
   * Update compact filter menu active count.
   * @param {HTMLElement|null} panel  Panel whose filter count should be shown.
   */
  #syncFilterMenuState(panel) {
    if ( !panel ) return;
    const active = Array.from(panel.querySelectorAll(".adversary-filter")).filter(filter => {
      if ( filter.dataset.filter === "search" ) return false;
      if ( filter instanceof HTMLInputElement && (filter.type === "checkbox") ) return filter.checked;
      return Boolean(filter.value);
    }).length;
    const count = panel.querySelector("[data-filter-count]");
    if ( count ) {
      count.hidden = active === 0;
      count.replaceChildren(`${active}`);
    }
    panel.querySelector("[data-filter-menu] > summary")?.classList.toggle("active", active > 0);
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
    preview.querySelector("[data-preview-kind]")?.replaceChildren(row.dataset.kindLabel ?? "");
    setOptionalPreviewTag(preview, "pack", row.dataset.suggestionType === "spell" ? "" : row.dataset.packLabel);
    setOptionalPreviewTag(preview, "cost", row.dataset.costLabel);
    setOptionalPreviewTag(preview, "activation", row.dataset.activationLabel);
    setOptionalPreviewTag(preview, "action-type", row.dataset.actionTypeLabel);

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
    meta.textContent = [
      row.dataset.rankLabel,
      row.dataset.kindLabel,
      row.dataset.suggestionType === "spell" ? "" : row.dataset.sourceLabel
    ]
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
      clan: normalizeClanKey(this.#formValue("adversary.clan")),
      affiliation: normalizeAffiliationFormValue(
        this.#formValue("adversary.affiliation"),
        this.#formValue("adversary.affiliationCustom")
      ),
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
   * @returns {Promise<object>}
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
    const clan = normalizeClanKey(adversary.clan);
    const affiliation = normalizeAffiliationFormValue(adversary.affiliation, adversary.affiliationCustom);
    const suppressedAutoPassives = Array.from(
      this.document.system.details.adversary.suppressedAutoPassives ?? []
    );

    await this.document.update({
      "system.details.adversary.enabled": true,
      "system.details.adversary.level": level,
      "system.details.adversary.rank": rank,
      "system.details.adversary.class": cls,
      "system.details.adversary.role": role,
      "system.details.adversary.discipline": discipline,
      "system.details.adversary.clan": clan,
      "system.details.adversary.affiliation": affiliation,
      "system.details.adversary.specialRoles": specialRoles,
      "system.details.adversary.suppressedAutoPassives": suppressedAutoPassives,
      "system.details.adversary.fixedJutsuCost": Boolean(adversary.fixedJutsuCost),
      "system.details.adversary.migrated": (adversary.migrated === true) || (adversary.migrated === "true"),
      "system.details.summon.enabled": false,
      "system.resources.tenacity.max": Math.max(0, Number(resources.tenacity?.max) || 0),
      "system.resources.tenacity.spent": Math.max(0, Number(resources.tenacity?.spent) || 0),
      "system.resources.eliteact.max": Math.max(0, Number(resources.eliteact?.max) || 0),
      "system.resources.eliteact.spent": Math.max(0, Number(resources.eliteact?.spent) || 0)
    });

    return {
      enabled: true,
      level,
      rank,
      class: cls,
      role,
      discipline,
      clan,
      affiliation,
      specialRoles: new Set(specialRoles),
      suppressedAutoPassives: new Set(suppressedAutoPassives),
      fixedJutsuCost: Boolean(adversary.fixedJutsuCost),
      migrated: (adversary.migrated === true) || (adversary.migrated === "true")
    };
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
  source.level = getNpcBuilderLevel(actor, source.level);
  source.rank = normalizeChoice(source.rank, CONFIG.DND5E.adversaryRanks, "e");
  source.class = normalizeChoice(source.class, CONFIG.DND5E.adversaryClasses, "standard");
  source.role = normalizeChoice(source.role, CONFIG.DND5E.adversaryRoles, "striker");
  source.discipline = normalizeChoice(source.discipline, CONFIG.DND5E.adversaryDisciplines, "");
  source.clan = normalizeClanKey(source.clan);
  source.affiliation = normalizeAffiliationKey(source.affiliation);
  source.fixedJutsuCost ??= true;
  source.migrated ??= false;
  source.specialRoles = new Set(source.specialRoles ?? []);
  source.suppressedAutoPassives = new Set(source.suppressedAutoPassives ?? []);
  return source;
}

/* -------------------------------------------- */

/**
 * Resolve the builder level without letting the schema's default level hide existing NPC scaling.
 * @param {Actor5e} actor            Actor being configured.
 * @param {number|string} rawLevel   Stored adversary level.
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
 * @param {object} [suggestions]  Prepared suggestions.
 * @returns {string[]}
 */
function getAdversaryWarnings(actor, adversary, suggestions) {
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
  const passiveWarnings = new Set(
    (suggestions?.features ?? []).map(s => s.autoPassiveWarning).filter(Boolean)
  );
  warnings.push(...passiveWarnings);
  return warnings;
}

/* -------------------------------------------- */

/**
 * Set a preview tag that should hide when its row value is empty.
 * @param {HTMLElement} preview  Preview container.
 * @param {string} key           Preview tag suffix.
 * @param {string} value         Display value.
 */
function setOptionalPreviewTag(preview, key, value) {
  const tag = preview.querySelector(`[data-preview-${key}]`);
  if ( !tag ) return;
  const label = value ?? "";
  tag.hidden = !label;
  tag.replaceChildren(label);
}

/* -------------------------------------------- */

/**
 * Collect eligible adversary content from system packs.
 * @param {Actor5e} actor      Actor being configured.
 * @param {object} adversary   Adversary metadata.
 * @returns {Promise<object>}
 */
async function getAdversarySuggestions(actor, adversary) {
  const existing = getExistingSuggestionKeys(actor);
  const features = [];
  const jutsu = [];

  for ( const pack of getN5eItemPacks() ) {
    const index = await pack.getIndex({ fields: FEATURE_INDEX_FIELDS });
    for ( const entry of index ) {
      if ( entry.type !== "feat" ) continue;
      const featureType = foundry.utils.getProperty(entry, "system.type.value");
      if ( !ADVERSARY_FEATURE_TYPES.has(featureType) ) continue;
      features.push(formatSuggestion(entry, pack, featureType, existing, adversary));
    }
  }

  for ( const item of game.items ) {
    if ( item.type !== "feat" ) continue;
    const featureType = item.system.type?.value;
    if ( !ADVERSARY_FEATURE_TYPES.has(featureType) ) continue;
    features.push(formatSuggestion(item, null, featureType, existing, adversary));
  }

  for ( const pack of getJutsuItemPacks({ systemOnly: true }) ) {
    const index = await pack.getIndex({ fields: JUTSU_INDEX_FIELDS });
    for ( const entry of index ) {
      if ( entry.type !== "spell" ) continue;
      jutsu.push(formatJutsuLookupEntry(entry, pack, existing, { labelPrefix: "N5EB.Adversary.Builder" }));
    }
  }

  for ( const item of game.items ) {
    if ( item.type !== "spell" ) continue;
    jutsu.push(formatJutsuLookupEntry(item, null, existing, { labelPrefix: "N5EB.Adversary.Builder" }));
  }

  const sortedFeatures = features.toSorted((lhs, rhs) => sortFeatureSuggestion(lhs, rhs, adversary));
  return {
    features: sortedFeatures,
    featureGroups: getFeatureSuggestionGroups(sortedFeatures),
    jutsu: jutsu.toSorted(sortSuggestion)
  };
}

/* -------------------------------------------- */

/**
 * Split feature suggestions into recommended and remaining groups.
 * @param {object[]} features  Sorted feature suggestions.
 * @returns {object[]}
 */
function getFeatureSuggestionGroups(features) {
  const recommended = [];
  const other = [];
  for ( const feature of features ) (feature.recommended ? recommended : other).push(feature);
  return [
    {
      id: "recommended",
      label: "N5EB.Adversary.Builder.RecommendedFeatures",
      items: recommended
    },
    {
      id: "other",
      label: "N5EB.Adversary.Builder.OtherFeatures",
      items: other
    }
  ].filter(group => group.items.length);
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
 * Build duplicate detection keys for actor-owned suggestions.
 * @param {Actor5e} actor  Actor being configured.
 * @returns {object}
 */
function getExistingSuggestionKeys(actor) {
  const keys = {
    names: new Set(),
    identifiers: new Set(),
    sourceUuids: new Set(),
    addData(data, sourceUuid) {
      if ( sourceUuid ) this.sourceUuids.add(sourceUuid);
      const identifier = getEntryIdentifier(data);
      if ( identifier ) this.identifiers.add(identifier);
      this.names.add(normalizeNameKey(data.name));
    },
    hasSuggestion(item, sourceUuid) {
      if ( sourceUuid && this.sourceUuids.has(sourceUuid) ) return true;
      const compendiumSource = item?._stats?.compendiumSource;
      if ( compendiumSource && this.sourceUuids.has(compendiumSource) ) return true;
      const identifier = getEntryIdentifier(item);
      if ( identifier && this.identifiers.has(identifier) ) return true;
      return this.names.has(normalizeNameKey(item?.name));
    }
  };
  for ( const item of actor.items ) {
    keys.addData(item, item.getFlag("n5eb", "adversaryBuilder.sourceUuid") ?? item._stats?.compendiumSource);
  }
  return keys;
}

/* -------------------------------------------- */

/**
 * Score how strongly a feature entry matches the current adversary metadata.
 * @param {object} entry      Compendium index entry or Item document.
 * @param {object} adversary  Adversary metadata.
 * @returns {number}
 */
function getFeatureRelevance(entry, adversary) {
  if ( Number.isFinite(entry.relevance) ) return entry.relevance;
  const subtype = foundry.utils.getProperty(entry, "system.type.subtype") ?? entry.matchSubtype ?? entry.category ?? "";
  const sourcePath = entry.sourcePath ?? getSourcePath(entry);
  const sourceSegments = getSourceSegments(sourcePath);
  const rank = getEntryRank(entry);
  const type = foundry.utils.getProperty(entry, "system.type.value") ?? entry.type;
  const roleKeys = getRoleMatchKeys(adversary);
  let score = 0;

  if ( rank && (RANK_ORDER.indexOf(rank) <= RANK_ORDER.indexOf(adversary.rank)) ) score += 3;
  else if ( rank ) score -= 6;

  if ( subtype === "general" ) score += 8;
  if ( subtype === "classMod" ) score += 6;
  if ( subtype === "role" ) {
    if ( roleKeys.some(key => sourceSegments.has(key) || sourcePath.includes(key)) ) score += 14;
  }
  if ( subtype === "affiliation" ) {
    if ( adversary.affiliation
      && (sourceSegments.has(adversary.affiliation) || sourcePath.includes(adversary.affiliation)) ) {
      score += 12;
    }
  }
  if ( subtype === "clan" ) {
    if ( adversary.clan && (sourceSegments.has(adversary.clan) || sourcePath.includes(adversary.clan)) ) score += 12;
  }
  if ( type === "adversaryPassive" ) score += 2;
  return score;
}

/* -------------------------------------------- */

/**
 * Format a compendium index entry or world item for the template.
 * @param {object} entry                  Compendium index entry or Item document.
 * @param {CompendiumCollection|null} pack Source compendium, if any.
 * @param {string} type                   Suggestion type.
 * @param {object} existing               Embedded duplicate keys.
 * @param {object} adversary              Current adversary metadata.
 * @returns {object}
 */
function formatSuggestion(entry, pack, type, existing, adversary) {
  const uuid = entry.uuid ?? (pack ? `Compendium.${pack.collection}.Item.${entry._id}` : `Item.${entry.id}`);
  const rank = getEntryRank(entry);
  const labels = getSuggestionLabels(entry, type);
  const sourcePath = getSourcePath(entry);
  const source = getSuggestionSource(entry, pack);
  const sourceLabel = source.label;
  const sourceKey = source.key;
  const rankAbbreviation = rank ? CONFIG.DND5E.adversaryRanks[rank]?.abbreviation ?? rank.toUpperCase() : "";
  const rankLabel = rank ? `Rank-${rankAbbreviation}` : "";
  const description = foundry.utils.getProperty(entry, "system.description.value") ?? "";
  const displayName = entry.name;
  const identifier = getEntryIdentifier(entry);
  const match = getFeatureMatch(entry, labels, adversary);
  const img = entry.img || DEFAULT_ICON;
  const search = [
    entry.name, displayName, identifier, rankLabel, rankAbbreviation, labels.categoryLabel, labels.typeLabel,
    sourceLabel, sourcePath, labels.kind, labels.category, ...match.badges, ...match.keys
  ]
    .join(" ")
    .toLocaleLowerCase(game.i18n.lang);

  return {
    autoEligible: Boolean(match.auto?.eligible),
    autoKind: match.auto?.kind ?? "",
    autoKey: match.auto?.key ?? "",
    autoPassiveWarning: match.warning,
    badges: match.badges,
    category: labels.category,
    categoryLabel: labels.categoryLabel,
    description,
    disabled: existing.hasSuggestion(entry, uuid),
    img,
    identifier,
    activation: "",
    activationLabel: "",
    actionType: "",
    actionTypeLabel: "",
    displayActionTypeLabel: "",
    components: [],
    componentsKey: "",
    componentLabels: [],
    costKey: "",
    costLabel: "",
    costSort: 0,
    kind: labels.kind,
    kindLabel: labels.categoryLabel,
    keywords: [],
    keywordsKey: "",
    keywordLabels: [],
    pack: sourceLabel,
    packKey: sourceKey,
    rowBadges: match.badges,
    showRowSource: true,
    rank,
    rankLabel,
    recommended: match.recommended,
    relevance: match.relevance,
    requiredLevel: match.auto?.requiredLevel ?? "",
    search,
    sourcePath,
    sourceKey,
    sourceLabel,
    type,
    typeLabel: labels.typeLabel,
    uuid,
    name: displayName
  };
}

/* -------------------------------------------- */

/**
 * Get the display/filter source for an adversary builder suggestion.
 * @param {object} entry                       Compendium index entry or Item document.
 * @param {CompendiumCollection|null} pack     Source compendium, if any.
 * @returns {{label: string, key: string}}
 */
function getSuggestionSource(entry, pack) {
  const fallbackLabel = pack?.metadata.label ?? game.i18n.localize("N5EB.Adversary.Builder.WorldItems");
  const fallbackKey = pack?.collection.slugify({ strict: true }) ?? "world-items";
  return {
    label: fallbackLabel,
    key: fallbackKey
  };
}

/* -------------------------------------------- */

/**
 * Get suggestion labels and kind keys.
 * @param {object} entry     Compendium index entry or Item document.
 * @param {string} type      Suggestion type.
 * @returns {object}
 */
function getSuggestionLabels(entry, type) {
  const typeConfig = CONFIG.DND5E.featureTypes[type] ?? {};
  const subtype = foundry.utils.getProperty(entry, "system.type.subtype") ?? "";
  const subtypeConfig = typeConfig.subtypes?.[subtype];
  if ( type === "adversaryPassive" ) {
    return {
      category: "passive",
      categoryLabel: game.i18n.localize("N5EB.Adversary.Builder.CategoryPassive"),
      kind: type,
      typeLabel: typeConfig.label ?? game.i18n.localize(CONFIG.Item.typeLabels.feat)
    };
  }
  return {
    category: normalizeFeatureSubtype(subtype) || "uncategorized",
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
  const normalizedRank = normalizeRank(rank);
  if ( normalizedRank ) return normalizedRank;
  const nameRank = `${entry.name ?? ""}`.match(/\[?([edcbas])-rank\]?/i)?.[1]?.toLowerCase();
  if ( nameRank && RANK_ORDER.includes(nameRank) ) return nameRank;
  const path = getSourcePath(entry);
  return path.match(/(^|-)([edcbas])-rank($|-)/)?.[2] ?? null;
}

/* -------------------------------------------- */

/**
 * Rank matching for picker filters.
 * @param {string} rowRank      Suggestion rank.
 * @param {string} filterRank   Selected filter rank.
 * @param {string} panel        Content panel id.
 * @returns {boolean}
 */
function rankMatchesFilter(rowRank, filterRank, panel) {
  if ( !filterRank ) return true;
  if ( panel !== "features" ) return rowRank === filterRank;
  if ( !rowRank ) return true;
  return getRankSortValue(rowRank) <= getRankSortValue(filterRank);
}

/* -------------------------------------------- */

/**
 * Build display/matching metadata for a feature suggestion.
 * @param {object} entry      Compendium index entry or Item document.
 * @param {object} labels     Suggestion labels.
 * @param {object} adversary  Current adversary metadata.
 * @returns {object}
 */
function getFeatureMatch(entry, labels, adversary) {
  const subtype = normalizeFeatureSubtype(
    foundry.utils.getProperty(entry, "system.type.subtype") ?? labels.category
  );
  const sourcePath = getSourcePath(entry);
  const sourceSegments = getSourceSegments(sourcePath);
  const rank = getEntryRank(entry);
  const keys = [sourcePath, subtype].filter(Boolean);
  const badges = [];
  let relevance = getFeatureRelevance({ ...entry, matchSubtype: subtype, sourcePath }, adversary);

  const roleKeys = getRoleMatchKeys(adversary);
  if ( subtype === "role" ) {
    if ( roleKeys.some(key => sourceSegments.has(key) || sourcePath.includes(key)) ) {
      badges.push(game.i18n.localize("N5EB.Adversary.Builder.BadgeRole"));
      keys.push(...roleKeys);
    }
  }
  if ( subtype === "clan" ) {
    if ( adversary.clan && (sourceSegments.has(adversary.clan) || sourcePath.includes(adversary.clan)) ) {
      badges.push(game.i18n.localize("N5EB.Adversary.Builder.BadgeClan"));
      keys.push(adversary.clan);
    }
  }
  if ( subtype === "affiliation" ) {
    keys.push(...getAffiliationSearchAliases(sourcePath, sourceSegments));
    if ( adversary.affiliation && (sourceSegments.has(adversary.affiliation)
      || sourcePath.includes(adversary.affiliation)) ) {
      badges.push(game.i18n.localize("N5EB.Adversary.Builder.BadgeAffiliation"));
      keys.push(adversary.affiliation);
    }
  }
  if ( subtype === "general" && (!rank || (getRankSortValue(rank) <= getRankSortValue(adversary.rank))) ) {
    relevance += 1;
  }

  const auto = getPassiveAutoData(entry, subtype, adversary);
  const recommended = (relevance >= 8) || Boolean(auto?.eligible);
  if ( recommended ) badges.unshift(game.i18n.localize("N5EB.Adversary.Builder.BadgeRecommended"));
  if ( auto?.eligible ) badges.push(game.i18n.localize("N5EB.Adversary.Builder.BadgeAuto"));
  return {
    auto,
    badges: Array.from(new Set(badges)),
    keys: Array.from(new Set(keys.filter(Boolean))),
    recommended,
    relevance,
    warning: auto?.warning ?? ""
  };
}

/* -------------------------------------------- */

/**
 * Determine whether a passive should be auto-granted.
 * @param {object} entry      Compendium index entry or Item document.
 * @param {string} subtype    Normalized feature subtype.
 * @param {object} adversary  Current adversary metadata.
 * @returns {object|null}
 */
function getPassiveAutoData(entry, subtype, adversary) {
  const featureType = foundry.utils.getProperty(entry, "system.type.value");
  if ( featureType !== "adversaryPassive" ) return null;
  const sourcePath = getSourcePath(entry);
  const identifier = getEntryIdentifier(entry);
  const sourceSegments = getSourceSegments(sourcePath);
  const requiredLevel = getPassiveRequiredLevel(entry, subtype, sourcePath);
  let kind = "";
  let key = "";

  if ( subtype === "role" ) {
    key = getRoleMatchKeys(adversary).find(candidate => {
      return sourceSegments.has(candidate) || sourcePath.includes(candidate) || identifier.includes(candidate);
    }) ?? "";
    kind = key ? "role" : "";
  } else if ( subtype === "clan" ) {
    key = adversary.clan && (sourceSegments.has(adversary.clan) || sourcePath.includes(adversary.clan)
      || identifier.includes(adversary.clan)) ? adversary.clan : "";
    kind = key ? "clan" : "";
  }

  if ( !kind ) return null;
  if ( !Number.isFinite(requiredLevel) ) {
    return {
      eligible: false,
      kind,
      key,
      requiredLevel: "",
      warning: game.i18n.format("N5EB.Adversary.Builder.WarnPassiveMissingLevel", { name: entry.name })
    };
  }
  return {
    eligible: requiredLevel <= adversary.level,
    kind,
    key,
    requiredLevel,
    warning: ""
  };
}

/* -------------------------------------------- */

/**
 * Get a passive level gate, applying safe imported-data fallbacks.
 * @param {object} entry       Compendium index entry or Item document.
 * @param {string} subtype     Normalized feature subtype.
 * @param {string} sourcePath  Slugified source path.
 * @returns {number|null}
 */
function getPassiveRequiredLevel(entry, subtype, sourcePath) {
  const level = Number(foundry.utils.getProperty(entry, "system.prerequisites.level"));
  if ( Number.isFinite(level) && (level > 0) ) return level;
  if ( (subtype === "clan") && sourcePath.includes("clan") && sourcePath.endsWith("passive")) return 1;
  return null;
}

/* -------------------------------------------- */

/**
 * Add eligible role/clan passives to an adversary actor.
 * @param {Actor5e} actor     Actor being configured.
 * @param {object} adversary  Saved adversary metadata.
 * @returns {Promise<number>} Number of passives created.
 */
async function addAutomaticPassives(actor, adversary) {
  const suppressed = new Set(actor.system.details.adversary.suppressedAutoPassives ?? []);
  const { features } = await getAdversarySuggestions(actor, adversary);
  const existing = getExistingSuggestionKeys(actor);
  const toCreate = [];

  for ( const suggestion of features ) {
    if ( !suggestion.autoEligible || suggestion.disabled || suppressed.has(suggestion.uuid) ) continue;
    const item = await fromUuid(suggestion.uuid);
    if ( !item || existing.hasSuggestion(item, suggestion.uuid) ) continue;
    const data = item.pack ? game.items.fromCompendium(item, { keepId: false }) : item.toObject();
    delete data._id;
    foundry.utils.setProperty(data, "flags.n5eb.adversaryBuilder.autoPassive", true);
    foundry.utils.setProperty(data, "flags.n5eb.adversaryBuilder.sourceUuid", suggestion.uuid);
    foundry.utils.setProperty(data, "flags.n5eb.adversaryBuilder.autoKind", suggestion.autoKind);
    foundry.utils.setProperty(data, "flags.n5eb.adversaryBuilder.autoKey", suggestion.autoKey);
    foundry.utils.setProperty(data, "flags.n5eb.adversaryBuilder.requiredLevel", suggestion.requiredLevel);
    toCreate.push(data);
    existing.addData(data, suggestion.uuid);
  }

  if ( toCreate.length ) await actor.createEmbeddedDocuments("Item", toCreate);
  return toCreate.length;
}

/* -------------------------------------------- */

/**
 * Clear passive suppression when the user explicitly re-selects that passive.
 * @param {Actor5e} actor    Actor being configured.
 * @param {string[]} uuids   Manually selected UUIDs.
 * @returns {Promise<void>}
 */
async function clearSuppressedAutoPassives(actor, uuids) {
  if ( !uuids.length ) return;
  const suppressed = new Set(actor.system.details.adversary.suppressedAutoPassives ?? []);
  let changed = false;
  for ( const uuid of uuids ) changed = suppressed.delete(uuid) || changed;
  if ( changed ) {
    await actor.update({ "system.details.adversary.suppressedAutoPassives": Array.from(suppressed) });
  }
}

/* -------------------------------------------- */

/**
 * Remember a deleted auto-passive so builder saves do not re-add it.
 * @param {Item5e} item  Deleted embedded item.
 * @returns {Promise<void>}
 */
export async function recordDeletedAutoPassiveSuppression(item) {
  const actor = item.parent;
  if ( actor?.documentName !== "Actor" ) return;
  if ( actor.type !== "npc" ) return;
  if ( !item.getFlag("n5eb", "adversaryBuilder.autoPassive") ) return;
  const sourceUuid = item.getFlag("n5eb", "adversaryBuilder.sourceUuid");
  if ( !sourceUuid ) return;
  const adversary = actor.system.details.adversary;
  if ( !adversary?.enabled ) return;
  const suppressed = new Set(adversary.suppressedAutoPassives ?? []);
  if ( suppressed.has(sourceUuid) ) return;
  suppressed.add(sourceUuid);
  await actor.update({ "system.details.adversary.suppressedAutoPassives": Array.from(suppressed) });
}

/* -------------------------------------------- */

/**
 * Get role keys that should match passive/trait folders.
 * @param {object} adversary  Current adversary metadata.
 * @returns {string[]}
 */
function getRoleMatchKeys(adversary) {
  const keys = [];
  if ( adversary.role ) {
    if ( ["caster", "striker"].includes(adversary.role) ) {
      if ( !adversary.discipline ) return keys;
      keys.push(`${adversary.role}-${adversary.discipline}`);
      return keys;
    }
    keys.push(adversary.role);
  }
  return keys;
}

/* -------------------------------------------- */

/**
 * Split a slugified source path into matchable segments.
 * @param {string} sourcePath  Slugified source path.
 * @returns {Set<string>}
 */
function getSourceSegments(sourcePath) {
  return new Set(`${sourcePath ?? ""}`.split("-").filter(Boolean));
}

/* -------------------------------------------- */

/**
 * Normalize a feature subtype key.
 * @param {string} subtype  Raw subtype.
 * @returns {string}
 */
function normalizeFeatureSubtype(subtype) {
  return `${subtype ?? ""}`.slugify({ strict: true });
}

/* -------------------------------------------- */

/**
 * Normalize clan names and aliases to data keys.
 * @param {string} value  Raw clan input.
 * @returns {string}
 */
function normalizeClanKey(value) {
  return `${value ?? ""}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").slugify({ strict: true });
}

/* -------------------------------------------- */

/**
 * Get display data for the selected clan key.
 * @param {string} key  Normalized clan key.
 * @returns {Promise<object>}
 */
async function getClanDisplay(key) {
  if ( !key ) {
    return { key: "", label: game.i18n.localize("N5EB.Adversary.Builder.NoClan"), img: DEFAULT_ICON };
  }
  const clan = (await getClanChoices()).find(choice => choice.key === key);
  return {
    key,
    label: clan?.label ?? titleCaseKey(key),
    img: clan?.img ?? DEFAULT_ICON
  };
}

/* -------------------------------------------- */

/**
 * Collect clan choices from N5eB clan packs and world clans.
 * @returns {Promise<object[]>}
 */
async function getClanChoices() {
  if ( clanChoicesCache ) return clanChoicesCache;
  const choices = new Map();
  const addChoice = (entry, pack=null) => {
    if ( entry.type !== "race" ) return;
    const key = normalizeClanKey(
      foundry.utils.getProperty(entry, "system.identifier") ?? entry.system?.identifier ?? entry.name
    );
    if ( !key ) return;
    const uuid = entry.uuid ?? (pack ? `Compendium.${pack.collection}.Item.${entry._id}` : entry.uuid);
    choices.set(key, {
      key,
      uuid,
      label: entry.name ?? titleCaseKey(key),
      img: entry.img || DEFAULT_ICON
    });
  };

  for ( const packName of CLAN_PACKS ) {
    const pack = game.packs.get(`n5eb.${packName}`);
    if ( !pack ) continue;
    const index = await pack.getIndex({ fields: CLAN_INDEX_FIELDS });
    for ( const entry of index ) addChoice(entry, pack);
  }
  for ( const item of game.items ) addChoice(item);

  clanChoicesCache = Array.from(choices.values()).sort((lhs, rhs) => {
    return lhs.label.localeCompare(rhs.label, game.i18n.lang);
  });
  return clanChoicesCache;
}

/* -------------------------------------------- */

/**
 * Normalize affiliation names and aliases to imported folder keys.
 * @param {string} value  Raw affiliation input.
 * @returns {string}
 */
function normalizeAffiliationKey(value) {
  const key = `${value ?? ""}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").slugify({ strict: true });
  return AFFILIATION_ALIASES[key] ?? key;
}

/* -------------------------------------------- */

/**
 * Normalize an affiliation select + custom input pair.
 * @param {string} choice  Selected affiliation key.
 * @param {string} custom  Custom input text.
 * @returns {string}
 */
function normalizeAffiliationFormValue(choice, custom) {
  if ( choice === "custom" ) return normalizeAffiliationKey(custom);
  return normalizeAffiliationKey(choice);
}

/* -------------------------------------------- */

/**
 * Determine which affiliation option should be selected for a stored key.
 * @param {string} value  Stored affiliation key.
 * @returns {string}
 */
function getAffiliationChoice(value) {
  if ( !value ) return "";
  return AFFILIATION_OPTION_KEYS.has(value) ? value : "custom";
}

/* -------------------------------------------- */

/**
 * Get affiliation select options.
 * @returns {object[]}
 */
function getAffiliationOptions() {
  return AFFILIATION_OPTIONS.map(option => ({ ...option }));
}

/* -------------------------------------------- */

/**
 * Get search aliases for a row's affiliation folder.
 * @param {string} sourcePath         Slugified source path.
 * @param {Set<string>} sourceSegments Source path segments.
 * @returns {string[]}
 */
function getAffiliationSearchAliases(sourcePath, sourceSegments) {
  for ( const [key, aliases] of Object.entries(AFFILIATION_SEARCH_ALIASES) ) {
    if ( sourceSegments.has(key) || sourcePath.includes(key) ) return aliases;
  }
  return [];
}

/* -------------------------------------------- */

/**
 * Normalize rank-ish keys.
 * @param {string} value  Raw rank value.
 * @returns {string|null}
 */
function normalizeRank(value) {
  const rank = `${value ?? ""}`.toLowerCase();
  return RANK_ORDER.includes(rank) ? rank : RANK_ALIASES[rank] ?? null;
}

/* -------------------------------------------- */

/**
 * Get a stable identifier key for duplicate/search matching.
 * @param {object} entry  Entry or item.
 * @returns {string}
 */
function getEntryIdentifier(entry) {
  return `${foundry.utils.getProperty(entry, "system.identifier") ?? entry.system?.identifier ?? ""}`
    .slugify({ strict: true });
}

/* -------------------------------------------- */

/**
 * Normalize names for duplicate detection.
 * @param {string} name  Raw name.
 * @returns {string}
 */
function normalizeNameKey(name) {
  return stripRankFromFeatureName(name).slugify({ strict: true });
}

/* -------------------------------------------- */

/**
 * Turn a slug-like key into a readable fallback label.
 * @param {string} key  Slug-like key.
 * @returns {string}
 */
function titleCaseKey(key) {
  return `${key ?? ""}`.split("-").filter(Boolean).map(word => {
    return word.charAt(0).toLocaleUpperCase(game.i18n.lang) + word.slice(1);
  }).join(" ");
}

/* -------------------------------------------- */

/**
 * Remove imported rank suffixes from feature display names.
 * @param {string} name  Raw feature name.
 * @returns {string}
 */
function stripRankFromFeatureName(name) {
  return `${name ?? ""}`.replace(/\s*\[[EDCBAS]-Rank\]\s*$/i, "").trim();
}

/* -------------------------------------------- */

/**
 * Prepare rank filter choices.
 * @param {string} [selected]  Selected rank.
 * @returns {object[]}
 */
function getRankFilterOptions(selected = "") {
  return [
    { value: "", label: game.i18n.localize("N5EB.Adversary.Builder.AllRanks"), selected: selected === "" },
    ...Object.entries(CONFIG.DND5E.adversaryRanks).map(([value, { label }]) => {
      return { value, label, selected: value === selected };
    })
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
 * @param {object[]} suggestions  Suggestions to derive extra choices from.
 * @returns {object[]}
 */
function getJutsuKindOptions(suggestions = []) {
  const choices = new Map(Object.entries(CONFIG.DND5E.jutsuTypes).map(([value, { label }]) => [value, label]));
  for ( const suggestion of suggestions ) {
    if ( !suggestion.kind ) continue;
    choices.set(suggestion.kind, suggestion.kindLabel || titleCaseKey(suggestion.kind));
  }
  return [
    { value: "", label: game.i18n.localize("N5EB.Adversary.Builder.AllTypes") },
    ...Array.from(choices, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

/* -------------------------------------------- */

/**
 * Prepare a simple single-value filter from suggestion metadata.
 * @param {object[]} suggestions  Suggestions to derive choices from.
 * @param {string} valueField     Suggestion field containing the option value.
 * @param {string} labelField     Suggestion field containing the option label.
 * @param {string} allLabel       Localization key for the all option.
 * @returns {object[]}
 */
function getSingleValueFilterOptions(suggestions, valueField, labelField, allLabel) {
  const choices = new Map();
  for ( const suggestion of suggestions ) {
    const value = suggestion[valueField];
    if ( !value ) continue;
    choices.set(value, suggestion[labelField] || titleCaseKey(value));
  }
  return [
    { value: "", label: game.i18n.localize(allLabel) },
    ...Array.from(choices, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

/* -------------------------------------------- */

/**
 * Prepare a multi-value filter from suggestion metadata.
 * @param {object[]} suggestions  Suggestions to derive choices from.
 * @param {string} valuesField    Suggestion field containing option values.
 * @param {string} labelsField    Suggestion field containing option labels.
 * @param {string} allLabel       Localization key for the all option.
 * @returns {object[]}
 */
function getMultiValueFilterOptions(suggestions, valuesField, labelsField, allLabel) {
  const choices = new Map();
  for ( const suggestion of suggestions ) {
    const values = suggestion[valuesField] ?? [];
    const labels = suggestion[labelsField] ?? [];
    for ( const [index, value] of values.entries() ) {
      if ( !value ) continue;
      choices.set(value, labels[index] || titleCaseKey(value));
    }
  }
  return [
    { value: "", label: game.i18n.localize(allLabel) },
    ...Array.from(choices, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

/* -------------------------------------------- */

/**
 * Prepare jutsu chakra cost filter choices.
 * @param {object[]} suggestions  Suggestions to derive choices from.
 * @returns {object[]}
 */
function getJutsuCostOptions(suggestions) {
  const choices = new Map();
  for ( const suggestion of suggestions ) {
    if ( !suggestion.costKey ) continue;
    choices.set(suggestion.costKey, {
      value: suggestion.costKey,
      label: suggestion.costLabel || titleCaseKey(suggestion.costKey),
      sort: suggestion.costSort ?? Number.POSITIVE_INFINITY
    });
  }
  return [
    { value: "", label: game.i18n.localize("N5EB.Adversary.Builder.AllCosts") },
    ...Array.from(choices.values()).sort((a, b) => {
      const sort = a.sort - b.sort;
      return sort || a.label.localeCompare(b.label, game.i18n.lang);
    }).map(({ value, label }) => ({ value, label }))
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
