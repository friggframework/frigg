const {DomainException} = require('../exceptions/DomainException');

/**
 * IntegrationName Value Object
 * Ensures integration names follow kebab-case format
 */
class IntegrationName {
    constructor(value) {
        if (!value || typeof value !== 'string') {
            throw new DomainException('Integration name must be a non-empty string');
        }

        this._value = value;
        this._validate();
    }

    _validate() {
        const rules = [
            {
                test: () => /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(this._value),
                message: 'Name must be kebab-case (lowercase letters, numbers, and hyphens only)'
            },
            {
                test: () => this._value.length >= 2 && this._value.length <= 100,
                message: 'Name must be between 2 and 100 characters'
            },
            {
                test: () => !this._value.startsWith('-') && !this._value.endsWith('-'),
                message: 'Name cannot start or end with a hyphen'
            },
            {
                test: () => !this._value.includes('--'),
                message: 'Name cannot contain consecutive hyphens'
            }
        ];

        for (const rule of rules) {
            if (!rule.test()) {
                throw new DomainException(rule.message);
            }
        }
    }

    get value() {
        return this._value;
    }

    equals(other) {
        if (!(other instanceof IntegrationName)) {
            return false;
        }
        return this._value === other._value;
    }

    toString() {
        return this._value;
    }
}

module.exports = {IntegrationName};
