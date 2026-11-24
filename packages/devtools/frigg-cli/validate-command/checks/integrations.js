/**
 * Structural checks of the integration classes listed in
 * `Definition.integrations`. JSON Schema cannot describe a class, so these
 * checks mirror what core does with each class at runtime
 * (IntegrationBase, Module.validateDefinition, the integration builder).
 */

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function issue(severity, code, pointer, message, hint) {
    return { severity, code, pointer, message, hint };
}

function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'an array';
    return typeof value === 'object' ? 'a plain object' : `a ${typeof value}`;
}

/**
 * Mirrors Module.validateDefinition (packages/core/modules/module.js): an
 * API module definition that fails these checks throws when the integration
 * is instantiated.
 */
function checkModuleDefinition(definition, pointer) {
    const issues = [];
    const err = (code, path, message, hint) =>
        issues.push(issue('error', code, `${pointer}${path}`, message, hint));

    if (!definition || typeof definition !== 'object') {
        err(
            'module-definition-missing',
            '',
            'The module entry has no `definition` (the API module definition).',
            "Use `{ definition: require('@friggframework/api-module-<name>').Definition }`."
        );
        return issues;
    }
    if (typeof definition.moduleName !== 'string' || !definition.moduleName) {
        err(
            'module-name-missing',
            '/moduleName',
            'The API module definition has no moduleName.',
            'Set moduleName to a string.'
        );
    }
    if (typeof definition.API !== 'function') {
        err(
            'module-api-missing',
            '/API',
            'The API module definition has no API class.',
            "Set API to the module's requester class."
        );
    }
    const methods = definition.requiredAuthMethods;
    if (!methods || typeof methods !== 'object') {
        err(
            'module-auth-methods-missing',
            '/requiredAuthMethods',
            'The API module definition has no requiredAuthMethods.',
            'Define getToken (OAuth2), getEntityDetails, getCredentialDetails, apiPropertiesToPersist and testAuthRequest.'
        );
        return issues;
    }
    const required = [
        'getEntityDetails',
        'getCredentialDetails',
        'testAuthRequest',
    ];
    if (definition.API && definition.API.requesterType === 'oauth2') {
        required.unshift('getToken');
    }
    for (const name of required) {
        if (typeof methods[name] !== 'function') {
            err(
                'module-auth-method-missing',
                `/requiredAuthMethods/${name}`,
                `requiredAuthMethods.${name} is missing or not a function.`,
                `Add an async ${name}() to the module definition.`
            );
        }
    }
    if (
        !methods.apiPropertiesToPersist ||
        typeof methods.apiPropertiesToPersist !== 'object'
    ) {
        err(
            'module-auth-method-missing',
            '/requiredAuthMethods/apiPropertiesToPersist',
            'requiredAuthMethods.apiPropertiesToPersist is missing.',
            'Set it to `{ credential: [...], entity: [...] }`.'
        );
    }
    return issues;
}

function checkIntegration(integration, index) {
    const pointer = `/integrations/${index}`;
    const issues = [];

    if (typeof integration !== 'function') {
        issues.push(
            issue(
                'error',
                'integration-not-a-class',
                pointer,
                `Integration ${index} is ${describe(
                    integration
                )}, not a class. Core instantiates each entry with \`new\`.`,
                'List the IntegrationBase subclass itself, e.g. `integrations: [HubSpotIntegration]`.'
            )
        );
        return issues;
    }

    const label = integration.name || `Integration ${index}`;
    const Definition = integration.Definition;
    if (!Definition || typeof Definition !== 'object') {
        issues.push(
            issue(
                'error',
                'integration-definition-missing',
                `${pointer}/Definition`,
                `${label} has no static Definition.`,
                'Add `static Definition = { name, version, modules: { ... } }` to the class.'
            )
        );
        return issues;
    }

    if (typeof Definition.name !== 'string' || !Definition.name) {
        issues.push(
            issue(
                'error',
                'integration-name-missing',
                `${pointer}/Definition/name`,
                `${label}.Definition has no name.`,
                "Set Definition.name; it names the integration's routes, queue and Lambda functions."
            )
        );
    } else if (!NAME_PATTERN.test(Definition.name)) {
        issues.push(
            issue(
                'error',
                'integration-name-invalid',
                `${pointer}/Definition/name`,
                `${label}.Definition.name "${Definition.name}" is not a valid name.`,
                'Use letters, digits, "-" and "_", starting with a letter: it becomes part of AWS resource names.'
            )
        );
    }

    if (
        Definition.version === undefined ||
        Definition.version === null ||
        Definition.version === ''
    ) {
        issues.push(
            issue(
                'warning',
                'integration-version-missing',
                `${pointer}/Definition/version`,
                `${label}.Definition has no version; integration records are stored without one.`,
                "Set Definition.version, e.g. '1.0.0'."
            )
        );
    }

    const modules = Definition.modules;
    if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
        issues.push(
            issue(
                'error',
                'integration-modules-missing',
                `${pointer}/Definition/modules`,
                `${label}.Definition.modules is ${
                    modules === undefined ? 'missing' : describe(modules)
                }.`,
                'Set modules to an object, e.g. `modules: { hubspot: { definition: hubspot.Definition } }`.'
            )
        );
        return issues;
    }

    for (const [key, entry] of Object.entries(modules)) {
        const modulePointer = `${pointer}/Definition/modules/${key}`;
        if (!entry || typeof entry !== 'object') {
            issues.push(
                issue(
                    'error',
                    'module-entry-invalid',
                    modulePointer,
                    `Module "${key}" is ${describe(entry)}.`,
                    'Use `{ definition: <API module Definition> }`.'
                )
            );
            continue;
        }
        issues.push(
            ...checkModuleDefinition(
                entry.definition,
                `${modulePointer}/definition`
            )
        );
        const rateLimit =
            entry.definition?.rateLimit ?? entry.definition?.config?.rateLimit;
        if (rateLimit !== undefined) {
            issues.push(
                issue(
                    'warning',
                    'module-rate-limit-ignored',
                    `${modulePointer}/definition/${
                        entry.definition?.rateLimit !== undefined
                            ? 'rateLimit'
                            : 'config/rateLimit'
                    }`,
                    `Module "${key}" declares rateLimit, but the Frigg runtime does not read it: no rate limit is applied.`,
                    'Throttle in the API class (or with the queue concurrency) until module rate limits are supported.'
                )
            );
        }
    }

    return issues;
}

/**
 * @param {object} definition the app definition
 * @returns {object[]} issues
 */
function checkIntegrations(definition) {
    const integrations = definition.integrations;
    if (!Array.isArray(integrations)) return []; // the schema reports this
    const issues = [];
    const seen = new Map();
    integrations.forEach((integration, index) => {
        issues.push(...checkIntegration(integration, index));
        const name =
            typeof integration === 'function'
                ? integration.Definition?.name
                : undefined;
        if (typeof name === 'string' && name) {
            if (seen.has(name)) {
                issues.push(
                    issue(
                        'error',
                        'integration-name-duplicate',
                        `/integrations/${index}/Definition/name`,
                        `Integrations ${seen.get(
                            name
                        )} and ${index} are both named "${name}".`,
                        'Give each integration a unique Definition.name; routes and queues are keyed by it.'
                    )
                );
            } else {
                seen.set(name, index);
            }
        }
    });
    if (integrations.length === 0) {
        issues.push(
            issue(
                'warning',
                'no-integrations',
                '/integrations',
                'The app lists no integrations.',
                'Add one with `frigg install <module>`.'
            )
        );
    }
    return issues;
}

module.exports = { checkIntegrations, checkModuleDefinition };
