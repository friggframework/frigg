const { BaseError } = require('./base-error');

class MappingAlreadyExistsError extends BaseError {
    constructor(integrationId, sourceId, ...errorOptions) {
        super(
            `Mapping already exists for integration ${integrationId} and sourceId ${sourceId}`,
            ...errorOptions
        );
        this.integrationId = integrationId;
        this.sourceId = sourceId;
    }
}

module.exports = { MappingAlreadyExistsError };
