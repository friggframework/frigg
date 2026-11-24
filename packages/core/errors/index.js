const { BaseError } = require('./base-error');
const { FetchError } = require('./fetch-error');
const { HaltError } = require('./halt-error');
const { RateLimitError } = require('./rate-limit-error');
const {
    RequiredPropertyError,
    ParameterTypeError,
} = require('./validation-errors');
const { ClientSafeError } = require('./client-safe-error');
const {
    MappingAlreadyExistsError,
} = require('./mapping-already-exists-error');

module.exports = {
    BaseError,
    FetchError,
    HaltError,
    RateLimitError,
    RequiredPropertyError,
    ParameterTypeError,
    ClientSafeError,
    MappingAlreadyExistsError,
};
