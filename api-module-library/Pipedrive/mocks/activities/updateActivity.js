module.exports = {
    data: {
        type: 'task',
        id: 31,
        attributes: {
            action: 'email',
            autoskipAt: null,
            compiledSequenceTemplateHtml: null,
            completed: false,
            completedAt: null,
            createdAt: '2021-11-06T02:52:48.000Z',
            dueAt: '2021-11-06T02:52:48.000Z',
            note: null,
            opportunityAssociation: null,
            scheduledAt: null,
            state: 'incomplete',
            stateChangedAt: null,
            taskType: 'manual',
            updatedAt: '2021-11-06T03:04:55.000Z',
        },
        relationships: {
            account: {
                data: {
                    type: 'account',
                    id: 3,
                },
            },
            call: {
                data: null,
            },
            calls: {
                links: {
                    related:
                        'https://api.pipedrive.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=31',
                },
            },
            completer: {
                data: null,
            },
            creator: {
                data: {
                    type: 'user',
                    id: 1,
                },
            },
            defaultPluginMapping: {
                data: null,
            },
            mailing: {
                data: null,
            },
            mailings: {
                links: {
                    related:
                        'https://api.pipedrive.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=31',
                },
            },
            opportunity: {
                data: null,
            },
            owner: {
                data: {
                    type: 'user',
                    id: 1,
                },
            },
            prospect: {
                data: null,
            },
            prospectAccount: {
                data: null,
            },
            prospectContacts: {
                data: [],
                links: {
                    related:
                        'https://api.pipedrive.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=31',
                },
                meta: {
                    count: 0,
                },
            },
            prospectOwner: {
                data: null,
            },
            prospectPhoneNumbers: {
                data: [],
                links: {
                    related:
                        'https://api.pipedrive.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=31',
                },
                meta: {
                    count: 0,
                },
            },
            prospectStage: {
                data: null,
            },
            sequence: {
                data: null,
            },
            sequenceSequenceSteps: {
                data: [],
                links: {
                    related:
                        'https://api.pipedrive.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=31',
                },
                meta: {
                    count: 0,
                },
            },
            sequenceState: {
                data: null,
            },
            sequenceStateSequenceStep: {
                data: null,
            },
            sequenceStateSequenceStepOverrides: {
                data: [],
                meta: {
                    count: 0,
                },
            },
            sequenceStateStartingTemplate: {
                data: null,
            },
            sequenceStep: {
                data: null,
            },
            sequenceStepOverrideTemplates: {
                data: [],
                links: {
                    related:
                        'https://api.pipedrive.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=31',
                },
                meta: {
                    count: 0,
                },
            },
            sequenceTemplate: {
                data: null,
            },
            sequenceTemplateTemplate: {
                data: null,
            },
            subject: {
                data: {
                    type: 'account',
                    id: 3,
                },
            },
            taskPriority: {
                data: {
                    type: 'taskPriority',
                    id: 3,
                },
            },
            taskTheme: {
                data: {
                    type: 'taskTheme',
                    id: 1,
                },
            },
            template: {
                data: null,
            },
        },
        links: {
            self: 'https://api.pipedrive.io/api/v2/tasks/31',
        },
    },
};
