const { BaseError } = require('./base-error');

/**
 * ClientSafeError - An error that is safe to expose to end users
 *
 * Use this error class when the error message does not contain sensitive
 * implementation details and can be safely shown to users.
 *
 * Examples:
 * - "Invalid Token: Token is expired"
 * - "User not found"
 * - "Invalid credentials"
 *
 * @param {string} message - The user-safe error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {object} options - Additional error options (cause, etc.)
 */
class ClientSafeError extends BaseError {
    constructor(message, statusCode = 400, options) {
        super(message, options);
        this.statusCode = statusCode;
        this.isClientSafe = true;
    }
}

module.exports = { ClientSafeError };
