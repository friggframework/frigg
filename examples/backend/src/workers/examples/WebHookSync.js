const LHWorker = require('../../base/LHWorker.js');
const SyncManager = require('../../base/managers/LHSyncManager.js');

class WebHookSyncWorker extends LHWorker {
    constructor(params) {
        super(params);
    }

    async _run(params) {
        return SyncManager.webHookHandler(params.integration_id, params.obj);
    }

    async _validateParams(params) {
        this._verifyParamExists(params, 'integration_id');
        this._verifyParamExists(params, 'obj');
    }
}

module.exports = WebHookSyncWorker;
