const GeneralUtil = require('./GeneralUtil');
const Boom = require('@hapi/boom');

class RouterUtil {
    constructor() {
        // ...
    }

    static checkRequiredParams(params, requiredKeys) {
        const missingKeys = [];
        const returnDict = {};
        for (const key of requiredKeys) {
            const val = GeneralUtil.getParam(params, key, null);
            if (val) {
                returnDict[key] = val;
            } else {
                missingKeys.push(key);
            }
        }

        if (missingKeys.length > 0) {
            throw Boom.badRequest(
                `Missing Parameter${
                    missingKeys.length == 1 ? '' : 's'
                }: ${missingKeys.join(', ')} ${
                    missingKeys.length == 1 ? 'is' : 'are'
                } required.`
            );
        }
        return returnDict;
    }
}

module.exports = RouterUtil;
