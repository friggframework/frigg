/**
 * Source for a new integration class (`src/integrations/<Name>Integration.js`)
 * that wraps one installed API module.
 *
 * It follows the current IntegrationBase contract: a static `Definition`
 * (name, version, display, `modules: { <key>: { definition } }`) and event
 * handlers registered on `this.events` in the constructor. Calls to the API
 * module go through `this.<key>.api.<method>()`.
 */

/** Turn an arbitrary label (e.g. "Google Drive", "Monday.com") into a JS identifier. */
function toIdentifier(label) {
    const words = String(label)
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    let identifier = words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
    if (!identifier) {
        identifier = 'Module';
    }
    if (/^[0-9]/.test(identifier)) {
        identifier = `Module${identifier}`;
    }
    return identifier;
}

/** camelCase key for `Definition.modules` (e.g. "google-drive" -> "googleDrive"). */
function toModuleKey(moduleName) {
    const words = String(moduleName)
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    if (words.length === 0) {
        return 'module';
    }
    const key = words
        .map((word, i) =>
            i === 0
                ? word.charAt(0).toLowerCase() + word.slice(1)
                : word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join('');
    return /^[0-9]/.test(key) ? `module${key}` : key;
}

const quote = (value) => JSON.stringify(value === undefined ? '' : value);

/**
 * @param {object} params
 * @param {string} params.className - e.g. `HubSpotIntegration`
 * @param {string} params.packageName - e.g. `@friggframework/api-module-hubspot`
 * @param {string} params.moduleName - The module's `Definition.getName()`
 * @param {string} params.label - Human-readable name
 * @param {string} [params.description]
 * @param {string} [params.detailsUrl]
 * @param {string} [params.icon]
 * @param {string[]} [params.categories]
 * @returns {string}
 */
function getIntegrationTemplate({
    className,
    packageName,
    moduleName,
    label,
    description,
    detailsUrl,
    icon,
    categories,
}) {
    const moduleKey = toModuleKey(moduleName);
    const moduleVar = `${moduleKey}Module`;
    const category = Array.isArray(categories) ? categories.join(', ') : '';

    return `const { IntegrationBase } = require('@friggframework/core');
const ${moduleVar} = require(${quote(packageName)});

class ${className} extends IntegrationBase {
    static Definition = {
        name: ${quote(moduleName)},
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        hasUserConfig: false,

        display: {
            label: ${quote(label)},
            description: ${quote(description)},
            category: ${quote(category)},
            detailsUrl: ${quote(detailsUrl)},
            icon: ${quote(icon)},
        },

        // The API modules this integration uses. Each key becomes
        // \`this.<key>\` on an integration instance, e.g.
        // \`this.${moduleKey}.api\`.
        modules: {
            ${moduleKey}: { definition: ${moduleVar}.Definition },
        },

        // HTTP routes, served under /api/${moduleName}-integration/...
        // e.g. { path: '/sample', method: 'GET', event: 'GET_SAMPLE_DATA' }
        routes: [],
    };

    constructor(params) {
        super(params);
        this.events = {
            // Map event names to handlers, e.g.
            // GET_SAMPLE_DATA: { handler: this.getSampleData.bind(this) },
        };
    }
}

module.exports = ${className};
`;
}

module.exports = { getIntegrationTemplate, toIdentifier, toModuleKey };
