import { BaseError } from './base-error';

export interface RequiredPropertyErrorOptions {
    parent?: { name?: string };
    key?: string;
}

export class RequiredPropertyError extends BaseError {
    constructor(options: RequiredPropertyErrorOptions = {}, ...parentOptions: unknown[]) {
        const { parent, key = '' } = options;
        const parentText = parent?.name ? `(${parent.name}) ` : '';
        const message = `${parentText}Key "${key}" is a required parameter.`;
        super(message, ...(parentOptions as [ErrorOptions]));
    }
}

export interface ParameterTypeErrorOptions {
    parent?: { name?: string };
    key?: string;
    value?: string;
    expectedType?: { name?: string };
}

export class ParameterTypeError extends BaseError {
    constructor(options: ParameterTypeErrorOptions = {}, ...parentOptions: unknown[]) {
        const { parent, key = '', value = '', expectedType } = options;
        const parentText = parent?.name ? `(${parent.name}) ` : '';
        const keyText = key ? `key "${key}" with ` : '';
        const typeName = expectedType?.name ?? '';
        const message = `${parentText}Expected ${keyText}value "${value}" to be of type "${typeName}"`;
        super(message, ...(parentOptions as [ErrorOptions]));
    }
}
