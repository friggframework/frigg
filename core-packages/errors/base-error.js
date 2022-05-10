// See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#differentiate_between_similar_errors
class BaseError extends Error {
    constructor(message, options, ...moreOptions) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(message, options, ...moreOptions);

        // In the future `cause` will be handled by V8 in Node.js.  For now, add the property manually
        // See: https://v8.dev/features/error-cause
        if (options?.cause) {
            this.cause = options.cause;
        }

        // Maintains proper stack trace for where our error was thrown (method only available under V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BaseError);
        }

        // Set the error name for console output
        this.name = this.constructor?.name;
    }
}

module.exports = { BaseError };
