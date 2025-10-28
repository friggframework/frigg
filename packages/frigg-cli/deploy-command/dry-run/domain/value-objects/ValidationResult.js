class ValidationResult {
    constructor({ valid, errors = [], warnings = [], metadata = {} }) {
        if (typeof valid !== 'boolean') {
            throw new Error('valid must be a boolean');
        }

        this._valid = valid;
        this._errors = Object.freeze([...errors]);
        this._warnings = Object.freeze([...warnings]);
        this._metadata = Object.freeze({ ...metadata });

        Object.freeze(this);
    }

    get valid() {
        return this._valid;
    }

    get errors() {
        return this._errors;
    }

    get warnings() {
        return this._warnings;
    }

    get metadata() {
        return this._metadata;
    }

    hasErrors() {
        return this._errors.length > 0;
    }

    hasWarnings() {
        return this._warnings.length > 0;
    }

    toObject() {
        return {
            valid: this._valid,
            errors: [...this._errors],
            warnings: [...this._warnings],
            metadata: { ...this._metadata },
        };
    }

    static success(metadata = {}) {
        return new ValidationResult({ valid: true, errors: [], warnings: [], metadata });
    }

    static failure(errors, warnings = [], metadata = {}) {
        return new ValidationResult({ valid: false, errors, warnings, metadata });
    }

    static withWarnings(warnings, metadata = {}) {
        return new ValidationResult({ valid: true, errors: [], warnings, metadata });
    }
}

module.exports = { ValidationResult };
