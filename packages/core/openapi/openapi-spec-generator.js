/**
 * Dynamic OpenAPI Spec Generator
 *
 * Generates OpenAPI specification dynamically from appDefinition and installed modules.
 * Combines base spec with integration-specific endpoints.
 */

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const BASE_SPEC_PATH = path.join(__dirname, 'openapi.yaml');

let cachedSpec = null;
let cachedModules = null;

/**
 * Load the base OpenAPI spec
 */
function loadBaseSpec() {
    const specContent = fs.readFileSync(BASE_SPEC_PATH, 'utf8');
    return yaml.load(specContent);
}

/**
 * Extract module metadata for OpenAPI documentation
 * @param {Object} moduleDefinition - Module definition object
 * @returns {Object} Module metadata
 */
function extractModuleMetadata(moduleDefinition) {
    const Definition = moduleDefinition.Definition || moduleDefinition;
    const name = Definition?.getName?.() || Definition?.name || 'unknown';
    const displayName = Definition?.display?.name || name;
    const description = Definition?.display?.description || `${displayName} integration`;
    const moduleName = Definition?.moduleName || name;

    // Extract auth type
    const authType = Definition?.modules?.[Object.keys(Definition?.modules || {})[0]]?.authType || 'oauth2';

    return {
        name,
        displayName,
        description,
        moduleName,
        authType,
        hasOptions: typeof Definition?.Options !== 'undefined',
        hasEvents: typeof Definition?.events !== 'undefined',
    };
}

/**
 * Generate entity type schema for a module
 */
function generateEntityTypeSchema(module) {
    return {
        type: 'object',
        properties: {
            type: { type: 'string', example: module.name },
            name: { type: 'string', example: module.displayName },
            description: { type: 'string', example: module.description },
            authType: { type: 'string', enum: ['oauth2', 'apiKey', 'basic', 'form'] },
            hasOptions: { type: 'boolean' },
        }
    };
}

/**
 * Generate dynamic paths for installed integrations
 */
function generateIntegrationPaths(installedModules) {
    const paths = {};

    // Add dynamic entity type examples in responses
    const entityTypeExamples = {};
    installedModules.forEach(module => {
        entityTypeExamples[module.name] = {
            value: {
                type: module.name,
                name: module.displayName,
                description: module.description,
                authType: module.authType,
                hasOptions: module.hasOptions
            }
        };
    });

    return { paths, entityTypeExamples };
}

/**
 * Add installed modules to spec's entity type examples
 */
function enrichSpecWithModules(spec, installedModules) {
    if (!installedModules.length) return spec;

    // Update ListEntityTypesResponse with actual modules
    if (spec.components?.schemas?.ListEntityTypesResponse) {
        spec.components.schemas.ListEntityTypesResponse.properties.types.example =
            installedModules.map(m => ({
                type: m.name,
                name: m.displayName,
                description: m.description,
                authType: m.authType,
            }));
    }

    // Add module-specific enum values to entityType parameters
    const moduleNames = installedModules.map(m => m.name);
    if (moduleNames.length > 0) {
        // Add enum suggestions to entity type parameters throughout spec
        Object.values(spec.paths || {}).forEach(pathItem => {
            Object.values(pathItem).forEach(operation => {
                if (operation.parameters) {
                    operation.parameters.forEach(param => {
                        if (param.name === 'entityType' || param.name === 'typeName') {
                            param.schema = param.schema || { type: 'string' };
                            param.schema.enum = moduleNames;
                            param.schema.example = moduleNames[0];
                        }
                    });
                }
            });
        });
    }

    // Add installed modules section to spec info
    spec.info.description = `${spec.info.description || ''}\n\n## Installed Modules\n` +
        installedModules.map(m => `- **${m.displayName}** (\`${m.name}\`): ${m.description}`).join('\n');

    return spec;
}

/**
 * Generate complete OpenAPI spec from appDefinition
 * @param {Object} appDefinition - The app definition containing integrations
 * @param {Object} options - Generation options
 * @returns {Object} Complete OpenAPI specification
 */
function generateOpenApiSpec(appDefinition = null, options = {}) {
    const { useCache = true, serverUrl = null } = options;

    // Return cached spec if available and caching enabled
    if (useCache && cachedSpec && cachedModules === JSON.stringify(appDefinition?.integrations)) {
        return cachedSpec;
    }

    // Load base spec
    const spec = loadBaseSpec();

    // Extract installed modules from appDefinition
    const installedModules = [];
    if (appDefinition?.integrations) {
        appDefinition.integrations.forEach(integration => {
            try {
                const metadata = extractModuleMetadata(integration);
                if (metadata.name !== 'unknown') {
                    installedModules.push(metadata);
                }
            } catch (e) {
                // Skip modules that can't be processed
            }
        });
    }

    // Enrich spec with module information
    if (installedModules.length > 0) {
        enrichSpecWithModules(spec, installedModules);
    }

    // Add custom server URL if provided
    if (serverUrl) {
        spec.servers = [
            { url: serverUrl, description: 'Current server' },
            ...spec.servers
        ];
    }

    // Add generation metadata
    spec.info['x-generated'] = {
        timestamp: new Date().toISOString(),
        moduleCount: installedModules.length,
        modules: installedModules.map(m => m.name)
    };

    // Cache result
    if (useCache) {
        cachedSpec = spec;
        cachedModules = JSON.stringify(appDefinition?.integrations);
    }

    return spec;
}

/**
 * Clear cached spec
 */
function clearCache() {
    cachedSpec = null;
    cachedModules = null;
}

/**
 * Get spec as YAML string
 */
function generateOpenApiYaml(appDefinition = null, options = {}) {
    const spec = generateOpenApiSpec(appDefinition, options);
    return yaml.dump(spec);
}

module.exports = {
    generateOpenApiSpec,
    generateOpenApiYaml,
    clearCache,
    extractModuleMetadata,
    loadBaseSpec,
};
