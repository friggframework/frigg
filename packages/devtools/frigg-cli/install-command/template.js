const path = require('path');

function getIntegrationTemplate(apiModuleName, backendPath, ApiClass) {
    // Find the sample data method
    const apiMethods = Object.getOwnPropertyNames(ApiClass.prototype);
    const sampleDataMethod =
        apiMethods.find(
            (method) =>
                method.toLowerCase().includes('search') ||
                method.toLowerCase().includes('list') ||
                method.toLowerCase().includes('get')
        ) || 'searchDeals';

    return `const { get, IntegrationBase, Options } = require('@friggframework/core');
const { Definition: ${apiModuleName}Module, Config: defaultConfig } = require('@friggframework/api-module-${apiModuleName.toLowerCase()}');

class ${apiModuleName}Integration extends IntegrationBase {
    static Config = {
        name: defaultConfig.name || '${apiModuleName.toLowerCase()}',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        events: ['SEARCH_DEALS'],
    };

    static Options =
        new Options({
            module: ${apiModuleName}Module,
            integrations: [${apiModuleName}Module],
            display: {
                name: defaultConfig.displayName || '${apiModuleName}',
                description: defaultConfig.description || 'Sales & CRM, Marketing',
                category: defaultConfig.category || 'Sales & CRM, Marketing',
                detailsUrl: defaultConfig.detailsUrl || 'https://www.${apiModuleName.toLowerCase()}.com',
                icon: defaultConfig.icon || 'https://friggframework.org/assets/img/${apiModuleName.toLowerCase()}.jpeg',
            },
            hasUserConfig: true,
        });

    static modules = {
        ${apiModuleName.toLowerCase()}: ${apiModuleName}Module,
    }

    /**
     * HANDLE EVENTS
     */
    async receiveNotification(notifier, event, object = null) {
        if (event === 'SEARCH_DEALS') {
            return this.target.api.searchDeals(object);
        }
    }

    /**
     * ALL CUSTOM/OPTIONAL METHODS FOR AN INTEGRATION MANAGER
     */
    async getSampleData() {
        const res = await this.target.api.${sampleDataMethod}();
        return { data: res };
    }

    /**
     * ALL REQUIRED METHODS FOR AN INTEGRATION MANAGER
     */
    async onCreate(params) {
        // Validate that we have all of the data we need
        // Set integration status as makes sense. Default ENABLED
        // TODO turn this into a validateConfig method/function
        this.record.status = 'ENABLED';
        await this.record.save();
        return this.record;
    }

    async onUpdate(params) {
        const newConfig = get(params, 'config');
        const oldConfig = this.record.config;
        // Just save whatever
        this.record.markModified('config');
        await this.record.save();
        return this.validateConfig();
    }

    async getConfigOptions() {
        const options = {}
        return options;
    }
}

module.exports = ${apiModuleName}Integration;`;
}

module.exports = { getIntegrationTemplate };
