const { IntegrationMapping } = require('./integration-mapping');

class IntegrationBase {
    /**
     * CHILDREN SHOULD SPECIFY A CONFIG
     */
    static Config = {
        name: 'Integration Name',
        version: '0.0.0', // Integration Version, used for migration and storage purposes, as well as display
        supportedVersions: [], // Eventually usable for deprecation and future test version purposes

        // an array of events that are process(able) by this Integration
        events: [],
    };

    static getName() {
        return this.Config.name;
    }

    static getCurrentVersion() {
        return this.Config.version;
    }

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

    async validateConfig() {
        const configOptions = await this.getConfigOptions();
        const currentConfig = this.record.config;
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
                    this.record.messages.warnings.push({
                        title: 'Config Validation Error',
                        message: `Missing required field of ${option.label}`,
                        timestamp: Date.now(),
                    });
                }
            }
        }
        if (needsConfig) {
            this.record.status = 'NEEDS_CONFIG';
            await this.record.save();
        }
    }

    async testAuth() {
        let didAuthPass = true;

        try {
            await this.primary.testAuth();
        } catch {
            didAuthPass = false;
            this.record.messages.errors.push({
                title: 'Authentication Error',
                message: `There was an error with your ${this.primary.constructor.getName()} Entity.
                Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                timestamp: Date.now(),
            });
        }

        try {
            await this.target.testAuth();
        } catch {
            didAuthPass = false;
            this.record.messages.errors.push({
                title: 'Authentication Error',
                message: `There was an error with your ${this.target.constructor.getName()} Entity.
            Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                timestamp: Date.now(),
            });
        }

        if (!didAuthPass) {
            this.record.status = 'ERROR';
            this.record.markModified('messages.error');
            await this.record.save();
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

    async getAndSetUserActions() {
        this.userActions = await this.getUserActions();
        if (this.record?.config) {
            this.record.config.userActions = this.userActions;
            await this.record.save();
        }
        return this.userActions;
    }



    /**
     * CHILDREN CAN OVERRIDE THESE CONFIGURATION METHODS
     */
    async onCreate(params) {
        this.record.status = 'ENABLED';
        await this.record.save();
        return this.record;
    }

    async onUpdate(params) {
    }

    async onDelete(params) { }

    async getConfigOptions() {
        const options = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    async refreshConfigOptions(params) {
        const options = {
            jsonSchema: {},
            uiSchema: {},
        }
        return options
    }

    async getUserActions() {
        return [];
    }

    async getActionOptions() {
        const options = {
            jsonSchema: {},
            uiSchema: {},
        }
        return options
    }

    async refreshActionOptions(params) {
        const options = {
            jsonSchema: {},
            uiSchema: {},
        }
        return options
    }
}

module.exports = { IntegrationBase };
