const {DomainException} = require('../exceptions/DomainException');
const crypto = require('crypto');

/**
 * IntegrationId Value Object
 * Unique identifier for integrations
 */
class IntegrationId {
    constructor(value) {
        if (value) {
            // Use provided ID
            if (typeof value !== 'string' || value.length === 0) {
                throw new DomainException('Integration ID must be a non-empty string');
            }
            this._value = value;
        } else {
            // Generate new ID
            this._value = crypto.randomUUID();
        }
    }

    get value() {
        return this._value;
    }

    equals(other) {
        if (!(other instanceof IntegrationId)) {
            return false;
        }
        return this._value === other._value;
    }

    toString() {
        return this._value;
    }

    static generate() {
        return new IntegrationId();
    }
}

module.exports = {IntegrationId};
