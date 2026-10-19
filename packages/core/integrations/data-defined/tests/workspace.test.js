/**
 * Integrations a workspace builds (The Integrator's "build your own"): published by a signed-in user into their own
 * workspace, listed and installable there like any other, invisible to everyone else, and read back for the editor.
 */
const express = require('express');
const request = require('supertest');
const d = require('..');
const { setDataDefinedRoutes } = require('../router');
const { resolveIntegrationClass, listIntegrationClasses } = require('../../integration-types');
const { CreateIntegration } = require('../../use-cases/create-integration');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));

/** The repository contract (definition-version-repository.js), in memory. */
function memoryRepository() {
    const rows = [];
    let n = 0;
    const copy = (r) => (r ? JSON.parse(JSON.stringify(r)) : null);
    return {
        rows,
        async findVersion(id, version) { return copy(rows.find((r) => r.definitionId === id && r.version === version)); },
        async listVersions(id) { return rows.filter((r) => r.definitionId === id).map(copy); },
        async listByStatus(statuses) { return rows.filter((r) => statuses.includes(r.status)).map(({ document, ...r }) => copy(r)); },
        async createVersion(data) { const row = { ...copy(data), id: String(++n) }; rows.push(row); return copy(row); },
        async updateIfStatus(id, version, from, data) { const r = rows.find((x) => x.definitionId === id && x.version === version && x.status === from); if (!r) return null; Object.assign(r, copy(data)); return copy(r); },
    };
}

class FakeBase {
    constructor(p = {}) { this.events = {}; this.config = p.config; this.id = p.id; }
    async initialize() {}
    registerEventHandlers() {}
    static getDeploymentName() { return (this.Host || this).Definition.name; }
}
class CodeOne extends FakeBase { static Definition = { name: 'code-one', modules: {} }; static getOptionDetails() { return { type: 'code-one' }; } }

function setup() {
    const repository = memoryRepository();
    const catalog = d.createDefinitionCatalog({ repository });
    const Host = d.defineSharedIntegrationClass({ definitions: catalog, manifests, modules: { quo: {}, hubspot: {}, github: {}, linear: {}, slack: {} }, IntegrationBase: FakeBase, runs: false });
    const classes = [CodeOne, Host];
    const app = (userId) => {
        const a = express();
        a.use(express.json());
        setDataDefinedRoutes(a, { execute: async () => ({ getId: () => userId }) }, { getIntegrationInstance: { execute: async () => null }, integrationClasses: classes });
        a.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message })); // eslint-disable-line no-unused-vars
        return a;
    };
    return { repository, catalog, classes, app };
}

const own = (over = {}) => ({ ...example('github-linear'), id: 'acme-issues', version: '1.0.0', ...over });

describe("a workspace's own integrations", () => {
    it('a signed-in user publishes one into their workspace; it then lists and installs there like any other', async () => {
        const { app, classes, repository } = setup();
        await new d.PublishDefinitionVersion({ repository, manifests }).execute({ document: example('quo-hubspot') });   // the app's catalogue
        const r = await request(app('u-acme')).post('/api/integration-definitions').send({ document: own() });
        expect(r.status).toBe(201);
        expect(r.body.version).toMatchObject({ definitionId: 'acme-issues', workspaceId: 'u-acme', createdBy: 'u-acme', status: 'PUBLISHED' });
        expect(r.body.version.document).toBeUndefined();

        const mine = (await listIntegrationClasses(classes, { workspaceId: 'u-acme' })).map((c) => c.getOptionDetails());
        expect(mine.map((o) => [o.type, Boolean(o.editable)])).toEqual([['code-one', false], ['acme-issues', true], ['quo-hubspot', false]]);
        expect((await resolveIntegrationClass(classes, 'acme-issues', { workspaceId: 'u-acme' })).Definition.name).toBe('acme-issues');
    });

    it('no one else can see, install or read it; an existing installation still hydrates', async () => {
        const { app, classes } = setup();
        await request(app('u-acme')).post('/api/integration-definitions').send({ document: own() });
        expect((await listIntegrationClasses(classes, { workspaceId: 'u-other' })).map((c) => c.Definition.name)).toEqual(['code-one']);
        expect(await resolveIntegrationClass(classes, 'acme-issues', { workspaceId: 'u-other' })).toBeNull();
        expect((await resolveIntegrationClass(classes, 'acme-issues')).Definition.name).toBe('acme-issues');   // the worker hydrating by id
        expect((await request(app('u-other')).get('/api/data-defined/definitions')).body.definitions).toEqual([]);
        expect((await request(app('u-acme')).get('/api/data-defined/definitions')).body.definitions.map((x) => x.id)).toEqual(['acme-issues']);
        const read = await request(app('u-other')).get('/api/integration-definitions/acme-issues');
        expect(read.status).toBe(404);

        const create = new CreateIntegration({ integrationRepository: { findIntegrationsByUserId: async () => [], createIntegration: async () => { throw new Error('must not create'); } }, integrationClasses: classes, moduleFactory: {} });
        await expect(create.execute(['e1'], 'u-other', { type: 'acme-issues' })).rejects.toThrow('No integration class found for type: acme-issues');
    });

    it("the provider itself hides another workspace's integration, even from a store that lists everything", async () => {
        const doc = own();
        const store = { ...d.memoryDefinitions([doc]), list: async () => [{ id: doc.id, version: doc.version, display: doc.display, modules: { github: 'github', linear: 'linear', slack: 'slack' }, workspaceId: 'u-acme' }], ownerOf: async () => 'u-acme' };
        const Host = d.defineSharedIntegrationClass({ definitions: store, manifests, modules: { github: {}, linear: {}, slack: {} }, IntegrationBase: FakeBase, runs: false });
        expect((await listIntegrationClasses([Host], { workspaceId: 'u-other' })).map((c) => c.Definition.name)).toEqual([]);
        expect((await listIntegrationClasses([Host], { workspaceId: 'u-acme' })).map((c) => c.Definition.name)).toEqual(['acme-issues']);
    });

    it('the editor reads every version, drafts included, and the newest document', async () => {
        const { app } = setup();
        await request(app('u-acme')).post('/api/integration-definitions').send({ document: own() });
        await request(app('u-acme')).post('/api/integration-definitions').send({ document: own({ version: '1.1.0', display: { ...own().display, label: 'Acme issues v2' } }), publish: false });
        const r = await request(app('u-acme')).get('/api/integration-definitions/acme-issues');
        expect(r.status).toBe(200);
        expect(r.body.versions.map((v) => [v.version, v.status])).toEqual([['1.1.0', 'DRAFT'], ['1.0.0', 'PUBLISHED']]);
        expect(r.body.document.display.label).toBe('Acme issues v2');
    });

    it("an id has one owner: not another workspace's, not the app's catalogue, not a code integration's", async () => {
        const { app, repository } = setup();
        await new d.PublishDefinitionVersion({ repository, manifests }).execute({ document: example('quo-hubspot') });
        await request(app('u-acme')).post('/api/integration-definitions').send({ document: own() });
        const taken = async (userId, document) => { const r = await request(app(userId)).post('/api/integration-definitions').send({ document }); return [r.status, r.body.code]; };
        expect(await taken('u-other', own({ version: '2.0.0' }))).toEqual([409, 'ID_TAKEN']);
        expect(await taken('u-acme', { ...example('quo-hubspot'), version: '9.0.0' })).toEqual([409, 'ID_TAKEN']);
        expect(await taken('u-acme', own({ id: 'code-one' }))).toEqual([409, 'ID_TAKEN']);
        expect(await taken('u-acme', own({ version: '1.0.1' }))).toEqual([201, undefined]);   // its own next version is fine
    });
});
