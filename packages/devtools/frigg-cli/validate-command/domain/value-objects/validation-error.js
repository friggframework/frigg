const VALID_SEVERITIES = ['error', 'warning', 'info'];

class ValidationError {
    constructor({ path, message, severity, code, fix }) {
        if (!path) {
            throw new Error('path is required');
        }
        if (!message) {
            throw new Error('message is required');
        }
        if (severity && !VALID_SEVERITIES.includes(severity)) {
            throw new Error(`Invalid severity: ${severity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
        }

        this.path = path;
        this.message = message;
        this.severity = severity || 'error';
        this.code = code || null;
        this.fix = fix || null;
    }

    static create(props) {
        return new ValidationError(props);
    }

    getPathSegments() {
        return this.path
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .filter(Boolean);
    }

    getRootPath() {
        return this.getPathSegments()[0];
    }

    isError() {
        return this.severity === 'error';
    }

    isWarning() {
        return this.severity === 'warning';
    }

    isInfo() {
        return this.severity === 'info';
    }

    hasFix() {
        return this.fix !== null;
    }

    equals(other) {
        return this.path === other.path && this.message === other.message;
    }

    toJSON() {
        return {
            path: this.path,
            message: this.message,
            severity: this.severity,
            code: this.code,
            fix: this.fix ? this.fix.toJSON() : null
        };
    }
}

module.exports = { ValidationError };
