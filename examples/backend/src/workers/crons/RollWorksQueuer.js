const moment = require('moment');
const LHWorker = require('../../base/LHWorker.js');
const Integration = require('../../base/models/Integration');
const QueuerUtil = require('../../utils/QueuerUtil');
const { debug } = require('../../utils/logger');

class RollWorksQueuer extends LHWorker {
    constructor(params) {
        super(params);
        this.integrationMO = new Integration();
    }

    async _run(params) {
        // Get rollworks integrations that are ENABLED
        // For each one, queue up the CrossbeamPollWorker
        // For now... default 1 hour. Need to pull this from some config variable

        debug("Ahh, RollWorks Queuer Hungry! What's there to eat?", params);
        const oneHourAgo = moment(Date.now()).subtract(1, 'h');

        const integrations = await this.integrationMO.list({
            'config.type': 'rollworks',
            status: 'ENABLED',
        });

        debug(
            `RollWorks Queuer found ${integrations.length} integrations to eat.`
        );

        for (const integration of integrations) {
            const reports = this.getParam(integration.config, 'reports', {});
            for (const reportId in reports) {
                const SQSSendBody = {
                    worker: 'CrossbeamPollWorker',
                    message: {
                        QueueUrl: process.env.CROSSBEAM_POLL_WORKER_QUEUE,
                        integrationId: integration.id,
                        reportId,
                        pollType: 'REPORT_DATA_POLL',
                        startDate: oneHourAgo,
                    },
                };
                await this.runOne(SQSSendBody);
            }
        }

        debug('Okay, all done!');
        return true;
    }

    async runOne(SQSSendBody) {
        await QueuerUtil.enqueue(SQSSendBody);
    }

    async _validateParams(params) {}
}

module.exports = RollWorksQueuer;
