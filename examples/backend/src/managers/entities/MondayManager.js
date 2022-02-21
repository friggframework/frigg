const { ACCOUNT_BOARD_NAME, LEAD_BOARD_NAME } =
    require('../../constants/StringConstants').crossbeamMondayBoards;
const ParentManager = require('../../modules/Monday/Manager.js');
const { debug } = require('../../utils/logger');

class MondayManager extends ParentManager {
    constructor(params) {
        return super(params);
    }

    async batchCreateSyncObjects(syncObjects, syncManager) {
        debug('Monday.com batchCreateSyncObjects called');
        if (syncObjects.length === 0) {
            debug(
                `No ${syncManager.SyncObjectClass.Config.name} found for syncing`
            );
            return;
        }
        const results = [];
        if (syncManager.SyncObjectClass.Config.name === 'AccountSync') {
            const integrationBoards = syncManager.integration.config.boards;
            const accountBoard = integrationBoards.find(
                (board) => board.boardName === ACCOUNT_BOARD_NAME
            );
            const { boardId } = accountBoard;
            for (const syncObject of syncObjects) {
                const data = syncObject.reverseModuleMap(
                    this.constructor.getName()
                );

                const columnValues = {
                    'Account Name': data.accountName,
                    Domain: data.domain,
                    Partner: data.partner,
                    'Partner Population': data.partnerPopulation,
                    Population: data.population,
                };

                const response = await this.api.createItem({
                    boardId,
                    itemName: data.accountName,
                    columnValues,
                });
                if (response.data.errors)
                    debug(
                        `Error creating Account record ${
                            syncObject.dataIdentifier
                        }: ${JSON.stringify(response.data.errors)}`
                    );
                const result = await syncManager.confirmCreate(
                    syncObject,
                    response.data.create_item.id,
                    this
                );
                results.push(result);
            }
        }

        if (syncManager.SyncObjectClass.Config.name === 'LeadSync') {
            const integrationBoards = syncManager.integration.config.boards;
            const leadBoard = integrationBoards.find(
                (board) => board.boardName === LEAD_BOARD_NAME
            );
            const { boardId } = leadBoard;
            for (const syncObject of syncObjects) {
                const data = syncObject.reverseModuleMap(
                    this.constructor.getName()
                );
                const columnValues = {
                    'First Name': data.firstName,
                    'Last Name': data.lastName,
                    Email: data.email,
                    Title: data.title,
                    Partner: data.partner,
                    'Partner Population': data.partnerPopulation,
                    Population: data.population,
                };

                const response = await this.api.createItem({
                    boardId,
                    itemName: `${data.firstName} ${data.lastName}`,
                    columnValues,
                });
                if (response.data.errors)
                    debug(
                        `Error creating Lead record ${
                            syncObject.dataIdentifier
                        }: ${JSON.stringify(response.data.errors)}`
                    );
                const result = await syncManager.confirmCreate(
                    syncObject,
                    response.data.create_item.id,
                    this
                );
                results.push(result);
            }
        }
        if (syncManager.SyncObjectClass.Config.name === 'ReportRecordSync') {
            const reportConfig = syncManager.integration.config.reports;
            for (const syncObject of syncObjects) {
                const specificReportConfig =
                    reportConfig[syncObject.data.reportId];
                const boardId = specificReportConfig.mondayBoardId;
                const { columns } = specificReportConfig;
                const { data } = syncObject;
                const itemName = data.record_name;
                const columnValues = {
                    overlaps_with: data.partnerNames.join(', '),
                };
                for (const column of data.data) {
                    const createdFieldId = `${column.organization_id}_${column.source_field_id}`;
                    columnValues[columns[createdFieldId].mondayColumnId] =
                        column.value;
                }

                const query = `mutation {
      create_item (board_id: ${boardId}, item_name: ${JSON.stringify(
                    itemName
                )}, column_values: ${JSON.stringify(
                    JSON.stringify(columnValues)
                )}) {
        id }}`;
                const response = await this.api.query({ query });
                if (response.data.errors)
                    debug(
                        `Error creating ReportItem record ${
                            syncObject.dataIdentifier
                        }: ${JSON.stringify(response.data.errors)}`
                    );
                const result = await syncManager.confirmCreate(
                    syncObject,
                    response.data.create_item.id,
                    this
                );
                results.push(result);
            }
        }

        return results;
    }

    async batchUpdateSyncObjects(syncObjects, syncManager) {
        debug('Monday.com batchUpdateSyncObjects called');
        if (syncObjects.length === 0) {
            debug(
                `No ${syncManager.SyncObjectClass.Config.name} found for syncing`
            );
            return;
        }
        const results = [];
        if (syncManager.SyncObjectClass.Config.name === 'AccountSync') {
            const integrationBoards = syncManager.integration.config.boards;
            const accountBoard = integrationBoards.find(
                (board) => board.boardName === ACCOUNT_BOARD_NAME
            );
            const { boardId } = accountBoard;
            for (const syncObject of syncObjects) {
                const data = syncObject.reverseModuleMap(
                    this.constructor.getName()
                );

                const columnValues = {
                    'Acount Name': data.accountName,
                    Domain: data.domain,
                    Partner: data.partner,
                    'Partner Population': data.partnerPopulation,
                    Population: data.population,
                };

                const response = await this.api.updateItem({
                    boardId,
                    itemId: syncObject.dataIdentifier,
                    columnValues,
                });
                if (response.errors)
                    debug(
                        `Error updating Account record ${
                            syncObject.dataIdentifier
                        }: ${JSON.stringify(response.data.errors)}`
                    );
                const result = await syncManager.confirmUpdate(syncObject);
                results.push(result);
            }
        }

        if (syncManager.SyncObjectClass.Config.name === 'LeadSync') {
            const integrationBoards = syncManager.integration.config.boards;
            const leadBoard = integrationBoards.find(
                (board) => board.boardName === LEAD_BOARD_NAME
            );
            const { boardId } = leadBoard;
            for (const syncObject of syncObjects) {
                const data = syncObject.reverseModuleMap(
                    this.constructor.getName()
                );
                const columnValues = {
                    'First Name': data.firstName,
                    'Last Name': data.lastName,
                    Email: data.email,
                    Title: data.title,
                    Partner: data.partner,
                    'Partner Population': data.partnerPopulation,
                    Population: data.population,
                };

                const response = await this.api.updateItem({
                    boardId,
                    itemId: syncObject.dataIdentifier,
                    columnValues,
                });
                if (response.data.errors)
                    debug(
                        `Error updating Lead record ${
                            syncObject.dataIdentifier
                        }: ${JSON.stringify(response.data.errors)}`
                    );
                const result = await syncManager.confirmUpdate(syncObject);
                results.push(result);
            }
        }
        if (syncManager.SyncObjectClass.Config.name === 'ReportRecordSync') {
            const reportConfig = syncManager.integration.config.reports;
            for (const syncObject of syncObjects) {
                const specificReportConfig =
                    reportConfig[syncObject.data.reportId];
                const boardId = specificReportConfig.mondayBoardId;
                const { columns } = specificReportConfig;
                const { data } = syncObject;
                const itemId = syncObject.dataIdentifier;
                const columnValues = {
                    overlaps_with: data.partnerNames.join(', '),
                };
                for (const column of data.data) {
                    const createdFieldId = `${column.organization_id}_${column.source_field_id}`;
                    columnValues[columns[createdFieldId].mondayColumnId] =
                        column.value;
                }

                const query = `mutation {
      change_multiple_column_values (board_id: ${boardId}, item_id: ${itemId}, column_values: ${JSON.stringify(
                    JSON.stringify(columnValues)
                )}) {
        id }}`;
                const response = await this.api.query({ query });
                if (response.data.errors)
                    debug(
                        `Error updating ReportItem record ${
                            syncObject.dataIdentifier
                        }: ${JSON.stringify(response.data.errors)}`
                    );
                const result = await syncManager.confirmUpdate(syncObject);
                results.push(result);
            }
        }

        return results;
    }
}

module.exports = MondayManager;
