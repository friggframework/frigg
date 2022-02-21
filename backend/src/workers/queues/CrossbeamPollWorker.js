const moment = require('moment');
const LHWorker = require('../../base/LHWorker.js');
const IntegrationFactory = require('../../managers/integrations/IntegrationManager.js');
const { HaltError } = require('../../errors/HaltError');

const events = {
    newPartnerData: 'NEW_PARTNER_DATA', // Partner Records
    newReportData: 'NEW_REPORT_DATA', // Report Data
};

class CrossbeamPollWorker extends LHWorker {
    constructor(params) {
        super(params);
    }

    async _run(params) {
        const { integrationId, startDate, pollType, reportId } = params;
        let integrationManagerInstance;
        try {
            integrationManagerInstance =
                await IntegrationFactory.getInstanceFromIntegrationId({
                    integrationId,
                });
        } catch (e) {
            if (e.message.includes('No integration found by the ID of')) {
                throw new HaltError('Integration was disconnected', {
                    cause: e,
                });
            } else {
                throw e;
            }
        }

        if (pollType === 'PARTNER_RECORDS_POLL') {
            const partnerData =
                await integrationManagerInstance.primaryInstance.listAllPartnerRecords();
            // Some filter for the startDate... or filter in request?
            let filteredParnerData;
            if (startDate) {
                filteredParnerData = partnerData.filter((data) =>
                    moment(data.overlap_time).isAfter(startDate)
                );
            } else {
                filteredParnerData = partnerData;
            }
            await integrationManagerInstance.notify(
                events.newPartnerData,
                filteredParnerData
            );
        }

        if (pollType === 'REPORT_DATA_POLL') {
            const reportData =
                await integrationManagerInstance.primaryInstance.listAllReportData(
                    reportId
                );
            // Some filter for the startDate
            let filteredReportData;
            if (startDate) {
                filteredReportData = reportData.filter((data) =>
                    moment(data.overlap_time).isAfter(startDate)
                );
            } else {
                filteredReportData = reportData;
            }
            const finalReportData = {
                items: filteredReportData,
                report_id: reportId,
            };
            await integrationManagerInstance.notify(
                events.newReportData,
                finalReportData
            );
        }
    }

    async _validateParams(params) {
        this._verifyParamExists(params, 'integrationId');
        this._verifyParamExists(params, 'pollType');
    }
}

module.exports = CrossbeamPollWorker;
