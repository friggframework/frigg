module.exports = {
    data: [
        {
            type: 'task',
            id: 1,
            attributes: {
                action: 'action_item',
                autoskipAt: null,
                compiledSequenceTemplateHtml: null,
                completed: false,
                completedAt: null,
                createdAt: '2021-10-21T18:49:12.000Z',
                dueAt: '2021-10-21T18:49:03.000Z',
                note: 'Do it you will',
                opportunityAssociation: 'recent_created',
                scheduledAt: null,
                state: 'incomplete',
                stateChangedAt: null,
                taskType: 'manual',
                updatedAt: '2021-10-21T18:49:12.000Z',
            },
            relationships: {
                account: {
                    data: {
                        type: 'account',
                        id: 12,
                    },
                },
                call: {
                    data: null,
                },
                calls: {
                    links: {
                        related:
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=1',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=1',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=1',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=1',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=1',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=1',
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
                        id: 12,
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
                        id: 4,
                    },
                },
                template: {
                    data: null,
                },
            },
            links: {
                self: 'https://api.outreach.io/api/v2/tasks/1',
            },
        },
        {
            type: 'task',
            id: 2,
            attributes: {
                action: 'email',
                autoskipAt: null,
                compiledSequenceTemplateHtml: null,
                completed: false,
                completedAt: null,
                createdAt: '2021-10-29T15:00:56.000Z',
                dueAt: '2021-10-29T15:00:56.000Z',
                note: null,
                opportunityAssociation: null,
                scheduledAt: null,
                state: 'incomplete',
                stateChangedAt: null,
                taskType: 'manual',
                updatedAt: '2021-10-29T15:00:56.000Z',
            },
            relationships: {
                account: {
                    data: {
                        type: 'account',
                        id: 1,
                    },
                },
                call: {
                    data: null,
                },
                calls: {
                    links: {
                        related:
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=2',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=2',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=2',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=2',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=2',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=2',
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
                        id: 1,
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
                self: 'https://api.outreach.io/api/v2/tasks/2',
            },
        },
        {
            type: 'task',
            id: 3,
            attributes: {
                action: 'email',
                autoskipAt: null,
                compiledSequenceTemplateHtml: null,
                completed: false,
                completedAt: null,
                createdAt: '2021-10-29T15:10:21.000Z',
                dueAt: '2021-10-29T15:10:21.000Z',
                note: null,
                opportunityAssociation: null,
                scheduledAt: null,
                state: 'incomplete',
                stateChangedAt: null,
                taskType: 'manual',
                updatedAt: '2021-10-29T15:10:21.000Z',
            },
            relationships: {
                account: {
                    data: {
                        type: 'account',
                        id: 1,
                    },
                },
                call: {
                    data: null,
                },
                calls: {
                    links: {
                        related:
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=3',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=3',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=3',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=3',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=3',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=3',
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
                        id: 1,
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
                self: 'https://api.outreach.io/api/v2/tasks/3',
            },
        },
        {
            type: 'task',
            id: 4,
            attributes: {
                action: 'email',
                autoskipAt: null,
                compiledSequenceTemplateHtml: null,
                completed: false,
                completedAt: null,
                createdAt: '2021-10-29T15:10:32.000Z',
                dueAt: '2021-10-29T15:10:32.000Z',
                note: null,
                opportunityAssociation: null,
                scheduledAt: null,
                state: 'incomplete',
                stateChangedAt: null,
                taskType: 'manual',
                updatedAt: '2021-10-29T15:10:32.000Z',
            },
            relationships: {
                account: {
                    data: {
                        type: 'account',
                        id: 1,
                    },
                },
                call: {
                    data: null,
                },
                calls: {
                    links: {
                        related:
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=4',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=4',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=4',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=4',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=4',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=4',
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
                        id: 1,
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
                self: 'https://api.outreach.io/api/v2/tasks/4',
            },
        },
        {
            type: 'task',
            id: 5,
            attributes: {
                action: 'email',
                autoskipAt: null,
                compiledSequenceTemplateHtml: null,
                completed: false,
                completedAt: null,
                createdAt: '2021-10-29T15:10:53.000Z',
                dueAt: '2021-10-29T15:10:53.000Z',
                note: null,
                opportunityAssociation: null,
                scheduledAt: null,
                state: 'incomplete',
                stateChangedAt: null,
                taskType: 'manual',
                updatedAt: '2021-10-29T15:10:53.000Z',
            },
            relationships: {
                account: {
                    data: {
                        type: 'account',
                        id: 1,
                    },
                },
                call: {
                    data: null,
                },
                calls: {
                    links: {
                        related:
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=5',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=5',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=5',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=5',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=5',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=5',
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
                        id: 1,
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
                self: 'https://api.outreach.io/api/v2/tasks/5',
            },
        },
        {
            type: 'task',
            id: 6,
            attributes: {
                action: 'email',
                autoskipAt: null,
                compiledSequenceTemplateHtml: null,
                completed: false,
                completedAt: null,
                createdAt: '2021-10-29T15:11:07.000Z',
                dueAt: '2021-10-29T15:11:07.000Z',
                note: null,
                opportunityAssociation: null,
                scheduledAt: null,
                state: 'incomplete',
                stateChangedAt: null,
                taskType: 'manual',
                updatedAt: '2021-10-29T15:14:35.000Z',
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
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=6',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=6',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=6',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=6',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=6',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=6',
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
                self: 'https://api.outreach.io/api/v2/tasks/6',
            },
        },
        {
            type: 'task',
            id: 7,
            attributes: {
                action: 'email',
                autoskipAt: null,
                compiledSequenceTemplateHtml: null,
                completed: false,
                completedAt: null,
                createdAt: '2021-10-29T16:05:44.000Z',
                dueAt: '2021-10-29T16:05:44.000Z',
                note: null,
                opportunityAssociation: null,
                scheduledAt: null,
                state: 'incomplete',
                stateChangedAt: null,
                taskType: 'manual',
                updatedAt: '2021-10-29T16:05:44.000Z',
            },
            relationships: {
                account: {
                    data: {
                        type: 'account',
                        id: 1,
                    },
                },
                call: {
                    data: null,
                },
                calls: {
                    links: {
                        related:
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=7',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=7',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=7',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=7',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=7',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=7',
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
                        id: 1,
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
                self: 'https://api.outreach.io/api/v2/tasks/7',
            },
        },
        {
            type: 'task',
            id: 8,
            attributes: {
                action: 'email',
                autoskipAt: null,
                compiledSequenceTemplateHtml: null,
                completed: false,
                completedAt: null,
                createdAt: '2021-10-29T17:27:05.000Z',
                dueAt: '2021-10-29T17:27:05.000Z',
                note: null,
                opportunityAssociation: null,
                scheduledAt: null,
                state: 'incomplete',
                stateChangedAt: null,
                taskType: 'manual',
                updatedAt: '2021-10-29T17:27:05.000Z',
            },
            relationships: {
                account: {
                    data: {
                        type: 'account',
                        id: 1,
                    },
                },
                call: {
                    data: null,
                },
                calls: {
                    links: {
                        related:
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=8',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=8',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=8',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=8',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=8',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=8',
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
                        id: 1,
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
                self: 'https://api.outreach.io/api/v2/tasks/8',
            },
        },
        {
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
                updatedAt: '2021-11-06T02:52:48.000Z',
            },
            relationships: {
                account: {
                    data: {
                        type: 'account',
                        id: 1,
                    },
                },
                call: {
                    data: null,
                },
                calls: {
                    links: {
                        related:
                            'https://api.outreach.io/api/v2/calls?filter%5Btask%5D%5Bid%5D=31',
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
                            'https://api.outreach.io/api/v2/mailings?filter%5Btask%5D%5Bid%5D=31',
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
                            'https://api.outreach.io/api/v2/emailAddresses?filter%5Btask%5D%5Bid%5D=31',
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
                            'https://api.outreach.io/api/v2/phoneNumbers?filter%5Btask%5D%5Bid%5D=31',
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
                            'https://api.outreach.io/api/v2/sequenceSteps?filter%5Btask%5D%5Bid%5D=31',
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
                            'https://api.outreach.io/api/v2/templates?filter%5Btask%5D%5Bid%5D=31',
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
                        id: 1,
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
                self: 'https://api.outreach.io/api/v2/tasks/31',
            },
        },
    ],
    meta: {
        count: 9,
        count_truncated: false,
    },
};
