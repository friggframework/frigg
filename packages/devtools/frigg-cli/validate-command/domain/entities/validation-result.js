class ValidationResult {
    constructor({ errors, context }) {
        this.errors = errors || [];
        this.context = context || {};
    }

    static create(props = {}) {
        return new ValidationResult(props);
    }

    isValid() {
        return !this.errors.some(e => e.isError());
    }

    getErrors() {
        return this.errors.filter(e => e.isError());
    }

    getWarnings() {
        return this.errors.filter(e => e.isWarning());
    }

    getInfos() {
        return this.errors.filter(e => e.isInfo());
    }

    addError(error) {
        this.errors.push(error);
        return this;
    }

    merge(other) {
        return ValidationResult.create({
            errors: [...this.errors, ...other.errors],
            context: { ...this.context, ...other.context }
        });
    }

    getContext() {
        return this.context;
    }

    filterByPath(pathPrefix) {
        return ValidationResult.create({
            errors: this.errors.filter(e => e.path.startsWith(pathPrefix)),
            context: this.context
        });
    }

    getBySeverity(severity) {
        return this.errors.filter(e => e.severity === severity);
    }

    getSummary() {
        return {
            isValid: this.isValid(),
            errorCount: this.getErrors().length,
            warningCount: this.getWarnings().length,
            infoCount: this.getInfos().length,
            totalCount: this.errors.length
        };
    }

    toJSON() {
        return {
            valid: this.isValid(),
            errors: this.errors.map(e => e.toJSON()),
            summary: this.getSummary(),
            context: this.context
        };
    }
}

module.exports = { ValidationResult };
