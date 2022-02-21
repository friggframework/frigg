const moment = require('moment');
const LHWorker = require('../../base/LHWorker.js');
const SyncManager = require('../../managers/SyncManager.js');
const IntegrationManager = require('../../managers/integrations/IntegrationManager.js');

class WebhookWorker extends LHWorker {
    constructor(params) {
        super(params);
    }

    async _run(params) {
        const integration = await IntegrationManager.getIntegration(
            params.integration_id
        );
        const changes = {};
        if (params.switch === 'on') {
            changes.webhooks = await SyncManager.subscribeToWebHooks(
                params.integration_id
            );
        } else if (params.switch === 'off') {
            const deleted = await SyncManager.unsubscribeFromWebHooks(
                params.integration_id
            );
            changes.webhooks = [];
        } else {
            throw new Error('Invalid switch value');
        }
        const updatedIntegration = await IntegrationManager.updateIntegrations(
            params.integration_id,
            changes
        );
        return updatedIntegration;
        // if(!integration){
        //     throw new HaltError("Integration not found");
        // }
        // let res = await SyncManager.startSync(params.integration_id, params.start_date, params.initial_sync);
        // if(integration.polling && integration.ongoingSync){
        //     let delay_minutes = parseInt(process.env.POLLING_DELAY);
        //     params.start_date = moment().subtract(delay_minutes, 'minutes').toISOString();
        //     let delay = delay_minutes * 60;
        //     params.QueueName = process.env.QUEUE1;
        //     params.initial_sync = false;
        //     await this.send(params, delay);
        // }
        // return res;
    }

    async _validateParams(params) {
        this._verifyParamExists(params, 'integration_id');
        this._verifyParamExists(params, 'switch');
    }
}

module.exports = WebhookWorker;
