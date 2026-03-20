export class BaseError extends Error {
    constructor(message?: string, options?: ErrorOptions, ...moreOptions: unknown[]) {
        super(message, options);

        if (options?.cause) {
            this.cause = options.cause;
        }

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BaseError);
        }

        this.name = this.constructor?.name;
    }
}
