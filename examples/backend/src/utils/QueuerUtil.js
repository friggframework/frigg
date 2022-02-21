const GeneralUtil = require('./GeneralUtil');
const LHWorker = require('../base/LHWorker');
const { debug } = require('../utils/logger');

class QueuerUtil extends LHWorker {
    constructor(params) {
        super(params);
        // ...
    }

    static async enqueue(params) {
        const Queuer = new QueuerUtil();
        debug('Queuer invoked with params', params);

        const workerName = params.worker;
        switch (workerName) {
            case 'CrossbeamPollWorker':
                Queuer._verifyParamExists(params.message, 'integrationId');
                Queuer._verifyParamExists(params.message, 'pollType');
                break;
            default:
                break;
        }

        return await Queuer.send(params.message);
    }
}

module.exports = QueuerUtil;
