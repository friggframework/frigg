class GeneralUtil {
    constructor() {
        // ...
    }

    static getParam(params, strKey, defaultValue) {
        params = params || {};
        if (strKey in params) {
            return params[strKey];
        }
        if (defaultValue === undefined) {
            throw new Error(
                `Parameters Error : ${strKey} is a required parameter`
            );
        } else {
            return defaultValue;
        }
    }
}

module.exports = GeneralUtil;
