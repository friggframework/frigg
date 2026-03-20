import { BaseError } from './base-error';

export class HaltError extends BaseError {
    isHaltError: boolean;

    constructor(message?: string, ...errorOptions: unknown[]) {
        super(message, ...(errorOptions as [ErrorOptions]));
        this.isHaltError = true;
    }
}
