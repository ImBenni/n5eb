/**
 * Create a session-scoped asynchronous cache which deduplicates concurrent loads and rejects stale generations.
 * @param {Function} loader  Function which builds the cached value.
 * @returns {{get: Function, invalidate: Function}}
 */
export function createNpcBuilderCache(loader) {
  let generation = 0;
  let value;
  let promise = null;

  const get = async () => {
    if ( value !== undefined ) return value;
    if ( !promise ) {
      const loadGeneration = generation;
      const activePromise = Promise.resolve().then(loader)
        .then(result => {
          if ( loadGeneration === generation ) value = result;
          return { generation: loadGeneration, result };
        })
        .finally(() => {
          if ( promise === activePromise ) promise = null;
        });
      promise = activePromise;
    }

    const loaded = await promise;
    if ( loaded.generation !== generation ) return get();
    return loaded.result;
  };

  return {
    get,
    get generation() {
      return generation;
    },
    invalidate() {
      generation++;
      value = undefined;
      promise = null;
    }
  };
}

/* -------------------------------------------- */

/**
 * Map values with a fixed concurrency limit while retaining input order.
 * @param {Iterable<*>} values  Values to process.
 * @param {number} limit        Maximum simultaneous mapper calls.
 * @param {Function} mapper     Asynchronous mapper.
 * @returns {Promise<*[]>}
 */
export async function mapWithConcurrency(values, limit, mapper) {
  const source = Array.from(values);
  const results = new Array(source.length);
  let cursor = 0;

  const worker = async () => {
    while ( cursor < source.length ) {
      const index = cursor++;
      results[index] = await mapper(source[index], index);
    }
  };

  const workerCount = Math.min(Math.max(Number(limit) || 1, 1), source.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

/* -------------------------------------------- */

const descriptionCache = new Map();

/**
 * Load and cache one NPC builder preview description.
 * @param {string} uuid  Source Item UUID.
 * @returns {Promise<string>}
 */
export async function getNpcBuilderDescription(uuid) {
  if ( !uuid ) return "";
  let description = descriptionCache.get(uuid);
  if ( description ) return description;

  description = fromUuid(uuid)
    .then(item => foundry.utils.getProperty(item, "system.description.value") ?? "")
    .catch(err => {
      descriptionCache.delete(uuid);
      throw err;
    });
  descriptionCache.set(uuid, description);
  return description;
}

/* -------------------------------------------- */

/**
 * Clear cached preview descriptions after source content changes.
 * @param {string} [uuid]  Specific Item UUID, or all descriptions when omitted.
 */
export function invalidateNpcBuilderDescription(uuid) {
  if ( uuid ) descriptionCache.delete(uuid);
  else descriptionCache.clear();
}
