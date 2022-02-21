const { BaseError } = require('./BaseError');

class HaltError extends BaseError {
    constructor(message, ...errorOptions) {
        super(message, ...errorOptions);
        this.isHaltError = true;
    }
}

module.exports = { HaltError };
