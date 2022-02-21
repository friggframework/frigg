const { LHError } = require('./LHError');

class RequiredPropertyError extends LHError {
    constructor(options = {}, ...parentOptions) {
        const { parent, key = '' } = options;
        const parentText = parent ? `(${parent.name}) ` : '';
        const message = `${parentText}Key "${key}" is a required parameter.`;
        super(message, ...parentOptions);
    }
}

class ParameterTypeError extends LHError {
    constructor(options = {}, ...parentOptions) {
        const { parent, key = '', value = '', expectedType } = options;
        const parentText = parent ? `(${parent.name}) ` : '';
        const keyText = key ? `key "${key}" with ` : '';
        const typeName = expectedType?.name ?? '';
        const message = `${parentText}Expected ${keyText}value "${value}" to be of type "${typeName}"`;
        super(message, ...parentOptions);
    }
}

module.exports = { RequiredPropertyError, ParameterTypeError };
