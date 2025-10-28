class DryRunStatus {
    static CODES = {
        SUCCESS: 0,
        VALIDATION_ERROR: 1,
        WARNING: 2,
    };

    constructor(code, message = '') {
        if (!Object.values(DryRunStatus.CODES).includes(code)) {
            throw new Error(`Invalid status code: ${code}`);
        }

        this._code = code;
        this._message = message;

        Object.freeze(this);
    }

    get code() {
        return this._code;
    }

    get message() {
        return this._message;
    }

    isSuccess() {
        return this._code === DryRunStatus.CODES.SUCCESS;
    }

    hasWarnings() {
        return this._code === DryRunStatus.CODES.WARNING;
    }

    hasErrors() {
        return this._code === DryRunStatus.CODES.VALIDATION_ERROR;
    }

    toObject() {
        return {
            code: this._code,
            message: this._message,
            success: this.isSuccess(),
        };
    }

    static success(message = 'Dry-run completed successfully') {
        return new DryRunStatus(DryRunStatus.CODES.SUCCESS, message);
    }

    static withWarnings(message = 'Dry-run completed with warnings') {
        return new DryRunStatus(DryRunStatus.CODES.WARNING, message);
    }

    static validationError(message = 'Dry-run failed validation') {
        return new DryRunStatus(DryRunStatus.CODES.VALIDATION_ERROR, message);
    }
}

module.exports = { DryRunStatus };
