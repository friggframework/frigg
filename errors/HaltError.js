const { LHError } = require('./LHError');

class HaltError extends LHError {
    constructor(message, ...errorOptions) {
        super(message, ...errorOptions);
        this.isHaltError = true;
    }
}

module.exports = { HaltError };
