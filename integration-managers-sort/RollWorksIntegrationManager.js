const { IntegrationManager } = require('@friggframework/integrations');

class RollWorksIntegrationManager extends IntegrationManager {
    static Config = {
        name: 'rollworks',
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
        if (event === 'EXAMPLE_EVENT') {
            return this.syncReportToRollWorks(object);
        }
    }

    /**
     * ALL CUSTOM/OPTIONAL METHODS FOR AN INTEGRATION MANAGER
     */

    async getTargetAccountLists() {
        return this.targetInstance.api.getTargetAccount();
    }

    /**
     * ALL REQUIRED METHODS FOR AN INTEGRATION MANAGER
     */

    async processCreate(params) {
        // Validate that we have all of the data we need
        // Set integration status as makes sense. Default ENABLED
        this.integration.status = 'NEEDS_CONFIG';
        return this.integration.save();
    }

    async processUpdate(params) {
        const newConfig = get(params, 'config');
        const oldConfig = this.integration.config;

        const { status } = this.integration;
        const advertisable_eid = get(newConfig, 'advertisable_eid', '');
        const reportConfig = get(newConfig, 'reports', []);
        const reportObject = {};

        for (const index in reportConfig) {
            const reportRow = reportConfig[index];
            reportObject[reportRow.id] = {
                name: reportRow.name,
            };
        }

        const updated_advertisable_eid =
            advertisable_eid === '' ? null : advertisable_eid;
        const updated_reports =
            Object.keys(reportObject).length === 0 ? null : reportObject;
        let newStatus = status;

        if (
            status === 'NEEDS_CONFIG' &&
            updated_advertisable_eid !== null &&
            updated_reports !== null
        ) {
            newStatus = 'ENABLED';
        } else if (
            status === 'ENABLED' &&
            (updated_advertisable_eid === null || updated_reports === null)
        ) {
            newStatus = 'NEEDS_CONFIG';
        }
        this.integration.status = newStatus;
        this.integration.config.advertisable_eid = updated_advertisable_eid;
        this.integration.config.reports = updated_reports;
        this.integration.markModified('config');
        await this.integration.save();
    }

    async processDelete(params) {}

    async getConfigOptions() {
        const options = [
            {
                key: 'advertisable_eid',
                label: 'Advertisable ID',
                required: true,
                inputType: 'input',
                helperText:
                    'Your Advertisable EID grabbed from the URL in RollWorks',
                type: 'String',
            },
            {
                key: 'reports',
                label: 'Report Configuration',
                required: true,
                type: 'Array',
                inputType: 'select',
                helperText:
                    'Select reports to sync to Target Account Lists in RollWorks',
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
                        rollworksTargetAccountListName: {
                            label: 'RollWorks List Name',
                            type: 'String',
                            required: false,
                            hidden: true,
                        },
                        rollworksTargetAccountListId: {
                            label: 'RollWorks List Id',
                            type: 'String',
                            required: false,
                            hidden: true,
                        },
                    },
                },
            },
        ];

        // const availableTargetAccountLists = await this.getTargetAccountLists();

        const jsonSchema = {
            // "title": "Authorization Credentials",
            // "description": "A simple form example.",
            type: 'object',
            required: ['advertisable_eid'],
            properties: {
                advertisable_eid: {
                    type: 'string',
                    title: 'Advertisable EID',
                },
                reports: {
                    type: 'array',
                    title: 'Reports',
                    items: {
                        type: 'number',

                        enum: [1231, 12435, 19948],
                        enumNames: [
                            'Bear Sightings Last 30 days',
                            'Moose sightings yesterday',
                            'dog',
                        ],
                    },
                    uniqueItems: true,
                },
            },
        };
        const uiSchema = {
            advertisable_eid: {
                'ui:help':
                    'Your Advertisable EID grabbed from the URL in RollWorks',
                'ui:placeholder': 'ASDKFJ13240SDKF3',
            },
            reports: {
                'ui:widget': 'checkboxes',
                'ui:help': 'Select the Reports you want',
            },
        };
        return {
            jsonSchema,
            uiSchema,
        };
    }
}

module.exports = RollWorksIntegrationManager;
