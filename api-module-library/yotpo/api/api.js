const { get } = require('@friggframework/assertions');
const { appDeveloperApi } = require('./appDeveloperApi');
const { coreApi } = require('./coreApi');
const { loyaltyApi } = require('./loyaltyApi');
const { UGCApi } = require('./UGCApi');

class Api {
    constructor(params) {
        this.appDeveloperApi = new appDeveloperApi(params);
        this.coreApi = new coreApi(params);
        this.loyaltyApi = new loyaltyApi(params);
        this.UGCApi = new UGCApi(params);
    }
}

module.exports = { Api };
