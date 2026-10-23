/**
 * One runtime, two front doors: a defineIntegration class and an ADR-063 integration document compile to the same
 * target (static Definition + this.events on IntegrationBase), so the document front door can embed a document in a
 * defineIntegration class, and both kinds of trigger share one ADR-055 trigger list.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

const documents = require('../../definitions');
const { defineIntegration, use } = require('..');
const hubspot = require('./fixtures/hubspot');
const slack = require('./fixtures/slack');

const manifests = documents.loadManifests();

describe('one runtime, two front doors', () => {
    it('the document front door has names of its own; the first names are aliases until Stack B merges', () => {
        expect(documents.fromDefinitionDocument).toBe(documents.defineIntegrationClass);
        expect(documents.definitionDocumentHost).toBe(documents.defineSharedIntegrationClass);
        expect(documents.embedDefinitionDocument).toBe(documents.extendIntegrationClass);
    });

    it('a defineIntegration class embeds a document: its own extensions and triggers stay, the document adds its workflows', async () => {
        const sweep = jest.fn();
        const DealAlerts = defineIntegration({
            name: 'deal-alerts',
            modules: { hubspot: use(hubspot, { webhooks: { subscribe: ['deal.creation'] } }), slack: use(slack) },
            triggers: { sweep: { every: '1h', handler: sweep } },
        });
        // The same integration written as a document (hubspot-slack.definition.json), under this class's name.
        const doc = JSON.parse(JSON.stringify(documents.loadExamples().find((x) => x.id === 'hubspot-slack')));
        doc.id = 'deal-alerts';
        const Embedded = documents.embedDefinitionDocument(DealAlerts, { definition: doc, manifests, runs: false });

        expect(Embedded.prototype).toBeInstanceOf(DealAlerts);
        expect(Embedded.Definition.name).toBe('deal-alerts');
        expect(Embedded.Definition.extensions).toBe(DealAlerts.Definition.extensions);
        const names = (await Embedded.triggersFor({ config: { type: 'deal-alerts' } })).map((t) => t.name);
        // The code trigger, and the document's schedule-triggered workflow that is on by default (weekly-digest is off).
        expect(names).toEqual(['sweep', 'WF_TASK_REMINDERS']);
    });
});
