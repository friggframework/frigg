const {DomainException} = require('../exceptions/DomainException');
const semver = require('semver');

/**
 * SemanticVersion Value Object
 * Ensures versions follow semantic versioning
 */
class SemanticVersion {
    constructor(value) {
        if (!value || typeof value !== 'string') {
            throw new DomainException('Version must be a non-empty string');
        }

        if (!semver.valid(value)) {
            throw new DomainException(
                `Invalid semantic version: ${value}. Must follow format X.Y.Z (e.g., 1.0.0)`
            );
        }

        this._value = value;
        this._parsed = semver.parse(value);
    }

    get value() {
        return this._value;
    }

    get major() {
        return this._parsed.major;
    }

    get minor() {
        return this._parsed.minor;
    }

    get patch() {
        return this._parsed.patch;
    }

    get prerelease() {
        return this._parsed.prerelease;
    }

    equals(other) {
        if (!(other instanceof SemanticVersion)) {
            return false;
        }
        return this._value === other._value;
    }

    isGreaterThan(other) {
        if (!(other instanceof SemanticVersion)) {
            throw new DomainException('Can only compare with another SemanticVersion');
        }
        return semver.gt(this._value, other._value);
    }

    isLessThan(other) {
        if (!(other instanceof SemanticVersion)) {
            throw new DomainException('Can only compare with another SemanticVersion');
        }
        return semver.lt(this._value, other._value);
    }

    toString() {
        return this._value;
    }
}

module.exports = {SemanticVersion};
