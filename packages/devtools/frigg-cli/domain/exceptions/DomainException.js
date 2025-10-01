/**
 * Base exception for domain-level errors
 */
class DomainException extends Error {
    constructor(message) {
        super(message);
        this.name = 'DomainException';
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationException extends DomainException {
    constructor(errors) {
        const message = Array.isArray(errors) ? errors.join(', ') : errors;
        super(message);
        this.name = 'ValidationException';
        this.errors = Array.isArray(errors) ? errors : [errors];
    }
}

module.exports = {
    DomainException,
    ValidationException
};
