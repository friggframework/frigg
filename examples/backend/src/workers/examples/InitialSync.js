const moment = require('moment');
const LHWorker = require('../../base/LHWorker.js');
const SyncManager = require('../../managers/SyncManager.js');
const { debug } = require('../../utils/logger');
const { HaltError } = require('../../errors/HaltError');
const IntegrationManager = require('../../managers/integrations/RollWorksIntegrationManager.js');

class InitialSyncWorker extends LHWorker {
    constructor(params) {
        super(params);
    }

    async _run(params) {
        const integration = await IntegrationManager.getIntegration(
            params.integration_id
        );
        if (!integration) {
            throw new HaltError('Integration not found');
        }
        const res = await SyncManager.startSync(
            params.integration_id,
            params.start_date,
            params.initial_sync
        );
        if (integration.polling && integration.ongoingSync) {
            debug('Launching ongoing sync');
            const delay_minutes = parseInt(process.env.POLLING_DELAY);
            params.start_date = moment()
                .subtract(delay_minutes, 'minutes')
                .toISOString();
            const delay = delay_minutes * 60;
            params.QueueName = process.env.QUEUE1;
            params.initial_sync = false;
            await this.send(params, delay);
        }
        return res;
    }

    async _validateParams(params) {
        this._verifyParamExists(params, 'integration_id');
        this._verifyParamExists(params, 'start_date');
    }
}

module.exports = InitialSyncWorker;
