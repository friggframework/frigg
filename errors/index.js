const { BaseError } = require('./BaseError');
const { FetchError } = require('./FetchError');
const { HaltError } = require('./HaltError');
const {
    RequiredPropertyError,
    ParameterTypeError,
} = require('./ValidationErrors');

module.exports = {
    BaseError,
    FetchError,
    HaltError,
    RequiredPropertyError,
    ParameterTypeError,
};
