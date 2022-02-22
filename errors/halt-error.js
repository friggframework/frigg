const { BaseError } = require('./base-error');

class HaltError extends BaseError {
    constructor(message, ...errorOptions) {
        super(message, ...errorOptions);
        this.isHaltError = true;
    }
}

module.exports = { HaltError };
