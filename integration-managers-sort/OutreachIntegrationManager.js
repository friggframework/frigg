const IntegrationManager = require('@friggframework/core/managers/IntegrationManager');

class OutreachIntegrationManager extends IntegrationManager {
    static Config = {
        name: 'outreach',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        events: ['EXAMPLE_EVENT'],
    };

    constructor(params) {
        super(params);
    }

    /**
     * HANDLE EVENTS
     */
    async receiveNotification(notifier, event, object = null) {
        this.primaryInstance = notifier.primaryInstance;
        this.targetInstance = notifier.targetInstance;
        this.integration = notifier.integration;
        if (event === 'EXAMPLE_EVENT') {
            return this.processReportData(object);
        }
    }

    /**
     * ALL CUSTOM/OPTIONAL METHODS FOR AN INTEGRATION MANAGER
     */

    /**
     * ALL REQUIRED METHODS FOR AN INTEGRATION MANAGER
     */
    async processCreate(params) {
        // Validate that we have all of the data we need
        // Set integration status as makes sense. Default ENABLED
        // TODO turn this into a validateConfig method/function
        this.integration.status = 'NEEDS_CONFIG';
        await this.integration.save();
    }

    async processUpdate(params) {
        const newConfig = get(params, 'config');
        const oldConfig = this.integration.config;
        if (!oldConfig.reports) this.integration.config.reports = {};
        const newReportConfig = get(newConfig, 'reports', []);
        const oldReportConfig = oldConfig.reports;

        // If useMasterBoards got updated, and the updated value is 'true', then it's the first time
        // So we create the boards and run the initial sync
        if (
            oldConfig.useMasterBoards !== newConfig.useMasterBoards &&
            newConfig.useMasterBoards
        ) {
            await this.findOrCreateCrossbeamMasterBoards();
            await this.queueMasterDataSync();
        }
        if (oldConfig.useMasterBoards !== newConfig.useMasterBoards) {
            this.integration.config.useMasterBoards = newConfig.useMasterBoards;
            await this.integration.save();
        }

        // for the selected/returned reports in the newConfig
        // check the existing reports object to see if we've synced before
        // If we haven't synced before, create the board and queue the first sync
        if (newReportConfig && newReportConfig.length > 0) {
            const keysToDelete = [];
            for (const [key] of Object.entries(oldReportConfig)) {
                // If we can't find the "key" (report ID) in the new config array, then we need to
                // delete the object key after the report stuff.
                if (!newReportConfig.some((report) => report.id === key))
                    keysToDelete.push(key);
            }
            for (const report of newReportConfig) {
                let mondayBoardId;
                if (!oldConfig.reports || !oldConfig.reports[report.id]) {
                    const createdBoard =
                        await this.findOrCreateCrossbeamReportBoard({
                            name: report.name,
                        });
                    mondayBoardId = createdBoard.id;
                    this.integration.config.reports[report.id] = {
                        name: report.name,
                        mondayBoardId,
                        mondayBoardName: createdBoard.name,
                        columns: {},
                    };
                } else {
                    this.integration.config.reports[report.id] =
                        oldConfig.reports[report.id];
                    mondayBoardId =
                        this.integration.config.reports[report.id]
                            .mondayBoardId;
                }
                const columns = await this.syncReportBoardColumns({
                    boardId: mondayBoardId,
                    reportId: report.id,
                });
                this.integration.config.reports[report.id].columns = columns;
                // Save right away and queue right away, in case they have a lot of reports they're syncing
                // Delete old keys
                for (const key of keysToDelete) {
                    delete this.integration.config.reports[key];
                }
                await this.integration.save();
                await this.queueReportSync({
                    reportId: report.id,
                });
            }
        } else {
            // No reports sent back, we should purge reports from the config
            this.integration.config.reports = {};
            await this.integration.save();
        }

        // Just save whatever
        this.integration.markModified('config');
        await this.integration.save();
        return this.validateConfig();
    }

    async processDelete(params) {}

    async getConfigOptions() {
        const options = [
            {
                key: 'useMasterBoards',
                label: 'Create and Sync Master Data Boards?',
                required: false,
                inputType: 'boolean',
                helperText: `Crossbeam will automatically create and sync data to "Crossbeam Company Data" and "Crossbeam People Data" boards with
                all available Partner overlap data and populations for use by your internal teams.`,
                type: 'Boolean',
            },
            {
                key: 'reports',
                label: 'Report Configuration',
                required: false,
                type: 'Array',
                inputType: 'select',
                helperText: `Every Report selected will automatically generate
                and sync data to a monday.com Board that can then be shared and collaborated
                on with your Partner(s)`,
                multi: true,
                items: {
                    type: 'Object',
                    label: 'Report',
                    properties: {
                        id: {
                            label: 'Report ID',
                            type: 'String',
                            required: true,
                        },
                        name: {
                            label: 'Report Name',
                            type: 'String',
                            required: true,
                        },
                        mondayBoardName: {
                            label: 'monday.com Board Name',
                            type: 'String',
                            required: false,
                            hidden: true,
                        },
                        mondayBoardId: {
                            label: 'monday.com Board Id',
                            type: 'String',
                            required: false,
                            hidden: true,
                        },
                    },
                },
            },
        ];
        return options;
    }

    async getSampleData() {
        const usersResponse = await this.targetInstance.api.listUsers();
        const slimResponse = usersResponse.data.map((u) => ({
            id: u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            email: u.email,
        }));
        return { data: slimResponse };
    }
}

module.exports = OutreachIntegrationManager;
