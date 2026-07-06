/**
 * Get enumerable keys from a plain object or DataModel-like scope.
 * @param {object} scope  Flag scope object.
 * @returns {string[]}    Scope keys.
 */
function getScopeKeys(scope) {
  if ( !scope || (typeof scope !== "object") ) return [];
  return Object.keys(scope.toObject?.() ?? scope);
}

/**
 * Get a direct property from a plain object or DataModel-like scope.
 * @param {object} scope  Flag scope object.
 * @param {string} key    Property key.
 * @returns {*}           Property value.
 */
function getScopeValue(scope, key) {
  if ( !scope || (typeof scope !== "object") ) return undefined;
  if ( key in scope ) return scope[key];
  return scope.toObject?.()?.[key];
}

/**
 * Can this scope receive runtime compatibility aliases?
 * @param {object} scope  Flag scope object.
 * @returns {boolean}
 */
function canAliasScope(scope) {
  return scope && (typeof scope === "object") && Object.isExtensible(scope);
}

/**
 * Set a dotted path on an object.
 * @param {object} object  Target object.
 * @param {string} path    Dotted property path.
 * @param {*} value        Value to set.
 */
function setPath(object, path, value) {
  const keys = path.split(".");
  const final = keys.pop();
  let target = object;
  for ( const key of keys ) target = target[key] ??= {};
  target[final] = value;
}

/**
 * Hydrate an expanded `flags` object from update-style dotted system flag keys.
 * @param {object} data  Plain source or message data.
 * @returns {object|null}
 */
function hydrateSystemFlags(data) {
  let flags = data.flags;
  let found = !!flags;

  for ( const [key, value] of Object.entries(data) ) {
    const match = key.match(/^flags\.(?<scope>n5eb|dnd5e)(?:\.(?<path>.+))?$/);
    if ( !match ) continue;
    found = true;
    flags ??= {};
    const { scope, path } = match.groups;
    if ( !path ) flags[scope] = value;
    else {
      const scopeFlags = flags[scope] ??= {};
      if ( (typeof scopeFlags === "object") && scopeFlags ) setPath(scopeFlags, path, value);
    }
  }

  if ( found && !("flags" in data) ) {
    Object.defineProperty(data, "flags", {
      configurable: true,
      enumerable: true,
      value: flags,
      writable: true
    });
  }
  return found ? flags : null;
}

/**
 * Expose missing properties in one flag scope as runtime fallbacks to the other scope.
 * @param {object} target    Scope that receives runtime aliases.
 * @param {object} fallback  Scope that provides fallback values.
 */
function assignFlagScopeKeyAliases(target, fallback) {
  if ( !canAliasScope(target) ) return;
  if ( target === fallback ) return;

  for ( const key of getScopeKeys(fallback) ) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const targetValue = getScopeValue(target, key);
    const fallbackValue = getScopeValue(fallback, key);
    if ( targetValue === undefined ) {
      if ( descriptor && !descriptor.configurable ) continue;
      Object.defineProperty(target, key, {
        configurable: true,
        get: () => getScopeValue(fallback, key),
        set: value => {
          Object.defineProperty(target, key, {
            configurable: true,
            enumerable: true,
            value,
            writable: true
          });
        }
      });
    } else if ( canAliasScope(targetValue) && canAliasScope(fallbackValue) ) {
      assignFlagScopeKeyAliases(targetValue, fallbackValue);
    }
  }
}

/**
 * Does this flag scope have an enumerable value that will survive document serialization?
 * @param {object} flags  Prepared or plain flags object.
 * @param {string} scope  Flag scope.
 * @returns {boolean}
 */
function hasSerializableScope(flags, scope) {
  const descriptor = Object.getOwnPropertyDescriptor(flags, scope);
  return descriptor?.enumerable && ("value" in descriptor);
}

/**
 * Set a serializable flag scope value.
 * @param {object} flags  Prepared or plain flags object.
 * @param {string} scope  Flag scope.
 * @param {*} value       Scope value.
 */
function setSerializableScope(flags, scope, value) {
  Object.defineProperty(flags, scope, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}

/**
 * Copy missing flag keys from one concrete scope to another.
 * @param {object} target    Scope receiving missing data.
 * @param {object} fallback  Scope providing fallback data.
 */
function mirrorFlagScopeKeys(target, fallback) {
  if ( !canAliasScope(target) ) return;
  if ( target === fallback ) return;

  for ( const key of getScopeKeys(fallback) ) {
    const targetValue = getScopeValue(target, key);
    const fallbackValue = getScopeValue(fallback, key);
    if ( targetValue === undefined ) target[key] = foundry.utils.deepClone(fallbackValue);
    else if ( canAliasScope(targetValue) && canAliasScope(fallbackValue) ) {
      mirrorFlagScopeKeys(targetValue, fallbackValue);
    }
  }
}

/**
 * Expose N5eB and DND5E system flag scopes as runtime aliases on a flags object.
 * This keeps imported/module-created data intact while allowing dnd5e-targeted automation to
 * interoperate with N5eB document code.
 * @param {object} flags  Prepared or plain flags object.
 */
export function assignSystemFlagScopeAliases(flags) {
  if ( !flags || !Object.isExtensible(flags) ) return;

  if ( !("n5eb" in flags) && ("dnd5e" in flags) ) {
    Object.defineProperty(flags, "n5eb", {
      configurable: true,
      get: () => flags.dnd5e,
      set: value => {
        Object.defineProperty(flags, "n5eb", {
          configurable: true,
          enumerable: true,
          value,
          writable: true
        });
      }
    });
  }

  if ( !("dnd5e" in flags) && ("n5eb" in flags) ) {
    Object.defineProperty(flags, "dnd5e", {
      configurable: true,
      get: () => flags.n5eb,
      set: value => {
        Object.defineProperty(flags, "dnd5e", {
          configurable: true,
          enumerable: true,
          value,
          writable: true
        });
      }
    });
  }

  assignFlagScopeKeyAliases(flags.n5eb, flags.dnd5e);
  assignFlagScopeKeyAliases(flags.dnd5e, flags.n5eb);
}

/**
 * Expose N5eB and DND5E system flag scopes as runtime aliases on plain message/source data.
 * @param {object} data  Object containing a `flags` object, or the flags object itself.
 */
export function assignSystemFlagDataAliases(data) {
  if ( !data || (typeof data !== "object") ) return;
  const flags = ("n5eb" in data) || ("dnd5e" in data) ? data : hydrateSystemFlags(data);
  assignSystemFlagScopeAliases(flags);
}

/**
 * Mirror N5eB and DND5E system flag scopes as serializable data.
 * Use this for document data that third-party modules serialize and read later, such as measured templates.
 * @param {object} data  Object containing a `flags` object, or the flags object itself.
 * @returns {object|null}
 */
export function mirrorSystemFlagDataScopes(data) {
  if ( !data || (typeof data !== "object") ) return null;
  const flags = ("n5eb" in data) || ("dnd5e" in data) ? data : hydrateSystemFlags(data);
  if ( !flags || (typeof flags !== "object") ) return null;

  if ( !hasSerializableScope(flags, "n5eb") && (flags.dnd5e !== undefined) ) {
    setSerializableScope(flags, "n5eb", foundry.utils.deepClone(flags.dnd5e));
  }
  if ( !hasSerializableScope(flags, "dnd5e") && (flags.n5eb !== undefined) ) {
    setSerializableScope(flags, "dnd5e", foundry.utils.deepClone(flags.n5eb));
  }

  mirrorFlagScopeKeys(flags.n5eb, flags.dnd5e);
  mirrorFlagScopeKeys(flags.dnd5e, flags.n5eb);
  assignSystemFlagScopeAliases(flags);
  return flags;
}

/**
 * Expose N5eB and DND5E system flag scopes as runtime aliases.
 * @param {foundry.abstract.Document} document  Document whose prepared flags should be aliased.
 */
export function assignSystemFlagAliases(document) {
  assignSystemFlagScopeAliases(document.flags);
}

/**
 * Read an aliased N5eB/DND5E system flag scope.
 * @param {foundry.abstract.Document} document  Document whose flags should be read.
 * @param {string} scope                        Requested flag scope.
 * @param {string} key                          Flag key path.
 * @param {*} value                             Value already read from the requested scope.
 * @returns {*}                                 The original value, or a value from the compatibility scope.
 */
export function getSystemFlagAlias(document, scope, key, value) {
  if ( value !== undefined ) return value;
  const flags = document.flags ?? {};
  if ( scope === "n5eb" ) return foundry.utils.getProperty(flags.dnd5e ?? {}, key);
  if ( scope === "dnd5e" ) return foundry.utils.getProperty(flags.n5eb ?? {}, key);
  return value;
}
