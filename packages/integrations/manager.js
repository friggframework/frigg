const { loadInstalledModules, Delegate } = require('@friggframework/core');
const { Integration } = require('./model');
const { IntegrationMapping } = require('./integration-mapping');

class IntegrationManager {
    static Config = {
        name: 'Integration Name',
        version: '0.0.0', // Integration Version, used for migration and storage purposes, as well as display
        supportedVersions: [], // Eventually usable for deprecation and future test version purposes

        // an array of events that are process(able) by this Integration
        events: [],
    };

    constructor(params) {
        this.delegateTypes = [];
        this.userActions = [];
    }

    //psuedo delegate for backwards compatability
    async receiveNotification(notifier, delegateString, object = null) {

    }

    async notify(delegateString, object = null) {
        if (!this.delegateTypes.includes(delegateString)) {
            throw new Error(
                `delegateString:${delegateString} is not defined in delegateTypes`
            );
        }
        return this.receiveNotification(
                this,
                delegateString,
                object
        );
    }



    static getName() {
        return this.Config.name;
    }

    static getCurrentVersion() {
        return this.Config.version;
    }

    async validateConfig() {
        const configOptions = await this.getConfigOptions();
        const currentConfig = this.integration.config;
        let needsConfig = false;
        for (const option of configOptions) {
            if (option.required) {
                // For now, just make sure the key exists. We should add more dynamic/better validation later.
                if (
                    !Object.prototype.hasOwnProperty.call(
                        currentConfig,
                        option.key
                    )
                ) {
                    needsConfig = true;
                    this.integration.messages.warnings.push({
                        title: 'Config Validation Error',
                        message: `Missing required field of ${option.label}`,
                        timestamp: Date.now(),
                    });
                }
            }
        }
        if (needsConfig) {
            this.integration.status = 'NEEDS_CONFIG';
            await this.integration.save();
        }
    }

    async testAuth() {
        let didAuthPass = true;

        try {
            await this.primaryInstance.testAuth();
        } catch {
            didAuthPass = false;
            this.integration.messages.errors.push({
                title: 'Authentication Error',
                message: `There was an error with your ${this.primaryInstance.constructor.getName()} Entity.
                Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                timestamp: Date.now(),
            });
        }

        try {
            await this.targetInstance.testAuth();
        } catch {
            didAuthPass = false;
            this.integration.messages.errors.push({
                title: 'Authentication Error',
                message: `There was an error with your ${this.targetInstance.constructor.getName()} Entity.
            Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                timestamp: Date.now(),
            });
        }

        if (!didAuthPass) {
            this.integration.status = 'ERROR';
            this.integration.markModified('messages.error');
            await this.integration.save();
        }
    }

    async getMapping(sourceId) {
        return IntegrationMapping.findBy(this.record.id, sourceId);
    }

    async upsertMapping(sourceId, mapping) {
        if (!sourceId) {
            throw new Error(`sourceId must be set`);
        }
        return await IntegrationMapping.upsert(
            this.record.id,
            sourceId,
            mapping
        );
    }


    // Children must implement
    async processCreate() {
        throw new Error(
            'processCreate method not implemented in child Manager'
        );
    }

    async processDelete() {
        throw new Error(
            'processDelete method not implemented in child Manager'
        );
    }

    async processUpdate() {
        throw new Error(
            'processUpdate method not implemented in child Manager'
        );
    }

    async getConfigOptions() {
        throw new Error(
            'getConfigOptions method not implemented in child Manager'
        );
    }

    async getUserActions() {
        // override to return dynamic actions
        return [];
    }
}

module.exports = { IntegrationManager };
