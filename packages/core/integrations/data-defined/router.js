/**
 * HTTP routes for data-defined integrations, mounted by createIntegrationRouter when the app registers a
 * data-defined class. Thin adapters: authenticate, call a use case, map the result to a status.
 *
 * Signed-in users (Frigg's usual authentication: bearer token, x-frigg headers or adopter JWT):
 *   GET  /api/data-defined/definitions                   what can be installed: latest published version of each
 *   GET  /api/integrations/:integrationId/upgrade?to=    the upgrade plan for an installation (changes nothing)
 *   POST /api/integrations/:integrationId/upgrade        { to? } apply it (refused while anything is needed)
 *   GET  /api/integrations/:integrationId/runs           workflow run history, newest first (?workflowId&status&before&limit)
 *   GET  /api/integrations/:integrationId/syncs          each sync's backfill progress and poll marks
 *   POST /api/integrations/:integrationId/runs/:runId/decision   { decision: approve|reject, note? } on a paused approval
 *
 * App admins (x-frigg-admin-api-key):
 *   POST /api/admin/data-defined/definitions             { document, notes?, publish? = true, strict? } validate + publish
 *   GET  /api/admin/data-defined/definitions/:id         every version of one definition
 *   POST /api/admin/data-defined/definitions/:id/versions/:version/deprecate
 *
 * Installing needs no new route: POST /api/integrations with config { type: '<class name>', definition: { id } }
 * pins the latest published version.
 */
const catchAsyncError = require('express-async-handler');
const { validateAdminApiKey } = require('../../handlers/middleware/admin-auth');
const { DefinitionError, PublishDefinitionVersion, DeprecateDefinitionVersion, GetDefinitionHistory } = require('./use-cases/definition-use-cases');

function sendError(res, e) {
    if (e instanceof DefinitionError || e?.name === 'DefinitionError') return res.status(e.status || 400).json({ error: e.message, code: e.code, details: e.details });
    throw e;
}
const guard = (fn) => catchAsyncError(async (req, res) => { try { await fn(req, res); } catch (e) { sendError(res, e); } });

/**
 * @param {import('express').Router} router
 * @param {{ execute(req): Promise<{ getId(): string }> }} authenticateUser
 * @param {{ getIntegrationInstance, integrationClasses: Function[] }} deps
 */
function setDataDefinedRoutes(router, authenticateUser, { getIntegrationInstance, integrationClasses }) {
    const classes = integrationClasses.filter((c) => c.DataDefined);
    if (!classes.length) return false;
    const catalogClass = classes.find((c) => c.DataDefined.shared) || classes[0];
    const { definitions, manifests } = catalogClass.DataDefined;

    const installation = async (req) => {
        const user = await authenticateUser.execute(req);
        const integration = await getIntegrationInstance.execute(req.params.integrationId, user.getId());
        if (!integration?.constructor?.DataDefined) throw new DefinitionError('This integration is not data-defined', { status: 404, code: 'NOT_DATA_DEFINED' });
        return integration;
    };

    router.route('/api/data-defined/definitions').get(guard(async (req, res) => {
        await authenticateUser.execute(req);
        const lists = await Promise.all(classes.map((c) => (c.DataDefined.definitions.list ? c.DataDefined.definitions.list() : [])));
        const seen = new Set();
        res.json({ definitions: lists.flat().filter((d) => (seen.has(d.id) ? false : seen.add(d.id))) });
    }));

    router.route('/api/integrations/:integrationId/upgrade')
        .get(guard(async (req, res) => {
            const integration = await installation(req);
            res.json(await integration.upgradeTo(req.query.to || undefined, { apply: false }));
        }))
        .post(guard(async (req, res) => {
            const integration = await installation(req);
            const result = await integration.upgradeTo(req.body?.to || undefined, { apply: true });
            res.status(result.applied ? 200 : 409).json(result);
        }));

    router.route('/api/integrations/:integrationId/runs').get(guard(async (req, res) => {
        const integration = await installation(req);
        const store = integration.constructor.DataDefined.runs();
        if (!store) return res.json({ runs: [] });
        const { workflowId, status, before, limit } = req.query;
        res.json({ runs: await store.listRuns(integration.id, { workflowId, status, before, limit: limit ? Number(limit) : undefined }) });
    }));

    router.route('/api/integrations/:integrationId/runs/:runId/decision').post(guard(async (req, res) => {
        const user = await authenticateUser.execute(req);
        const integration = await getIntegrationInstance.execute(req.params.integrationId, user.getId());
        if (!integration?.constructor?.DataDefined) throw new DefinitionError('This integration is not data-defined', { status: 404, code: 'NOT_DATA_DEFINED' });
        const out = await integration.decide(req.params.runId, { decision: req.body?.decision, note: req.body?.note, userId: user.getId() });
        res.status(202).json(out);
    }));

    router.route('/api/integrations/:integrationId/syncs').get(guard(async (req, res) => {
        const integration = await installation(req);
        res.json({ syncs: await integration.syncStatus() });
    }));

    const admin = (path) => router.route(path).all(validateAdminApiKey);
    const repository = () => {
        const repo = definitions.repository;
        if (!repo) throw new DefinitionError('This app runs bundled definitions; there is no store to publish to', { status: 501, code: 'NO_STORE' });
        return repo;
    };

    admin('/api/admin/data-defined/definitions').post(guard(async (req, res) => {
        const { document, notes, publish, strict, createdBy } = req.body || {};
        const out = await new PublishDefinitionVersion({ repository: repository(), manifests }).execute({ document, notes, createdBy, publish: publish !== false, strict: Boolean(strict) });
        const { document: _omit, ...version } = out.version;
        res.status(out.created ? 201 : 200).json({ ...out, version });
    }));
    admin('/api/admin/data-defined/definitions/:definitionId').get(guard(async (req, res) => {
        res.json({ versions: await new GetDefinitionHistory({ repository: repository() }).execute({ definitionId: req.params.definitionId }) });
    }));
    admin('/api/admin/data-defined/definitions/:definitionId/versions/:version/deprecate').post(guard(async (req, res) => {
        const row = await new DeprecateDefinitionVersion({ repository: repository() }).execute(req.params);
        const { document: _omit, ...version } = row;
        res.json({ version });
    }));
    return true;
}

module.exports = { setDataDefinedRoutes };
