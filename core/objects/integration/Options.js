const ModuleManager = require('../../managers/ModuleManager');
const {
    RequiredPropertyError,
} = require('@friggframework/errors/ValidationErrors');
const { get, getAndVerifyType } = require('@friggframework/assertions');

class Options {
    constructor(params) {
        this.module = getAndVerifyType(params, 'module', ModuleManager);
        this.integrations = getAndVerifyType(
            params,
            'integrations',
            ModuleManager
        );
        this.isMany = Boolean(get(params, 'isMany', false));
        this.hasUserConfig = Boolean(get(params, 'hasUserConfig', false));
        this.requiresNewEntity = Boolean(
            get(params, 'requiresNewEntity', false)
        );
        if (!params.display) {
            throw new RequiredPropertyError({
                parent: this,
                key: 'display',
            });
        }

        this.display = {};
        this.display.name = get(params.display, 'name');
        this.display.description = get(params.display, 'description');
        this.display.detailsUrl = get(params.display, 'detailsUrl');
        this.display.icon = get(params.display, 'icon');
        this.keys = get(params, 'keys', []);
    }

    get() {
        return {
            type: this.module.getName(),

            // list of entities the module can connect to
            integrations: this.integrations.map((val) => val.getName()),

            // list of special data required to make an entity i.e. a shop id. This information should be sent back
            keys: this.keys,

            // Flag for if the User can configure any settings
            hasUserConfig: this.hasUserConfig,

            // if this integration can be used multiple times with the same integration pair. For example I want to
            // connect two different Etsy shops to the same Freshbooks account.
            isMany: this.isMany,

            // if this is true it means we need to create a new entity for every integration pair and not use an
            // existing one. This would be true for scenarios where the client wishes to have individual control over
            // the integerations it has connected to its app. They would want this to let their users only delete
            // single integrations without notifying our server.
            requiresNewEntity: this.requiresNewEntity,

            // this is information required for the display side of things on the front end
            display: this.display,

            // this is information for post-authentication config, using jsonSchema and uiSchema for display on the frontend
            // Maybe include but probably not, I like making someone make a follow-on request
            // configOptions: this.configOptions,
        };
    }
}

module.exports = Options;
