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
        this.display.name = get(params.display, 'label');
        this.display.description = get(params.display, 'description');
        this.display.detailsUrl = get(params.display, 'detailsUrl');
        this.display.icon = get(params.display, 'icon');
    }

    get() {
        // Extract module names from the modules object to determine required entities
        const requiredEntities = this.modules
            ? Object.keys(this.modules)
            : [];

        return {
            type: this.module.definition.getName(),

            // Flag for if the User can configure any settings
            hasUserConfig: this.hasUserConfig,

            // Array of module/entity type names required for this integration (e.g., ['nagaris', 'creditorwatch'])
            // UI uses this to check if user has connected the necessary accounts before creating integration
            requiredEntities: requiredEntities,

            // this is information required for the display side of things on the front end
            display: this.display,
        };
    }
}

module.exports = { Options };
