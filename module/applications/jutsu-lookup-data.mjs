const RANK_ORDER = ["e", "d", "c", "b", "a", "s"];
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
const DEFAULT_ICON = "icons/svg/mystery-man.svg";
const jutsuLookupCaches = new Map();
let jutsuLookupCacheHooksRegistered = false;

export const JUTSU_INDEX_FIELDS = [
  "img", "type", "system.description.value", "system.rank", "system.level", "system.identifier",
  "system.jutsu.type", "system.jutsu.components", "system.jutsu.keywords", "system.activation.type",
  "system.actionType", "system.chakra.cost", "system.chakra.special", "system.source.book",
  "system.source.custom", "system.source.rules", "flags.core.sourceId", "flags.n5eb.legacyImport.sourcePack",
  "flags.n5eb.legacyImport.sourcePath", "_stats.legacyImport.sourcePath", "_stats.compendiumSource"
];

/* -------------------------------------------- */

/**
 * Collect Item compendium packs that can contain jutsu.
 * @param {object} [options]
 * @param {boolean} [options.systemOnly=false]  Only include N5eB system packs.
 * @returns {CompendiumCollection[]}
 */
export function getJutsuItemPacks({ systemOnly=false }={}) {
  const packs = [];
  for ( const pack of game.packs ) {
    const metadata = pack.metadata ?? {};
    if ( (pack.documentName !== "Item") && (metadata.type !== "Item") ) continue;
    if ( pack.visible === false ) continue;
    if ( systemOnly && !isN5eBPack(pack) ) continue;
    packs.push(pack);
  }
  return packs;
}

/* -------------------------------------------- */

/**
 * Get cached base jutsu lookup entries, without actor-specific ownership state.
 * @param {object} [options]
 * @param {boolean} [options.systemOnly=false]  Only scan N5eB system packs.
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @param {boolean} [options.refresh=false]     Force rebuilding the cached index.
 * @returns {Promise<object[]>}
 */
export async function getCachedJutsuLookupEntries({
  systemOnly=false, labelPrefix="N5EB.JutsuLookup", refresh=false
}={}) {
  registerJutsuLookupCacheHooks();
  const cacheKey = `${systemOnly ? "system" : "all"}:${labelPrefix}`;
  if ( refresh ) invalidateJutsuLookupCache(cacheKey);
  let cache = jutsuLookupCaches.get(cacheKey);
  if ( cache?.entries ) return cache.entries;
  if ( cache?.promise ) return cache.promise;

  cache = {
    entries: null,
    promise: collectBaseJutsuLookupEntries({ systemOnly, labelPrefix })
      .then(entries => {
        cache.entries = entries;
        cache.promise = null;
        return entries;
      })
      .catch(err => {
        jutsuLookupCaches.delete(cacheKey);
        throw err;
      })
  };
  jutsuLookupCaches.set(cacheKey, cache);
  return cache.promise;
}

/* -------------------------------------------- */

/**
 * Clear cached jutsu lookup data.
 * @param {string} [cacheKey]  Specific cache key to clear.
 */
export function invalidateJutsuLookupCache(cacheKey) {
  if ( cacheKey ) jutsuLookupCaches.delete(cacheKey);
  else jutsuLookupCaches.clear();
}

/* -------------------------------------------- */

/**
 * Register cache invalidation hooks for source jutsu changes.
 */
export function registerJutsuLookupCacheHooks() {
  if ( jutsuLookupCacheHooksRegistered ) return;
  jutsuLookupCacheHooksRegistered = true;
  const invalidate = item => {
    if ( item?.parent?.documentName === "Actor" ) return;
    if ( item?.type !== "spell" ) return;
    invalidateJutsuLookupCache();
  };
  Hooks.on("createItem", invalidate);
  Hooks.on("updateItem", invalidate);
  Hooks.on("deleteItem", invalidate);
}

/* -------------------------------------------- */

/**
 * Collect jutsu from Item compendiums and world Items.
 * @param {object} [options]
 * @param {Actor5e|null} [options.actor=null]         Actor used for known-jutsu detection.
 * @param {boolean} [options.systemOnly=false]        Only scan N5eB system packs.
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @returns {Promise<object[]>}
 */
export async function collectJutsuLookupEntries({ actor=null, systemOnly=false, labelPrefix="N5EB.JutsuLookup" }={}) {
  const entries = await getCachedJutsuLookupEntries({ systemOnly, labelPrefix });
  return applyJutsuLookupOwnership(entries, actor);
}

/* -------------------------------------------- */

/**
 * Collect base jutsu entries from Item compendiums and world Items.
 * @param {object} [options]
 * @param {boolean} [options.systemOnly=false]  Only scan N5eB system packs.
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @returns {Promise<object[]>}
 */
async function collectBaseJutsuLookupEntries({ systemOnly=false, labelPrefix="N5EB.JutsuLookup" }={}) {
  const jutsu = [];

  for ( const pack of getJutsuItemPacks({ systemOnly }) ) {
    const index = await pack.getIndex({ fields: JUTSU_INDEX_FIELDS });
    for ( const entry of index ) {
      if ( entry.type !== "spell" ) continue;
      jutsu.push(formatJutsuLookupEntry(entry, pack, null, { labelPrefix }));
    }
  }

  for ( const item of game.items ) {
    if ( item.type !== "spell" ) continue;
    jutsu.push(formatJutsuLookupEntry(item, null, null, { labelPrefix }));
  }

  return jutsu.toSorted(sortJutsuSuggestion);
}

/* -------------------------------------------- */

/**
 * Apply actor-specific known-state to base jutsu lookup entries.
 * @param {object[]} entries     Base lookup entries.
 * @param {Actor5e|null} actor   Actor used for known-jutsu detection.
 * @returns {object[]}
 */
export function applyJutsuLookupOwnership(entries, actor=null) {
  const existing = createJutsuSuggestionKeys(actor);
  return entries.map(entry => {
    const known = existing.hasSuggestion(entry, entry.uuid);
    return {
      ...entry,
      disabled: known,
      known
    };
  });
}

/* -------------------------------------------- */

/**
 * Build duplicate detection keys for actor-owned jutsu.
 * @param {Actor5e|null} actor  Actor used for known-jutsu detection.
 * @returns {object}
 */
export function createJutsuSuggestionKeys(actor) {
  const keys = {
    names: new Set(),
    identifiers: new Set(),
    sourceUuids: new Set(),
    addData(data, sourceUuid) {
      if ( sourceUuid ) this.sourceUuids.add(sourceUuid);
      const coreSource = foundry.utils.getProperty(data, "flags.core.sourceId");
      if ( coreSource ) this.sourceUuids.add(coreSource);
      const compendiumSource = data?._stats?.compendiumSource;
      if ( compendiumSource ) this.sourceUuids.add(compendiumSource);
      const identifier = getEntryIdentifier(data);
      if ( identifier ) this.identifiers.add(identifier);
      this.names.add(normalizeNameKey(data.name));
    },
    hasSuggestion(item, sourceUuid) {
      if ( sourceUuid && this.sourceUuids.has(sourceUuid) ) return true;
      const coreSource = foundry.utils.getProperty(item, "flags.core.sourceId");
      if ( coreSource && this.sourceUuids.has(coreSource) ) return true;
      const compendiumSource = item?._stats?.compendiumSource;
      if ( compendiumSource && this.sourceUuids.has(compendiumSource) ) return true;
      const identifier = getEntryIdentifier(item);
      if ( identifier && this.identifiers.has(identifier) ) return true;
      return this.names.has(normalizeNameKey(item?.name));
    }
  };

  for ( const item of actor?.items ?? [] ) {
    if ( item.type !== "spell" ) continue;
    keys.addData(item, item.getFlag("n5eb", "adversaryBuilder.sourceUuid") ?? item._stats?.compendiumSource);
  }
  return keys;
}

/* -------------------------------------------- */

/**
 * Format a compendium index entry or world Item for jutsu lookup UIs.
 * @param {object} entry                       Compendium index entry or Item document.
 * @param {CompendiumCollection|null} pack     Source compendium, if any.
 * @param {object|null} existing               Duplicate detection keys.
 * @param {object} [options]
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @returns {object}
 */
export function formatJutsuLookupEntry(entry, pack, existing=null, { labelPrefix="N5EB.JutsuLookup" }={}) {
  const uuid = entry.uuid ?? (pack ? `Compendium.${pack.collection}.Item.${entry._id}` : `Item.${entry.id}`);
  const rank = getEntryRank(entry);
  const rankLabel = getRankAbbreviation(rank);
  const description = foundry.utils.getProperty(entry, "system.description.value") ?? "";
  const displayName = entry.name;
  const identifier = getEntryIdentifier(entry);
  const sourcePath = getSourcePath(entry);
  const source = getJutsuSuggestionSource(entry, pack, { labelPrefix });
  const labels = getJutsuLabels(entry);
  const jutsu = getJutsuLookupData(entry, { labelPrefix });
  const known = existing?.hasSuggestion?.(entry, uuid) ?? false;
  const displayActionTypeLabel = jutsu.actionType === "other" ? "" : jutsu.actionTypeLabel ?? "";
  const componentsLabel = (jutsu.componentLabels ?? []).join(", ");
  const keywordsLabel = (jutsu.keywordLabels ?? []).join(", ");
  const detailLabel = [jutsu.activationLabel, displayActionTypeLabel, componentsLabel, keywordsLabel]
    .filter(Boolean).join(" • ");
  const search = [
    entry.name, displayName, identifier, rankLabel, labels.categoryLabel, labels.typeLabel,
    source.label, sourcePath, labels.kind, labels.category, jutsu.activationLabel, jutsu.actionTypeLabel,
    jutsu.costLabel, ...(jutsu.componentLabels ?? []), ...(jutsu.keywordLabels ?? []), htmlToText(description)
  ]
    .join(" ")
    .toLocaleLowerCase(game.i18n.lang);

  return {
    activation: jutsu.activation ?? "",
    activationLabel: jutsu.activationLabel ?? "",
    actionType: jutsu.actionType ?? "",
    actionTypeLabel: jutsu.actionTypeLabel ?? "",
    autoEligible: false,
    autoKind: "",
    autoKey: "",
    autoPassiveWarning: "",
    badges: [],
    category: labels.category,
    categoryLabel: labels.categoryLabel,
    componentLabels: jutsu.componentLabels ?? [],
    componentsLabel,
    components: jutsu.components ?? [],
    componentsKey: jutsu.componentsKey ?? "",
    costKey: jutsu.costKey ?? "",
    costLabel: jutsu.costLabel ?? "",
    costSort: jutsu.costSort ?? 0,
    description,
    disabled: known,
    detailLabel,
    displayActionTypeLabel,
    img: entry.img || DEFAULT_ICON,
    identifier,
    kind: labels.kind,
    kindLabel: labels.categoryLabel,
    keywordLabels: jutsu.keywordLabels ?? [],
    keywordsLabel,
    keywords: jutsu.keywords ?? [],
    keywordsKey: jutsu.keywordsKey ?? "",
    known,
    name: displayName,
    pack: source.label,
    packKey: source.key,
    rank,
    rankLabel,
    recommended: false,
    relevance: 0,
    requiredLevel: "",
    rowBadges: [],
    search,
    showRowSource: false,
    sourceKey: source.key,
    sourceLabel: source.label,
    sourcePath,
    type: "spell",
    typeLabel: labels.typeLabel,
    uuid
  };
}

/* -------------------------------------------- */

/**
 * Sort suggestions by rank, source, then name.
 * @param {object} lhs  Left suggestion.
 * @param {object} rhs  Right suggestion.
 * @returns {number}
 */
export function sortJutsuSuggestion(lhs, rhs) {
  const rankSort = getRankSortValue(lhs.rank) - getRankSortValue(rhs.rank);
  if ( rankSort ) return rankSort;
  const sourceSort = lhs.sourceLabel.localeCompare(rhs.sourceLabel, game.i18n.lang);
  if ( sourceSort ) return sourceSort;
  return lhs.name.localeCompare(rhs.name, game.i18n.lang);
}

/* -------------------------------------------- */

/**
 * Rank matching for lookup filters.
 * @param {string} rowRank     Suggestion rank.
 * @param {string} filterRank  Selected filter rank.
 * @returns {boolean}
 */
export function jutsuRankMatchesFilter(rowRank, filterRank) {
  if ( !filterRank ) return true;
  return rowRank === filterRank;
}

/* -------------------------------------------- */

/**
 * Prepare rank filter choices.
 * @param {string} [selected]  Selected rank.
 * @param {object} [options]
 * @param {string} [options.allLabel="N5EB.JutsuLookup.Filters.AllRanks"]  Localization key for all option.
 * @returns {object[]}
 */
export function getJutsuRankFilterOptions(selected="", { allLabel="N5EB.JutsuLookup.Filters.AllRanks" }={}) {
  const ranks = CONFIG.DND5E.jutsuRanks ?? CONFIG.DND5E.adversaryRanks ?? {};
  return [
    { value: "", label: game.i18n.localize(allLabel), selected: selected === "" },
    ...RANK_ORDER.filter(rank => rank in ranks).map(value => {
      return { value, label: ranks[value].label, selected: value === selected };
    })
  ];
}

/* -------------------------------------------- */

/**
 * Prepare jutsu kind filter choices.
 * @param {object[]} [suggestions=[]]  Suggestions to derive extra choices from.
 * @param {object} [options]
 * @param {string} [options.allLabel="N5EB.JutsuLookup.Filters.AllTypes"]  Localization key for all option.
 * @returns {object[]}
 */
export function getJutsuKindOptions(suggestions=[], { allLabel="N5EB.JutsuLookup.Filters.AllTypes" }={}) {
  const choices = new Map(Object.entries(CONFIG.DND5E.jutsuTypes).map(([value, { label }]) => [value, label]));
  for ( const suggestion of suggestions ) {
    if ( !suggestion.kind ) continue;
    choices.set(suggestion.kind, suggestion.kindLabel || titleCaseKey(suggestion.kind));
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
 * Prepare a simple single-value filter from suggestion metadata.
 * @param {object[]} suggestions  Suggestions to derive choices from.
 * @param {string} valueField     Suggestion field containing the option value.
 * @param {string} labelField     Suggestion field containing the option label.
 * @param {string} allLabel       Localization key for the all option.
 * @returns {object[]}
 */
export function getSingleValueFilterOptions(suggestions, valueField, labelField, allLabel) {
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
export function getMultiValueFilterOptions(suggestions, valuesField, labelsField, allLabel) {
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
 * @param {object} [options]
 * @param {string} [options.allLabel="N5EB.JutsuLookup.Filters.AllCosts"]  Localization key for all option.
 * @returns {object[]}
 */
export function getJutsuCostOptions(suggestions, { allLabel="N5EB.JutsuLookup.Filters.AllCosts" }={}) {
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
    { value: "", label: game.i18n.localize(allLabel) },
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
 * @param {object} [options]
 * @param {string} [options.allLabel="N5EB.JutsuLookup.Filters.AllSources"]  Localization key for all option.
 * @returns {object[]}
 */
export function getPackFilterOptions(suggestions, { allLabel="N5EB.JutsuLookup.Filters.AllSources" }={}) {
  const packs = new Map(suggestions.map(s => [s.sourceKey, s.sourceLabel]));
  return [
    { value: "", label: game.i18n.localize(allLabel) },
    ...Array.from(packs, ([value, label]) => ({ value, label })).sort((a, b) => {
      return a.label.localeCompare(b.label, game.i18n.lang);
    })
  ];
}

/* -------------------------------------------- */

/**
 * Get a sortable rank value.
 * @param {string|null} rank  Rank key.
 * @returns {number}
 */
export function getRankSortValue(rank) {
  const index = RANK_ORDER.indexOf(rank);
  return index === -1 ? RANK_ORDER.length : index;
}

/* -------------------------------------------- */

/**
 * Retrieve a slugified legacy source path from an index entry.
 * @param {object} entry  Compendium index entry.
 * @returns {string}
 */
export function getSourcePath(entry) {
  return `${foundry.utils.getProperty(entry, "flags.n5eb.legacyImport.sourcePath")
    ?? foundry.utils.getProperty(entry, "_stats.legacyImport.sourcePath") ?? ""}`.slugify({ strict: true });
}

/* -------------------------------------------- */

/**
 * Infer a jutsu rank from an index entry.
 * @param {object} entry  Compendium index entry.
 * @returns {string|null}
 */
export function getEntryRank(entry) {
  const rank = foundry.utils.getProperty(entry, "system.rank") ?? entry.rank;
  const normalizedRank = normalizeRank(rank);
  if ( normalizedRank ) return normalizedRank;
  const level = foundry.utils.getProperty(entry, "system.level");
  const levelRank = CONFIG.DND5E.jutsuRankBySpellLevel?.[level];
  if ( levelRank ) return levelRank;
  const nameRank = `${entry.name ?? ""}`.match(/\[?([edcbas])-rank\]?/i)?.[1]?.toLowerCase();
  if ( nameRank && RANK_ORDER.includes(nameRank) ) return nameRank;
  const path = getSourcePath(entry);
  return path.match(/(^|-)([edcbas])-rank($|-)/)?.[2] ?? null;
}

/* -------------------------------------------- */

/**
 * Split a slugified source path into matchable segments.
 * @param {string} sourcePath  Slugified source path.
 * @returns {Set<string>}
 */
export function getSourceSegments(sourcePath) {
  return new Set(`${sourcePath ?? ""}`.split("-").filter(Boolean));
}

/* -------------------------------------------- */

/**
 * Get a stable identifier key for duplicate/search matching.
 * @param {object} entry  Entry or item.
 * @returns {string}
 */
export function getEntryIdentifier(entry) {
  return `${foundry.utils.getProperty(entry, "system.identifier") ?? entry.system?.identifier ?? entry.identifier ?? ""}`
    .slugify({ strict: true });
}

/* -------------------------------------------- */

/**
 * Turn a slug-like key into a readable fallback label.
 * @param {string} key  Slug-like key.
 * @returns {string}
 */
export function titleCaseKey(key) {
  return `${key ?? ""}`.split("-").filter(Boolean).map(word => {
    return word.charAt(0).toLocaleUpperCase(game.i18n.lang) + word.slice(1);
  }).join(" ");
}

/* -------------------------------------------- */

/**
 * Get lookup metadata for a jutsu entry.
 * @param {object} entry  Compendium index entry or Item document.
 * @param {object} [options]
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @returns {object}
 */
function getJutsuLookupData(entry, { labelPrefix="N5EB.JutsuLookup" }={}) {
  const activation = getLookupValue(foundry.utils.getProperty(entry, "system.activation.type"));
  const actionType = getLookupValue(foundry.utils.getProperty(entry, "system.actionType"));
  const components = getLookupArray(entry, "system.jutsu.components");
  const keywords = getLookupArray(entry, "system.jutsu.keywords");
  const cost = getJutsuCostData(entry, { labelPrefix });

  return {
    activation,
    activationLabel: activation ? getActivationLabel(activation) : "",
    actionType,
    actionTypeLabel: actionType ? getActionTypeLabel(actionType) : "",
    components,
    componentsKey: components.join(" "),
    componentLabels: components.map(getJutsuComponentLabel),
    costKey: cost.key,
    costLabel: cost.label,
    costSort: cost.sort,
    keywords,
    keywordsKey: keywords.join(" "),
    keywordLabels: keywords.map(getJutsuKeywordLabel)
  };
}

/* -------------------------------------------- */

/**
 * Get the display/filter source for a jutsu suggestion.
 * @param {object} entry                    Compendium index entry or Item document.
 * @param {CompendiumCollection|null} pack  Source compendium, if any.
 * @param {object} [options]
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @returns {{label: string, key: string}}
 */
function getJutsuSuggestionSource(entry, pack, { labelPrefix="N5EB.JutsuLookup" }={}) {
  const fallbackLabel = pack?.metadata.label ?? game.i18n.localize(`${labelPrefix}.WorldItems`);
  const fallbackKey = pack?.collection.slugify({ strict: true }) ?? "world-items";
  const label = getJutsuSourceLabel(entry, pack, { labelPrefix }) || fallbackLabel;
  return {
    label,
    key: label.slugify({ strict: true }) || fallbackKey
  };
}

/* -------------------------------------------- */

/**
 * Prefer book/source labels for jutsu lookup rows over raw pack names.
 * @param {object} entry                    Compendium index entry or Item document.
 * @param {CompendiumCollection|null} pack  Source compendium, if any.
 * @param {object} [options]
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @returns {string}
 */
function getJutsuSourceLabel(entry, pack, { labelPrefix="N5EB.JutsuLookup" }={}) {
  const custom = getSourceString(foundry.utils.getProperty(entry, "system.source.custom"));
  if ( custom ) return getKnownJutsuSourceLabel(custom, { labelPrefix }) || custom;

  const book = getSourceString(foundry.utils.getProperty(entry, "system.source.book"));
  if ( book ) return getKnownJutsuSourceLabel(book, { labelPrefix }) || book;

  const packBook = getSourceString(pack?.metadata?.flags?.n5eb?.sourceBook);
  if ( packBook ) return getKnownJutsuSourceLabel(packBook, { labelPrefix }) || packBook;

  const legacyPack = getSourceString(foundry.utils.getProperty(entry, "flags.n5eb.legacyImport.sourcePack"));
  const legacyLabel = getKnownJutsuSourceLabel(legacyPack, { labelPrefix });
  if ( legacyLabel ) return legacyLabel;

  return getKnownJutsuSourceLabel(`${pack?.collection ?? ""} ${pack?.metadata?.label ?? ""}`, { labelPrefix });
}

/* -------------------------------------------- */

/**
 * Normalize source labels for known N5eB books/pack groups.
 * @param {string} source  Raw source text.
 * @param {object} [options]
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @returns {string}
 */
function getKnownJutsuSourceLabel(source, { labelPrefix="N5EB.JutsuLookup" }={}) {
  const key = getSourceString(source).slugify({ strict: true });
  if ( !key ) return "";
  if ( key.includes("jiraiya") || key.includes("jiraya") || key.includes("jutsu-compendium") ) {
    return game.i18n.localize(`${labelPrefix}.SourceJiraiya`);
  }
  if ( key.includes("team-7") || key.startsWith("t7") ) {
    return game.i18n.localize(`${labelPrefix}.SourceTeam7`);
  }
  if ( key.includes("homebrew") || key.startsWith("hb") ) {
    return game.i18n.localize(`${labelPrefix}.SourceHomebrew`);
  }
  if ( key.includes("naruto-5e") || key === "n5e" || key.includes("n5eb-full-document") ) {
    return game.i18n.localize(`${labelPrefix}.SourceN5e`);
  }
  if ( key === "jutsus" || key === "n5eb-jutsus" ) {
    return game.i18n.localize(`${labelPrefix}.SourceJiraiya`);
  }
  return "";
}

/* -------------------------------------------- */

/**
 * Get labels and kind keys for a jutsu.
 * @param {object} entry  Compendium index entry or Item document.
 * @returns {object}
 */
function getJutsuLabels(entry) {
  const kind = foundry.utils.getProperty(entry, "system.jutsu.type") ?? "";
  return {
    category: kind,
    categoryLabel: CONFIG.DND5E.jutsuTypes[kind]?.label ?? (kind
      ? titleCaseKey(kind) : game.i18n.localize("N5EB.JUTSU.Unclassified")),
    kind,
    typeLabel: game.i18n.localize("TYPES.Item.spell")
  };
}

/* -------------------------------------------- */

/**
 * Get jutsu chakra cost lookup metadata.
 * @param {object} entry  Compendium index entry or Item document.
 * @param {object} [options]
 * @param {string} [options.labelPrefix="N5EB.JutsuLookup"]  Localization prefix for generated labels.
 * @returns {{ key: string, label: string, sort: number }}
 */
function getJutsuCostData(entry, { labelPrefix="N5EB.JutsuLookup" }={}) {
  const value = getLookupValue(foundry.utils.getProperty(entry, "system.chakra.cost"));
  if ( !value ) {
    return {
      key: "none",
      label: game.i18n.localize(`${labelPrefix}.NoCost`),
      sort: -1
    };
  }

  const numeric = Number(value);
  if ( Number.isFinite(numeric) ) {
    return {
      key: `${numeric}`,
      label: game.i18n.format(`${labelPrefix}.ChakraCostValue`, { cost: numeric }),
      sort: numeric
    };
  }

  return {
    key: `special-${value.slugify({ strict: true })}`,
    label: value,
    sort: Number.POSITIVE_INFINITY
  };
}

/* -------------------------------------------- */

/**
 * Get a normalized lookup value.
 * @param {*} value  Raw value.
 * @returns {string}
 */
function getLookupValue(value) {
  return `${value ?? ""}`.trim();
}

/* -------------------------------------------- */

/**
 * Get a normalized array of lookup values.
 * @param {object} entry  Entry to read from.
 * @param {string} path   Data path.
 * @returns {string[]}
 */
function getLookupArray(entry, path) {
  const value = foundry.utils.getProperty(entry, path);
  const array = value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(array.map(getLookupValue).filter(Boolean)));
}

/* -------------------------------------------- */

/**
 * Get an activation label.
 * @param {string} value  Activation key.
 * @returns {string}
 */
function getActivationLabel(value) {
  const label = CONFIG.DND5E.activityActivationTypes[value]?.label;
  return label ? game.i18n.localize(label) : titleCaseKey(value);
}

/* -------------------------------------------- */

/**
 * Get an item action type label.
 * @param {string} value  Action type key.
 * @returns {string}
 */
function getActionTypeLabel(value) {
  const label = CONFIG.DND5E.itemActionTypes[value];
  return label ? game.i18n.localize(label) : titleCaseKey(value);
}

/* -------------------------------------------- */

/**
 * Get a jutsu component label.
 * @param {string} value  Component key.
 * @returns {string}
 */
function getJutsuComponentLabel(value) {
  const label = CONFIG.DND5E.jutsuComponents[value]?.label;
  return label ? game.i18n.localize(label) : titleCaseKey(value);
}

/* -------------------------------------------- */

/**
 * Get a jutsu keyword label.
 * @param {string} value  Keyword key.
 * @returns {string}
 */
function getJutsuKeywordLabel(value) {
  const label = CONFIG.DND5E.jutsuKeywords[value]?.label;
  return label ? game.i18n.localize(label) : titleCaseKey(value);
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
 * Normalize names for duplicate detection.
 * @param {string} name  Raw name.
 * @returns {string}
 */
function normalizeNameKey(name) {
  return stripRankFromName(name).slugify({ strict: true });
}

/* -------------------------------------------- */

/**
 * Remove imported rank suffixes from display names.
 * @param {string} name  Raw name.
 * @returns {string}
 */
function stripRankFromName(name) {
  return `${name ?? ""}`.replace(/\s*\[[EDCBAS]-Rank\]\s*$/i, "").trim();
}

/* -------------------------------------------- */

/**
 * Get a short rank label.
 * @param {string|null} rank  Rank key.
 * @returns {string}
 */
function getRankAbbreviation(rank) {
  if ( !rank ) return "";
  return CONFIG.DND5E.jutsuRanks?.[rank]?.abbreviation
    ?? CONFIG.DND5E.adversaryRanks?.[rank]?.abbreviation
    ?? rank.toUpperCase();
}

/* -------------------------------------------- */

/**
 * Normalize a source value for display.
 * @param {unknown} source  Raw source value.
 * @returns {string}
 */
function getSourceString(source) {
  return `${source ?? ""}`.trim();
}

/* -------------------------------------------- */

/**
 * Check whether a compendium pack belongs to this system.
 * @param {CompendiumCollection} pack  Pack to test.
 * @returns {boolean}
 */
function isN5eBPack(pack) {
  const metadata = pack.metadata ?? {};
  return (metadata.packageName === "n5eb") || (metadata.package === "n5eb")
    || (metadata.system === "n5eb") || pack.collection?.startsWith("n5eb.");
}

/* -------------------------------------------- */

/**
 * Convert HTML descriptions to plain text for search indexing.
 * @param {string} html  HTML content.
 * @returns {string}
 */
function htmlToText(html) {
  return `${html ?? ""}`.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
