const { AsyncLocalStorage } = require('node:async_hooks');

const LOGGER_SCOPE_KEY = 'log';
const INTEGRATION_KEYS = ['integrationId', 'integrationType', 'userId', 'version'];

// Shared across jest module registries and nested core copies.
const STORE_KEY = Symbol.for('@friggframework/core.logs.context');

function als() {
    if (!globalThis[STORE_KEY]) {
        globalThis[STORE_KEY] = new AsyncLocalStorage();
    }
    return globalThis[STORE_KEY];
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function freezeCopy(value) {
    if (Array.isArray(value)) {
        return Object.freeze(value.map(freezeCopy));
    }
    if (isPlainObject(value)) {
        const copy = {};
        for (const key of Object.keys(value)) {
            copy[key] = freezeCopy(value[key]);
        }
        return Object.freeze(copy);
    }
    return value;
}

function assignDefined(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] !== undefined) target[key] = source[key];
    }
    return target;
}

function mergeStores(outer, inner) {
    const merged = { ...(outer || {}) };
    if (!inner || typeof inner !== 'object') return freezeCopy(merged);
    for (const key of Object.keys(inner)) {
        const value = inner[key];
        if (value === undefined) continue;
        if (key === LOGGER_SCOPE_KEY && isPlainObject(value)) {
            merged[key] = assignDefined({ ...(merged[key] || {}) }, value);
            continue;
        }
        merged[key] = value;
    }
    return freezeCopy(merged);
}

function runInContext(context, fn) {
    const storage = als();
    return storage.run(mergeStores(storage.getStore(), context), fn);
}

function getContext() {
    return als().getStore() ?? null;
}

// The store is frozen per scope, so one scope object per store is enough.
const EMPTY_SCOPE = Object.freeze({});
const scopeByStore = new WeakMap();

function getLoggerScope() {
    const store = getContext();
    if (!store) return EMPTY_SCOPE;
    let scope = scopeByStore.get(store);
    if (!scope) {
        scope = {};
        for (const key of INTEGRATION_KEYS) {
            if (store[key] !== undefined) scope[key] = store[key];
        }
        if (isPlainObject(store[LOGGER_SCOPE_KEY])) {
            Object.assign(scope, store[LOGGER_SCOPE_KEY]);
        }
        scope = Object.freeze(scope);
        scopeByStore.set(store, scope);
    }
    return scope;
}

function hasOnlyLoggerKeys(store) {
    if (!store || typeof store !== 'object') return false;
    const keys = Object.keys(store);
    return keys.length > 0 && keys.every((key) => key === LOGGER_SCOPE_KEY);
}

module.exports = {
    LOGGER_SCOPE_KEY,
    runInContext,
    getContext,
    getLoggerScope,
    hasOnlyLoggerKeys,
    isPlainObject,
};
