const { ProxyConfigError } = require('./proxy-errors');

/**
 * Named base URLs for the entity proxy (ADR-052, amendment 2026-10-18).
 *
 * A module declares where its API lives. One host is `proxy.baseUrl`, which
 * means `{ default: baseUrl }`. A module whose API spans several hosts (Google:
 * Drive, Docs, Sheets, Analytics Data, Ads) declares `proxy.baseUrls`, a map of
 * name to URL. A caller picks a base by NAME in the proxy request's `base`
 * field; it never supplies a URL or a host, so the host still comes only from
 * the module.
 */

const DEFAULT_BASE = 'default';
const BASE_NAME = /^[a-z][a-z0-9-]*$/;

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const describeRule = (rule) =>
    `${rule && typeof rule.method === 'string' ? rule.method : '?'} ${
        rule && typeof rule.path === 'string' ? rule.path : '?'
    }`;

function isValidBaseName(name) {
    return typeof name === 'string' && name.length <= 64 && BASE_NAME.test(name);
}

function assertBaseUrl(moduleName, name, value) {
    const where = `Module ${moduleName} proxy.baseUrls.${name}`;
    if (typeof value !== 'string') {
        throw new ProxyConfigError(`${where} must be an absolute https URL string (functions are not accepted)`);
    }
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new ProxyConfigError(`${where} is not a valid absolute URL`);
    }
    if (url.protocol !== 'https:') {
        throw new ProxyConfigError(`${where} must use https`);
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new ProxyConfigError(
            `${where} must not carry credentials, a query or a fragment`
        );
    }
}

/**
 * The bases a module declares, validated.
 *
 * @param {object} definition - a module definition
 * @returns {{ names: string[], values: Map<string, string|Function|undefined>, declared: boolean }}
 *   `declared` is false when the module names no base of its own; it then has
 *   the single base `default`, resolved from the requester at call time.
 * @throws {ProxyConfigError}
 */
function resolveModuleBases(definition) {
    const moduleName = definition?.moduleName ?? '(unnamed)';
    const proxy = definition?.proxy;
    const hasBaseUrl = proxy?.baseUrl !== undefined;
    const hasBaseUrls = proxy?.baseUrls !== undefined;

    if (hasBaseUrl && hasBaseUrls) {
        throw new ProxyConfigError(
            `Module ${moduleName} declares both proxy.baseUrl and proxy.baseUrls; use one ` +
                '(baseUrl means { default: baseUrl })'
        );
    }
    if (hasBaseUrls) {
        if (!isPlainObject(proxy.baseUrls) || Object.keys(proxy.baseUrls).length === 0) {
            throw new ProxyConfigError(
                `Module ${moduleName} proxy.baseUrls must be a non-empty object of name to URL`
            );
        }
        const values = new Map();
        for (const [name, value] of Object.entries(proxy.baseUrls)) {
            if (!isValidBaseName(name)) {
                throw new ProxyConfigError(
                    `Module ${moduleName} proxy.baseUrls has the invalid name ${JSON.stringify(
                        name
                    )}; names match ${BASE_NAME}`
                );
            }
            assertBaseUrl(moduleName, name, value);
            values.set(name, value);
        }
        return { names: [...values.keys()], values, declared: true };
    }
    return {
        names: [DEFAULT_BASE],
        values: new Map([[DEFAULT_BASE, proxy?.baseUrl]]),
        declared: hasBaseUrl,
    };
}

/** The base a rule applies to; a rule without `base` applies to `default`. */
const ruleBase = (rule) => (rule && rule.base !== undefined ? rule.base : DEFAULT_BASE);

/**
 * Load-time check of every allow rule that names a base: the app's
 * `managementApi.proxy.modules.<module>.allow` and each module's own
 * `proxy.allow`. A rule for a base the module does not declare could never
 * match, which reads as "allowed" and is not, so it stops the app.
 *
 * @param {Array<object>} moduleDefinitions
 * @param {{ modules?: Object }} [proxyConfig] - resolved managementApi.proxy
 * @throws {ProxyConfigError}
 */
function assertProxyConfig(moduleDefinitions, proxyConfig = {}) {
    const namesByModule = new Map();
    for (const definition of moduleDefinitions || []) {
        if (!definition?.moduleName) continue;
        const { names } = resolveModuleBases(definition);
        namesByModule.set(definition.moduleName, names);
        const own = definition.proxy?.allow;
        if (Array.isArray(own)) {
            assertRulesUseDeclaredBases(
                definition.moduleName,
                names,
                own,
                `Module ${definition.moduleName} proxy.allow`
            );
        }
    }
    for (const [moduleName, override] of Object.entries(proxyConfig.modules || {})) {
        const names = namesByModule.get(moduleName);
        // An override for a module that is not registered is not new: it never applied.
        if (!names || !Array.isArray(override?.allow)) continue;
        assertRulesUseDeclaredBases(
            moduleName,
            names,
            override.allow,
            `managementApi.proxy.modules.${moduleName}.allow`
        );
    }
}

function assertRulesUseDeclaredBases(moduleName, names, rules, where) {
    for (const rule of rules) {
        if (!isPlainObject(rule) || rule.base === undefined) continue;
        if (!isValidBaseName(rule.base) || !names.includes(rule.base)) {
            throw new ProxyConfigError(
                `${where}: the rule ${describeRule(rule)} names the base ${JSON.stringify(
                    rule.base
                )}, which module ${moduleName} does not declare (declared: ${names.join(', ')})`
            );
        }
    }
    // A rule with no base means `default`; the module must have one.
    if (!names.includes(DEFAULT_BASE)) {
        const bare = rules.find((rule) => isPlainObject(rule) && rule.base === undefined);
        if (bare) {
            throw new ProxyConfigError(
                `${where}: the rule ${describeRule(bare)} names no base, so it applies to ` +
                    `"default", which module ${moduleName} does not declare (declared: ${names.join(', ')})`
            );
        }
    }
}

module.exports = {
    DEFAULT_BASE,
    isValidBaseName,
    resolveModuleBases,
    ruleBase,
    assertProxyConfig,
};
