const IntegrationManager = require('../../managers/IntegrationManager');
const { get, getAndVerifyType } = require('core-packages/assertions');

class Options {
    constructor(params) {
        this.integrationManager = getAndVerifyType(
            params,
            'integrationManager',
            IntegrationManager
        );
        this.fromVersion = get(params, 'fromVersion');
        this.toVersion = get(params, 'toVersion');
        this.generalFunctions = get(params, 'generalFunctions', []);
        this.perIntegrationFunctions = get(
            params,
            'perIntegrationFunctions',
            []
        );
    }

    get() {
        return {
            type: this.integrationManager.getName(),
            fromVersion: this.fromVersion,
            toVersion: this.toVersion,
            generalFunctions: this.generalFunctions,
            perIntegrationFunctions: this.perIntegrationFunctions,
        };
    }
}

module.exports = Options;
