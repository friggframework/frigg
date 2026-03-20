import { BaseError } from './base-error';

export class ClientSafeError extends BaseError {
    statusCode: number;
    isClientSafe: boolean;

    constructor(message?: string, statusCode = 400, options?: ErrorOptions) {
        super(message, options);
        this.statusCode = statusCode;
        this.isClientSafe = true;
    }
}
