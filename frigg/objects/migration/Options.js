const LHBaseClass = require('../../LHBaseClass');
const LHIntegrationManager = require('../../managers/LHIntegrationManager');

class Options extends LHBaseClass {
    constructor(params) {
        super(params);

        this.integrationManager = this.getParamAndVerifyType(
            params,
            'integrationManager',
            LHIntegrationManager
        );
        this.fromVersion = this.getParam(params, 'fromVersion');
        this.toVersion = this.getParam(params, 'toVersion');
        this.generalFunctions = this.getParam(params, 'generalFunctions', []);
        this.perIntegrationFunctions = this.getParam(
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
