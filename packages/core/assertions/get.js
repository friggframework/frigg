const lodashGet = require('lodash.get');
const {
    RequiredPropertyError,
    ParameterTypeError,
} = require('../errors');

const get = (o, key, defaultValue) => {
    const value = lodashGet(o, key, defaultValue);

    if (value !== undefined) {
        return value;
    }

    if (defaultValue === undefined) {
        throw new RequiredPropertyError({
            parent: this,
            key,
        });
    }

    return defaultValue;
};

const getAll = (o, requiredKeys) => {
    const missingKeys = [];
    const returnDict = {};

    for (const key of requiredKeys) {
        const val = lodashGet(o, key);

        if (val) {
            returnDict[key] = val;
        } else {
            missingKeys.push(key);
        }
    }

    if (missingKeys.length > 0) {
        throw new Error(
            `Missing Parameter${
                missingKeys.length == 1 ? '' : 's'
            }: ${missingKeys.join(', ')} ${
                missingKeys.length == 1 ? 'is' : 'are'
            } required.`
        );
    }

    return returnDict;
};

const getAndVerifyType = (params, strKey, classType, defaultValue) => {
    const val = get(params, strKey, defaultValue);

    if (Array.isArray(val)) {
        // then check that each of the items in the array are of the classType
        for (const index in val) {
            if (
                (val[index].prototype &&
                    !(val[index].prototype instanceof classType)) ||
                (!val[index].prototype && !(val[index] instanceof classType))
            ) {
                throw new ParameterTypeError({
                    parent: this,
                    key: `${strKey}[${index}]`,
                    value: val,
                    expectedType: classType.constructor,
                });
            }
        }
    } else if (
        (val.prototype && !(val.prototype instanceof classType)) ||
        (!val.prototype && !(val instanceof classType))
    ) {
        throw new ParameterTypeError({
            parent: this,
            key: strKey,
            value: val,
            expectedType: classType.constructor,
        });
    }
    return val;
};

const getArrayParamAndVerifyParamType = (
    params,
    strKey,
    paramType,
    defaultValue
) => {
    const val = get(params, strKey, defaultValue);

    if (Array.isArray(val)) {
        for (const index in val) {
            getParamAndVerifyParamType(val, index, paramType, defaultValue);
        }
    } else {
        throw new ParameterTypeError({
            parent: this,
            key: strKey,
            value: val,
            expectedType: Array,
        });
    }
    return val;
};

const getParamAndVerifyParamType = (
    params,
    strKey,
    paramType,
    defaultValue
) => {
    const val = get(params, strKey, defaultValue);

    if (Array.isArray(val)) {
        throw new Error(`${strKey} should not be an array`);
    }
    verifyType(val, paramType);
    return val;
};

const verifyType = (val, paramType) => {
    if (typeof val !== paramType) {
        throw new ParameterTypeError({
            parent: this,
            value: val,
            expectedType: paramType,
        });
    }
};

module.exports = {
    get,
    getAll,
    verifyType,
    getParamAndVerifyParamType,
    getArrayParamAndVerifyParamType,
    getAndVerifyType,
};
