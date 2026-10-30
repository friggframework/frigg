const { BaseError } = require('./base-error');
const { FetchError } = require('./fetch-error');
const { HaltError } = require('./halt-error');
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
    RequiredPropertyError,
    ParameterTypeError,
    ClientSafeError,
    MappingAlreadyExistsError,
};
