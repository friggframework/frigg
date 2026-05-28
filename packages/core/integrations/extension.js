/**
 * Tier 3 — Integration Extensions
 *
 * An Integration Extension is a reusable bundle exported by an API module (or a
 * shared extensions library) that contributes routes, events, queues, and workers
 * to a consumer integration. The integration binds the bundle declaratively via
 * `static Definition.extensions` and the framework merges its contributions into
 * the integration's effective definition at instantiation time.
 *
 * Extension bundle shape:
 *
 *     {
 *         name: string,                       // required, unique within the API module
 *         routes?: Array<{                    // optional, mounted alongside Definition.routes
 *             path: string,
 *             method: 'GET' | 'POST' | 'PUT' | 'DELETE' | ...,
 *             event: string                   // must exist in `events` below
 *         }>,
 *         events?: {                          // optional, merged into instance.events
 *             [eventName]: {
 *                 type?: string,              // e.g. 'LIFE_CYCLE_EVENT'
 *                 handler: Function           // default handler; integration may override per-binding
 *             }
 *         },
 *         queues?: Array<Object>,             // reserved — Phase 2
 *         workers?: Array<Object>             // reserved — Phase 2
 *     }
 *
 * Integration binding shape (on the integration's static Definition.extensions):
 *
 *     extensions: {
 *         hubspotWebhooks: {                  // local binding name (developer's choice)
 *             extension: hubspot.extensions.webhooks,
 *             handlers: {                     // optional override map
 *                 HUBSPOT_WEBHOOK: 'onHubSpotEvent'  // event → method name on the integration
 *             }
 *         }
 *     }
 *
 * The same extension may be bound multiple times under different local names; the
 * binding key is the developer-controlled local handle, not a global registry key.
 */

const KNOWN_HTTP_METHODS = new Set([
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'options',
    'head',
]);

/**
 * Validate the shape of an extension bundle and its binding.
 *
 * @param {Object} extension - The extension bundle to validate.
 * @param {string} bindingName - The local binding key (for error context).
 * @param {string} integrationName - The integration's Definition.name (for error context).
 * @param {Object} [binding] - Optional full binding object; if provided, also validates binding.handlers.
 * @throws {Error} If the extension is missing required fields or is internally inconsistent.
 */
function validateExtensionBinding(extension, bindingName, integrationName, binding) {
    const ctx = `Integration "${integrationName}" extension binding "${bindingName}"`;

    if (!extension || typeof extension !== 'object') {
        throw new Error(`${ctx}: extension must be an object`);
    }
    if (!extension.name || typeof extension.name !== 'string') {
        throw new Error(`${ctx}: extension is missing required "name" field`);
    }

    if (
        extension.useDatabase !== undefined &&
        typeof extension.useDatabase !== 'boolean'
    ) {
        throw new Error(
            `${ctx}: extension "${extension.name}" "useDatabase" must be a boolean`
        );
    }
    if (
        binding &&
        binding.useDatabase !== undefined &&
        typeof binding.useDatabase !== 'boolean'
    ) {
        throw new Error(
            `${ctx}: binding "useDatabase" must be a boolean`
        );
    }

    const events = extension.events || {};
    if (typeof events !== 'object' || Array.isArray(events)) {
        throw new Error(
            `${ctx}: extension "${extension.name}" "events" must be an object keyed by event name`
        );
    }

    // Validate each event's shape — handler, when present, must be a function.
    for (const [eventName, eventDef] of Object.entries(events)) {
        if (!eventDef || typeof eventDef !== 'object') {
            throw new Error(
                `${ctx}: extension "${extension.name}" event "${eventName}" must be an object`
            );
        }
        if (
            eventDef.handler !== undefined &&
            typeof eventDef.handler !== 'function'
        ) {
            throw new Error(
                `${ctx}: extension "${extension.name}" event "${eventName}" "handler" must be a function`
            );
        }
    }

    const routes = extension.routes || [];
    if (!Array.isArray(routes)) {
        throw new Error(
            `${ctx}: extension "${extension.name}" "routes" must be an array`
        );
    }

    for (const route of routes) {
        if (!route || typeof route !== 'object') {
            throw new Error(
                `${ctx}: extension "${extension.name}" has a malformed route entry`
            );
        }
        if (typeof route.path !== 'string' || route.path.length === 0) {
            throw new Error(
                `${ctx}: extension "${extension.name}" route is missing "path"`
            );
        }
        if (typeof route.method !== 'string') {
            throw new Error(
                `${ctx}: extension "${extension.name}" route "${route.path}" is missing "method"`
            );
        }
        if (!KNOWN_HTTP_METHODS.has(route.method.toLowerCase())) {
            throw new Error(
                `${ctx}: extension "${extension.name}" route "${route.path}" has unsupported method "${route.method}"`
            );
        }
        if (typeof route.event !== 'string' || route.event.length === 0) {
            throw new Error(
                `${ctx}: extension "${extension.name}" route "${route.path}" is missing "event"`
            );
        }
        if (!Object.prototype.hasOwnProperty.call(events, route.event)) {
            throw new Error(
                `${ctx}: extension "${extension.name}" route "${route.path}" references event "${route.event}" which is not declared in extension.events`
            );
        }
    }

    // Validate binding.handlers if a binding was supplied.
    if (binding && binding.handlers !== undefined) {
        if (
            typeof binding.handlers !== 'object' ||
            Array.isArray(binding.handlers) ||
            binding.handlers === null
        ) {
            throw new Error(
                `${ctx}: "handlers" must be an object keyed by event name`
            );
        }
        for (const [eventName, methodRef] of Object.entries(binding.handlers)) {
            if (typeof methodRef !== 'string' || methodRef.length === 0) {
                throw new Error(
                    `${ctx}: handler for event "${eventName}" must be a non-empty method name string (got ${typeof methodRef})`
                );
            }
            if (!Object.prototype.hasOwnProperty.call(events, eventName)) {
                throw new Error(
                    `${ctx}: binding.handlers references event "${eventName}" which is not declared in extension "${extension.name}".events — check for typos`
                );
            }
        }
    }
}

/**
 * Get the flattened list of extension-contributed routes for an integration class.
 * Each route carries the binding name and extension name alongside the route fields
 * so the router builder can produce useful boot-time logs.
 *
 * @param {Function} IntegrationClass - A class extending IntegrationBase.
 * @returns {Array<{bindingName: string, extensionName: string, path: string, method: string, event: string}>}
 */
function getExtensionRoutes(IntegrationClass) {
    const extensions = IntegrationClass?.Definition?.extensions || {};
    const integrationName = IntegrationClass?.Definition?.name;
    const flat = [];
    for (const [bindingName, binding] of Object.entries(extensions)) {
        // Fail fast: surface bad bindings at boot, not at first request.
        // Mirrors the validation that _mergeExtensions does at instance time.
        validateExtensionBinding(
            binding && binding.extension,
            bindingName,
            integrationName,
            binding
        );
        const useDatabase =
            binding.useDatabase ?? binding.extension.useDatabase ?? false;
        const routes = binding.extension.routes || [];
        for (const route of routes) {
            flat.push({
                bindingName,
                extensionName: binding.extension.name,
                path: route.path,
                method: route.method,
                event: route.event,
                useDatabase,
            });
        }
    }
    return flat;
}

/**
 * Get the flattened list of extension-contributed workers for an integration class.
 * Reserved for Phase 2 — today the per-integration QueueWorker handles all events
 * by name, so extension-contributed events flow through it without a dedicated worker.
 *
 * @param {Function} IntegrationClass - A class extending IntegrationBase.
 * @returns {Array<Object>}
 */
function getExtensionWorkers(IntegrationClass) {
    const extensions = IntegrationClass?.Definition?.extensions || {};
    const integrationName = IntegrationClass?.Definition?.name;
    const flat = [];
    for (const [bindingName, binding] of Object.entries(extensions)) {
        validateExtensionBinding(
            binding && binding.extension,
            bindingName,
            integrationName,
            binding
        );
        const workers = binding.extension.workers || [];
        for (const worker of workers) {
            flat.push({
                bindingName,
                extensionName: binding.extension.name,
                ...worker,
            });
        }
    }
    return flat;
}

module.exports = {
    validateExtensionBinding,
    getExtensionRoutes,
    getExtensionWorkers,
};
