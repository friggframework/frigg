const moment = require('moment');
const LHWorker = require('../../base/LHWorker.js');
const Integration = require('../../base/models/Integration');
const QueuerUtil = require('../../utils/QueuerUtil');
const { debug } = require('../../utils/logger');

class MondayQueuer extends LHWorker {
    constructor(params) {
        super(params);
        this.integrationMO = new Integration();
    }

    async _run(params) {
        // Get monday integrations that are ENABLED
        // For each one, queue up the CrossbeamPollWorker
        // For now... default 1 hour. Need to pull this from some config variable

        const oneHourAgo = moment(Date.now()).subtract(1, 'h');
        debug("Ahh, Monday.com Queuer Hungry! What's there to eat?");

        const integrations = await this.integrationMO.list({
            'config.type': 'monday',
            status: 'ENABLED',
        });

        debug(
            `Monday.com Queuer found ${integrations.length} integrations to eat.`
        );

        for (const integration of integrations) {
            if (integration.config.useMasterBoards) {
                debug(
                    'Master Boards configured for this here integration. Gonna queue that fella up.'
                );
                const SQSSendBody = {
                    worker: 'CrossbeamPollWorker',
                    message: {
                        QueueUrl: process.env.CROSSBEAM_POLL_WORKER_QUEUE,
                        integrationId: integration.id,
                        pollType: 'PARTNER_RECORDS_POLL',
                        startDate: oneHourAgo,
                    },
                };

                debug(
                    `Queuing with the following body ${JSON.stringify(
                        SQSSendBody
                    )}`
                );
                const res = await QueuerUtil.enqueue(SQSSendBody);
                debug(`Queue result: ${JSON.stringify(res)}`);
            }
            if (integration.config.reports) {
                debug('Ooo fun we have some reports to sync!');
                const reports = this.getParam(
                    integration.config,
                    'reports',
                    {}
                );
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
                    debug(
                        `Queuing with the following body ${JSON.stringify(
                            SQSSendBody
                        )}`
                    );
                    const res = await QueuerUtil.enqueue(SQSSendBody);
                    debug(`Queue result: ${JSON.stringify(res)}`);
                }
            }
        }

        debug('Okay, all done!');
        return true;
    }

    async _validateParams(params) {}
}

module.exports = MondayQueuer;
