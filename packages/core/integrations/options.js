const { RequiredPropertyError } = require('../errors');
const { get } = require('../assertions');

class Options {
    constructor(params) {
        this.module = get(params, 'module');
        this.modules = params.modules || {}; // Store modules for requiredEntities extraction
        this.hasUserConfig = Boolean(get(params, 'hasUserConfig', false));
        if (!params.display) {
            throw new RequiredPropertyError({
                parent: this,
                key: 'display',
            });
        }

        this.display = {};
        // Required fields
        this.display.name = get(params.display, 'label');
        this.display.description = get(params.display, 'description');
        // Optional fields - use defaults if not provided
        this.display.detailsUrl = params.display.detailsUrl || null;
        this.display.icon = params.display.icon || null;
    }

    get() {
        // Extract module names from the modules object to determine required entities
        const requiredEntities = this.modules
            ? Object.keys(this.modules)
            : [];

        // Get module type name - handle both getName() method and moduleName property
        const moduleType = this._getModuleTypeName();

        return {
            type: moduleType,

            // Flag for if the User can configure any settings
            hasUserConfig: this.hasUserConfig,

            // Array of module/entity type names required for this integration (e.g., ['nagaris', 'creditorwatch'])
            // UI uses this to check if user has connected the necessary accounts before creating integration
            requiredEntities: requiredEntities,

            // this is information required for the display side of things on the front end
            display: this.display,
        };
    }

    /**
     * Get the module type name from the module definition.
     * Supports both:
     * - getName() method (standard Frigg API modules)
     * - moduleName property (custom API modules)
     * @returns {string} The module type name
     * @private
     */
    _getModuleTypeName() {
        const definition = this.module?.definition;
        if (!definition) {
            return 'unknown';
        }

        // Try getName() method first (standard pattern)
        if (typeof definition.getName === 'function') {
            return definition.getName();
        }

        // Fall back to moduleName property
        if (definition.moduleName) {
            return definition.moduleName;
        }

        // Last resort - try name property
        if (definition.name) {
            return definition.name;
        }

        return 'unknown';
    }
}

module.exports = { Options };
