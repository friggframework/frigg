const lodashGet = require('lodash.get');

const get = (o, key, defaultValue) => {
    const value = lodashGet(o, key, defaultValue);

    if (value !== undefined) {
        return value;
    }

    if (defaultValue === undefined) {
        throw new Error(`Parameters Error: ${key} is a required parameter`);
    }

    return defaultValue;
};

const getAllRequired = (o, requiredKeys) => {
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
}

module.exports = { get, getAllRequired }
