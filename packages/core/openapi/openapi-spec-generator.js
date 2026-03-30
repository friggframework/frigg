/**
 * Dynamic OpenAPI Spec Generator
 *
 * Generates OpenAPI specifications dynamically from appDefinition and installed modules.
 * Supports both v1 (legacy) and v2 (current) API versions.
 *
 * Usage:
 *   const { generateOpenApiSpecV1, generateOpenApiSpecV2 } = require('./openapi-spec-generator');
 *   const v1Spec = generateOpenApiSpecV1(appDefinition, { serverUrl });
 *   const v2Spec = generateOpenApiSpecV2(appDefinition, { serverUrl });
 */

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const V1_SPEC_PATH = path.join(__dirname, 'openapi-v1.yaml');
const V2_SPEC_PATH = path.join(__dirname, 'openapi-v2.yaml');

// Separate caches for each version
const cache = {
    v1: { spec: null, modules: null },
    v2: { spec: null, modules: null },
    legacy: { spec: null, modules: null },
};

/**
 * Load a YAML spec file
 * @param {string} specPath - Path to the YAML file
 * @returns {Object} Parsed spec object
 */
function loadSpecFile(specPath) {
    if (!fs.existsSync(specPath)) {
        throw new Error(`OpenAPI spec not found: ${specPath}`);
    }
    const specContent = fs.readFileSync(specPath, 'utf8');
    return yaml.load(specContent);
}

/**
 * Load the base OpenAPI spec (defaults to v2)
 * @deprecated Use loadV1Spec or loadV2Spec instead
 */
function loadBaseSpec() {
    return loadSpecFile(V2_SPEC_PATH);
}

/**
 * Load the v1 OpenAPI spec
 */
function loadV1Spec() {
    return loadSpecFile(V1_SPEC_PATH);
}

/**
 * Load the v2 OpenAPI spec
 */
function loadV2Spec() {
    return loadSpecFile(V2_SPEC_PATH);
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
    const description =
        Definition?.display?.description || `${displayName} integration`;
    const moduleName = Definition?.moduleName || name;

    // Extract auth type from first module
    const moduleKeys = Object.keys(Definition?.modules || {});
    const firstModule =
        moduleKeys.length > 0 ? Definition.modules[moduleKeys[0]] : null;
    const authType =
        firstModule?.definition?.getAuthType?.() ||
        firstModule?.authType ||
        'oauth2';
    const stepCount = firstModule?.definition?.getAuthStepCount?.() || 1;

    return {
        name,
        displayName,
        description,
        moduleName,
        authType,
        stepCount,
        isMultiStep: stepCount > 1,
        hasOptions: typeof Definition?.Options !== 'undefined',
        hasEvents: typeof Definition?.events !== 'undefined',
        capabilities: firstModule?.definition?.getCapabilities?.() || [],
    };
}

/**
 * Enrich spec with installed module information
 * @param {Object} spec - OpenAPI spec object
 * @param {Array} installedModules - Array of module metadata
 * @returns {Object} Enriched spec
 */
function enrichSpecWithModules(spec, installedModules) {
    if (!installedModules.length) return spec;

    // Update ListEntityTypesResponse with actual modules
    if (spec.components?.schemas?.ListEntityTypesResponse) {
        spec.components.schemas.ListEntityTypesResponse.properties.types.example =
            installedModules.map((m) => ({
                type: m.name,
                name: m.displayName,
                description: m.description,
                authType: m.authType,
                isMultiStep: m.isMultiStep,
                stepCount: m.stepCount,
            }));
    }

    // Update IntegrationOption examples
    if (spec.components?.schemas?.IntegrationOption) {
        const examples = installedModules.slice(0, 3).map((m) => ({
            type: m.name,
            name: m.displayName,
            description: m.description,
            hasAuth: true,
        }));
        if (
            spec.components.schemas.ListIntegrationOptionsResponse?.properties
                ?.integrations
        ) {
            spec.components.schemas.ListIntegrationOptionsResponse.properties.integrations.example =
                examples;
        }
    }

    // Add module-specific enum values to parameters
    const moduleNames = installedModules.map((m) => m.name);
    if (moduleNames.length > 0) {
        Object.values(spec.paths || {}).forEach((pathItem) => {
            Object.values(pathItem).forEach((operation) => {
                if (operation.parameters) {
                    operation.parameters.forEach((param) => {
                        if (
                            param.name === 'entityType' ||
                            param.name === 'typeName' ||
                            param.name === 'moduleType'
                        ) {
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
    const moduleList = installedModules
        .map((m) => `- **${m.displayName}** (\`${m.name}\`): ${m.description}`)
        .join('\n');

    spec.info.description = `${
        spec.info.description || ''
    }\n\n## Installed Modules\n${moduleList}`;

    return spec;
}

/**
 * Extract installed modules from appDefinition
 * @param {Object} appDefinition - App definition object
 * @returns {Array} Array of module metadata
 */
function extractInstalledModules(appDefinition) {
    const installedModules = [];

    if (appDefinition?.integrations) {
        appDefinition.integrations.forEach((integration) => {
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

    return installedModules;
}

/**
 * Add server URL and generation metadata to spec
 * @param {Object} spec - OpenAPI spec
 * @param {Object} options - Options including serverUrl
 * @param {Array} installedModules - Installed modules for metadata
 * @returns {Object} Updated spec
 */
function finalizeSpec(spec, options, installedModules) {
    const { serverUrl } = options;

    // Add custom server URL if provided
    if (serverUrl) {
        spec.servers = [
            { url: serverUrl, description: 'Current server' },
            ...(spec.servers || []),
        ];
    }

    // Add generation metadata
    spec.info['x-generated'] = {
        timestamp: new Date().toISOString(),
        moduleCount: installedModules.length,
        modules: installedModules.map((m) => m.name),
    };

    return spec;
}

/**
 * Generate v1 (legacy) OpenAPI spec from appDefinition
 * @param {Object} appDefinition - The app definition containing integrations
 * @param {Object} options - Generation options
 * @returns {Object} Complete v1 OpenAPI specification
 */
function generateOpenApiSpecV1(appDefinition = null, options = {}) {
    const { useCache = true, serverUrl = null } = options;
    const modulesKey = JSON.stringify(appDefinition?.integrations);

    // Return cached spec if available
    if (useCache && cache.v1.spec && cache.v1.modules === modulesKey) {
        // Clone and update server URL if different
        const spec = JSON.parse(JSON.stringify(cache.v1.spec));
        if (serverUrl) {
            spec.servers = [
                { url: serverUrl, description: 'Current server' },
                ...(spec.servers?.filter(
                    (s) => s.description !== 'Current server'
                ) || []),
            ];
        }
        return spec;
    }

    // Load v1 spec
    const spec = loadV1Spec();

    // Extract and enrich with installed modules
    const installedModules = extractInstalledModules(appDefinition);
    if (installedModules.length > 0) {
        enrichSpecWithModules(spec, installedModules);
    }

    // Finalize spec
    finalizeSpec(spec, { serverUrl }, installedModules);

    // Cache result
    if (useCache) {
        cache.v1.spec = JSON.parse(JSON.stringify(spec));
        cache.v1.modules = modulesKey;
    }

    return spec;
}

/**
 * Generate v2 (current) OpenAPI spec from appDefinition
 * @param {Object} appDefinition - The app definition containing integrations
 * @param {Object} options - Generation options
 * @returns {Object} Complete v2 OpenAPI specification
 */
function generateOpenApiSpecV2(appDefinition = null, options = {}) {
    const { useCache = true, serverUrl = null } = options;
    const modulesKey = JSON.stringify(appDefinition?.integrations);

    // Return cached spec if available
    if (useCache && cache.v2.spec && cache.v2.modules === modulesKey) {
        // Clone and update server URL if different
        const spec = JSON.parse(JSON.stringify(cache.v2.spec));
        if (serverUrl) {
            spec.servers = [
                { url: serverUrl, description: 'Current server' },
                ...(spec.servers?.filter(
                    (s) => s.description !== 'Current server'
                ) || []),
            ];
        }
        return spec;
    }

    // Load v2 spec
    const spec = loadV2Spec();

    // Extract and enrich with installed modules
    const installedModules = extractInstalledModules(appDefinition);
    if (installedModules.length > 0) {
        enrichSpecWithModules(spec, installedModules);
    }

    // Finalize spec
    finalizeSpec(spec, { serverUrl }, installedModules);

    // Cache result
    if (useCache) {
        cache.v2.spec = JSON.parse(JSON.stringify(spec));
        cache.v2.modules = modulesKey;
    }

    return spec;
}

/**
 * Generate OpenAPI spec (defaults to v2 for backwards compatibility)
 * @deprecated Use generateOpenApiSpecV1 or generateOpenApiSpecV2 instead
 * @param {Object} appDefinition - The app definition containing integrations
 * @param {Object} options - Generation options
 * @returns {Object} Complete OpenAPI specification
 */
function generateOpenApiSpec(appDefinition = null, options = {}) {
    return generateOpenApiSpecV2(appDefinition, options);
}

/**
 * Clear all cached specs
 */
function clearCache() {
    cache.v1.spec = null;
    cache.v1.modules = null;
    cache.v2.spec = null;
    cache.v2.modules = null;
    cache.legacy.spec = null;
    cache.legacy.modules = null;
}

/**
 * Get spec as YAML string
 * @param {Object} appDefinition - App definition
 * @param {Object} options - Options including version ('v1' or 'v2')
 * @returns {string} YAML string
 */
function generateOpenApiYaml(appDefinition = null, options = {}) {
    const { version = 'v2', ...restOptions } = options;
    const spec =
        version === 'v1'
            ? generateOpenApiSpecV1(appDefinition, restOptions)
            : generateOpenApiSpecV2(appDefinition, restOptions);
    return yaml.dump(spec);
}

module.exports = {
    // Primary exports for v1/v2
    generateOpenApiSpecV1,
    generateOpenApiSpecV2,

    // Legacy/utility exports
    generateOpenApiSpec,
    generateOpenApiYaml,
    clearCache,
    extractModuleMetadata,

    // Internal utilities (exported for testing)
    loadBaseSpec,
    loadV1Spec,
    loadV2Spec,
    enrichSpecWithModules,
};
