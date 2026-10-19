/**
 * Publishing, the catalogue and run history against real databases, through the real repositories and use cases.
 *
 * Skipped unless a database URL is set (the same convention as core's query-parity tests):
 * - DATA_DEFINED_POSTGRES_URL  a PostgreSQL database migrated with prisma-postgresql/migrations
 * - DATA_DEFINED_MONGO_URL     a MongoDB replica set with prisma-mongodb pushed
 */
const d = require('..');
const { DefinitionVersionRepositoryPostgres, DefinitionVersionRepositoryMongo } = require('../repositories/definition-version-repository');
const { WorkflowRunRepositoryPostgres, WorkflowRunRepositoryMongo } = require('../repositories/workflow-run-repository');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));

const LEGS = [
    ['postgresql', process.env.DATA_DEFINED_POSTGRES_URL, () => require('../../../generated/prisma-postgresql'), DefinitionVersionRepositoryPostgres, WorkflowRunRepositoryPostgres],
    ['mongodb', process.env.DATA_DEFINED_MONGO_URL, () => require('../../../generated/prisma-mongodb'), DefinitionVersionRepositoryMongo, WorkflowRunRepositoryMongo],
].filter(([, url]) => url);

const describeLegs = LEGS.length ? describe.each(LEGS) : describe.skip.each([['no database URL set', null]]);

describeLegs('data-defined persistence on %s', (_, url, loadClient, DefRepo, RunRepo) => {
    let client, repo, runs, integrationId;
    const publish = (document, opts = {}) => new d.PublishDefinitionVersion({ repository: repo, manifests }).execute({ document, ...opts });

    beforeAll(async () => {
        const { PrismaClient } = loadClient();
        client = new PrismaClient({ datasourceUrl: url });
        await client.workflowRun.deleteMany({});
        await client.integrationDefinitionVersion.deleteMany({});
        repo = new DefRepo({ client });
        runs = new RunRepo({ client });
        integrationId = String((await client.integration.create({ data: { config: { type: 'data-defined' } } })).id);
    });
    afterAll(async () => { await client?.$disconnect(); });

    it('publishes a first version: PUBLISHED, checksummed, served by the catalogue and named latest', async () => {
        const out = await publish(example('phone-hubspot'), { notes: 'first', createdBy: 'test' });
        expect(out).toMatchObject({ created: true, changeLevel: null });
        expect(out.version).toMatchObject({ definitionId: 'phone-hubspot', version: '1.4.0', status: 'PUBLISHED', previousVersion: null, notes: 'first' });
        expect(out.version.checksum).toBe(d.checksum ? d.checksum(example('phone-hubspot')) : require('../canonical').checksum(example('phone-hubspot')));
        const catalog = d.createDefinitionCatalog({ repository: repo });
        expect((await catalog.get('phone-hubspot', '1.4.0')).id).toBe('phone-hubspot');
        expect((await catalog.latest('phone-hubspot')).version).toBe('1.4.0');
    });

    it('re-publishing the same document is a no-op; changing a published version is refused', async () => {
        expect((await publish(example('phone-hubspot'))).created).toBe(false);
        const changed = example('phone-hubspot'); changed.display.label = 'Changed';
        await expect(publish(changed)).rejects.toMatchObject({ status: 409, code: 'IMMUTABLE' });
    });

    it('refuses a bump smaller than the change, accepts the right one, and records its level and predecessor', async () => {
        const v = example('phone-hubspot'); v.version = '1.5.0'; v.syncs[0].identity.match[0].transform = 'trim';   // identity change: major
        await expect(publish(v)).rejects.toMatchObject({ status: 409, code: 'BUMP_TOO_SMALL', details: { required: 'major' } });
        v.version = '2.0.0';
        const out = await publish(v);
        expect(out.version).toMatchObject({ version: '2.0.0', changeLevel: 'major', previousVersion: '1.4.0' });
        const older = example('phone-hubspot'); older.version = '1.9.0';
        await expect(publish(older)).rejects.toMatchObject({ code: 'NOT_NEWER' });
    });

    it('refuses an invalid document, reporting each layer', async () => {
        const bad = example('phone-hubspot'); bad.version = '3.0.0'; bad.syncs[0].mapping[0].transform = 'shout';
        await expect(publish(bad)).rejects.toMatchObject({ code: 'INVALID', details: { errors: [expect.objectContaining({ layer: 'schema' }), expect.objectContaining({ layer: 'references' })] } });
        expect(await repo.findVersion('phone-hubspot', '3.0.0')).toBeNull();
    });

    it('a draft is never served, can be rewritten, then published', async () => {
        const draft = example('pipedrive-hubspot');
        expect((await publish(draft, { publish: false })).version.status).toBe('DRAFT');
        const catalog = d.createDefinitionCatalog({ repository: repo });
        expect(await catalog.get('pipedrive-hubspot', '1.0.0')).toBeNull();
        expect(await catalog.latest('pipedrive-hubspot')).toBeNull();
        draft.display.label = 'Pipedrive and HubSpot people';
        expect((await publish(draft, { publish: false })).version.document.display.label).toBe('Pipedrive and HubSpot people');
        expect((await publish(draft)).version.status).toBe('PUBLISHED');
        expect((await catalog.latest('pipedrive-hubspot')).display.label).toBe('Pipedrive and HubSpot people');
    });

    it('two identical publishes racing: one creates it, the other gets the same row back', async () => {
        const doc = example('hubspot-slack');
        const [a, b] = await Promise.all([publish(doc), publish(doc)]);
        expect([a.created, b.created].sort()).toEqual([false, true]);
        expect(a.version.id).toBe(b.version.id);
    });

    it('deprecating keeps the version running for its pins but takes it out of "latest"; only once', async () => {
        const deprecate = new d.DeprecateDefinitionVersion({ repository: repo });
        expect((await deprecate.execute({ definitionId: 'phone-hubspot', version: '2.0.0' })).status).toBe('DEPRECATED');
        await expect(deprecate.execute({ definitionId: 'phone-hubspot', version: '2.0.0' })).rejects.toMatchObject({ code: 'WRONG_STATUS' });
        await expect(deprecate.execute({ definitionId: 'phone-hubspot', version: '9.9.9' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        const catalog = d.createDefinitionCatalog({ repository: repo });
        expect((await catalog.get('phone-hubspot', '2.0.0')).version).toBe('2.0.0');
        expect((await catalog.latest('phone-hubspot')).version).toBe('1.4.0');
    });

    it('the status precondition is enforced by the database: a published row cannot be rewritten as if it were a draft', async () => {
        expect(await repo.updateIfStatus('phone-hubspot', '1.4.0', 'DRAFT', { notes: 'rewritten' })).toBeNull();
        expect((await repo.findVersion('phone-hubspot', '1.4.0')).notes).toBe('first');
    });

    it('verifies a pinned checksum', async () => {
        const catalog = d.createDefinitionCatalog({ repository: repo });
        await expect(catalog.get('phone-hubspot', '1.4.0', { checksum: 'sha256:not-it' })).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
        const sum = await catalog.checksumOf('phone-hubspot', '1.4.0');
        expect((await catalog.get('phone-hubspot', '1.4.0', { checksum: sum })).version).toBe('1.4.0');
    });

    it('lists the latest published version of each definition, and the full history newest first', async () => {
        const list = await d.createDefinitionCatalog({ repository: repo }).list();
        expect(list.map((x) => [x.id, x.version]).sort()).toEqual([['hubspot-slack', '1.2.0'], ['phone-hubspot', '1.4.0'], ['pipedrive-hubspot', '1.0.0']]);
        const history = await new d.GetDefinitionHistory({ repository: repo }).execute({ definitionId: 'phone-hubspot' });
        expect(history.map((r) => [r.version, r.status])).toEqual([['2.0.0', 'DEPRECATED'], ['1.4.0', 'PUBLISHED']]);
        expect(history[0].document).toBeUndefined();
    });

    it("keeps a workspace's own integration in that workspace: stored, listed to it alone, and its id is taken", async () => {
        const own = { ...example('github-linear'), id: 'acme-github-linear', version: '1.0.0' };
        const publish = (document, workspaceId) => new d.PublishDefinitionVersion({ repository: repo, manifests }).execute({ document, workspaceId });
        expect((await publish(own, 'ws-acme')).version.workspaceId).toBe('ws-acme');
        const catalog = d.createDefinitionCatalog({ repository: repo });
        expect((await catalog.list({ workspaceId: 'ws-acme' })).map((x) => x.id)).toContain('acme-github-linear');
        expect((await catalog.list({ workspaceId: 'ws-other' })).map((x) => x.id)).not.toContain('acme-github-linear');
        expect(await catalog.ownerOf('acme-github-linear')).toBe('ws-acme');
        expect(await catalog.ownerOf('phone-hubspot')).toBeNull();
        await expect(publish({ ...own, version: '1.0.1' }, 'ws-other')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });   // not confirmed to another tenant
        await expect(publish({ ...own, version: '1.0.1' }, null)).rejects.toMatchObject({ status: 409, code: 'ID_TAKEN' });         // the admin is not a tenant
        await expect(publish({ ...example('phone-hubspot'), version: '9.0.0' }, 'ws-acme')).rejects.toMatchObject({ code: 'ID_TAKEN' });
    });

    it('records workflow runs and lists them newest first, filtered and paged; old runs can be deleted', async () => {
        const base = { integrationId, definitionId: 'phone-hubspot', definitionVersion: '1.4.0', triggerType: 'webhook', trace: [{ id: 'contact', use: 'links.find', at: 'steps[0]', status: 'ok', ms: 3 }] };
        await runs.createRun({ ...base, workflowId: 'log-call', status: 'completed', eventId: 'e1', startedAt: '2026-10-18T10:00:00Z', endedAt: '2026-10-18T10:00:01Z' });
        await runs.createRun({ ...base, workflowId: 'log-call', status: 'failed', error: 'HubSpot 503', retryable: true, startedAt: '2026-10-18T11:00:00Z' });
        await runs.createRun({ ...base, workflowId: 'missed-call-task', status: 'stopped', reason: 'Caller is not a known contact', startedAt: '2026-10-18T12:00:00Z' });
        const all = await runs.listRuns(integrationId);
        expect(all.map((r) => r.status)).toEqual(['stopped', 'failed', 'completed']);
        expect(all[0]).toMatchObject({ integrationId, workflowId: 'missed-call-task', reason: 'Caller is not a known contact' });
        expect(all[2].trace).toEqual(base.trace);
        expect((await runs.listRuns(integrationId, { workflowId: 'log-call' })).length).toBe(2);
        expect((await runs.listRuns(integrationId, { status: 'failed' }))[0]).toMatchObject({ error: 'HubSpot 503', retryable: true });
        expect((await runs.listRuns(integrationId, { before: '2026-10-18T12:00:00Z', limit: 1 })).map((r) => r.status)).toEqual(['failed']);
        expect(await runs.deleteRunsBefore('2026-10-18T10:30:00Z')).toBe(1);
        expect((await runs.listRuns(integrationId)).length).toBe(2);
    });

    it('a paused run is found by its run key and updated in place when it resumes', async () => {
        const row = await runs.createRun({ integrationId, definitionId: 'phone-hubspot', definitionVersion: '1.4.0', workflowId: 'gate', triggerType: 'userAction', status: 'waiting', runKey: 'run_abc', waitingFor: { stepId: 'ok', kind: 'approval', prompt: 'Go?' }, resumeAt: '2026-10-20T10:00:00Z', trace: [{ id: 'ok', status: 'waiting' }], startedAt: '2026-10-19T10:00:00Z' });
        expect(await runs.findRun(integrationId, 'run_abc')).toMatchObject({ id: row.id, status: 'waiting', waitingFor: { kind: 'approval', prompt: 'Go?' } });
        expect((await runs.listRuns(integrationId, { status: 'waiting' })).map((r) => r.runKey)).toEqual(['run_abc']);
        const done = await runs.updateRun(row.id, { status: 'completed', waitingFor: null, resumeAt: null, endedAt: '2026-10-19T11:00:00Z', trace: [{ id: 'ok', status: 'ok' }, { id: 'create', status: 'ok' }] });
        expect(done).toMatchObject({ id: row.id, status: 'completed', waitingFor: null, resumeAt: null, workflowId: 'gate' });
        expect((await runs.findRun(integrationId, 'run_abc')).trace).toHaveLength(2);
        expect(await runs.findRun(integrationId, 'run_nope')).toBeNull();
    });

    it('deleting an installation deletes its run history', async () => {
        const other = String((await client.integration.create({ data: { config: { type: 'data-defined' } } })).id);
        await runs.createRun({ integrationId: other, definitionId: 'x', definitionVersion: '1.0.0', workflowId: 'w', triggerType: 'schedule', status: 'completed', startedAt: '2026-10-18T10:00:00Z' });
        await client.integration.delete({ where: { id: /^\d+$/.test(other) ? Number(other) : other } });
        expect(await runs.listRuns(other)).toEqual([]);
    });
});
