/**
 * HTTP routes for integration versions, run history, sync progress and approvals, mounted by createIntegrationRouter
 * when the app registers the integration runtime (a class with `DataDefined`). They answer for EVERY integration,
 * however it was made: an integration with no run history, syncs or other versions gets an empty answer, not a 404.
 * Thin adapters: authenticate, call a use case, map the result to a status.
 *
 * Signed-in users (Frigg's usual authentication: bearer token, x-frigg headers or adopter JWT):
 *   GET  /api/data-defined/definitions                   what can be installed: latest published version of each
 *                                                        (GET /api/integrations lists the same types as options)
 *   GET  /api/integrations/:integrationId/upgrade?to=    the upgrade plan for an installation (changes nothing)
 *   POST /api/integrations/:integrationId/upgrade        { to? } apply it (refused while anything is needed)
 *   GET  /api/integrations/:integrationId/runs           workflow run history, newest first (?workflowId&status&before&limit)
 *   GET  /api/integrations/:integrationId/syncs          each sync's backfill progress and poll marks
 *   POST /api/integrations/:integrationId/runs/:runId/decision   { decision: approve|reject, note? } on a paused approval
 *
 * A workspace's own integrations (signed-in user; the workspace is the user's Frigg id):
 *   POST /api/integration-definitions                    { document, notes?, publish? = true } publish (or draft) a version
 *   GET  /api/integration-definitions/:id                its versions and the latest document, for the editor
 *
 * App admins (x-frigg-admin-api-key, the validateAdminApiKey middleware that /admin/scripts and /admin/db-migrate use):
 *   POST /admin/integrations/versions                { document, notes?, publish? = true, strict? } validate + publish
 *   GET  /admin/integrations/:id/versions            every version of one integration
 *   POST /admin/integrations/:id/versions/:version/deprecate
 *
 * Installing needs no new route: POST /api/integrations with config { type: '<integration id>' } pins the latest
 * published version, exactly as a code integration is installed by its name.
 */
const catchAsyncError = require('express-async-handler');
const { validateAdminApiKey } = require('../../handlers/middleware/admin-auth');
const { DefinitionError, PublishDefinitionVersion, DeprecateDefinitionVersion, GetDefinitionHistory, GetIntegrationForDecision, GetOwnDefinition } = require('./use-cases/definition-use-cases');

/** An integration with one version (code that is not published as versions): nothing to move to. */
const noUpgrade = (integration) => ({
    allowed: false, applied: false, needs: [], actions: [],
    from: integration.constructor?.Definition?.version ?? null, to: integration.constructor?.Definition?.version ?? null,
    reason: 'This integration has no other version to move to',
});

/**
 * Every route this router registers, in one place: method, path and who may call it. The registrations below take their
 * paths from here, so this list cannot drift from what is served.
 *
 * Admin routes sit in core's existing /admin/* namespace (beside /admin/scripts and /admin/db-migrate, same admin-auth
 * middleware). The user routes are on their pre-/api/v2 paths and move onto the /api/v2 route registry via PR #671; having
 * them listed as data is what makes that move mechanical.
 * auth: 'user' = a signed-in user (the workspace is the user's Frigg id), 'admin' = x-frigg-admin-api-key.
 */
const DEFINITION_ROUTES = Object.freeze({
    catalogue:        { method: 'GET',  path: '/api/data-defined/definitions', auth: 'user' },
    upgradePlan:      { method: 'GET',  path: '/api/integrations/:integrationId/upgrade', auth: 'user' },
    upgradeApply:     { method: 'POST', path: '/api/integrations/:integrationId/upgrade', auth: 'user' },
    runs:             { method: 'GET',  path: '/api/integrations/:integrationId/runs', auth: 'user' },
    decide:           { method: 'POST', path: '/api/integrations/:integrationId/runs/:runId/decision', auth: 'user' },
    syncs:            { method: 'GET',  path: '/api/integrations/:integrationId/syncs', auth: 'user' },
    ownPublish:       { method: 'POST', path: '/api/integration-definitions', auth: 'user' },
    ownRead:          { method: 'GET',  path: '/api/integration-definitions/:definitionId', auth: 'user' },
    adminPublish:     { method: 'POST', path: '/admin/integrations/versions', auth: 'admin' },
    adminVersions:    { method: 'GET',  path: '/admin/integrations/:definitionId/versions', auth: 'admin' },
    adminDeprecate:   { method: 'POST', path: '/admin/integrations/:definitionId/versions/:version/deprecate', auth: 'admin' },
});
const path = (key) => DEFINITION_ROUTES[key].path;

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
        return getIntegrationInstance.execute(req.params.integrationId, user.getId());
    };
    const runtimeOf = (integration) => integration?.constructor?.DataDefined || null;

    router.route(path('catalogue')).get(guard(async (req, res) => {
        const user = await authenticateUser.execute(req);
        const lists = await Promise.all(classes.map((c) => (c.DataDefined.definitions.list ? c.DataDefined.definitions.list({ workspaceId: String(user.getId()) }) : [])));
        const seen = new Set();
        res.json({ definitions: lists.flat().filter((d) => (seen.has(d.id) ? false : seen.add(d.id))) });
    }));

    router.route(path('upgradePlan'))
        .get(guard(async (req, res) => {
            const integration = await installation(req);
            if (typeof integration.upgradeTo !== 'function') return res.json(noUpgrade(integration));
            res.json(await integration.upgradeTo(req.query.to || undefined, { apply: false }));
        }))
        .post(guard(async (req, res) => {
            const integration = await installation(req);
            if (typeof integration.upgradeTo !== 'function') return res.status(409).json(noUpgrade(integration));
            const result = await integration.upgradeTo(req.body?.to || undefined, { apply: true });
            res.status(result.applied ? 200 : 409).json(result);
        }));

    router.route(path('runs')).get(guard(async (req, res) => {
        const integration = await installation(req);
        const store = runtimeOf(integration)?.runs() || catalogClass.DataDefined.runs();
        if (!store) return res.json({ runs: [] });
        const { workflowId, status, before, limit } = req.query;
        res.json({ runs: await store.listRuns(integration.id, { workflowId, status, before, limit: limit ? Number(limit) : undefined }) });
    }));

    // Approvers need not own the installation: the run names who may decide it (an approval step's approvers).
    // Anyone else learns nothing, not even that the installation exists.
    router.route(path('decide')).post(guard(async (req, res) => {
        const user = await authenticateUser.execute(req);
        const { integration, isOwner } = await new GetIntegrationForDecision({ getIntegrationInstance }).execute(req.params.integrationId, user.getId());
        if (typeof integration?.decide !== 'function') throw new DefinitionError(`Run ${req.params.runId} is not waiting`, { status: 404, code: 'NOT_WAITING' });
        const out = await integration.decide(req.params.runId, { decision: req.body?.decision, note: req.body?.note, userId: user.getId(), isOwner });
        res.status(202).json(out);
    }));

    router.route(path('syncs')).get(guard(async (req, res) => {
        const integration = await installation(req);
        res.json({ syncs: typeof integration.syncStatus === 'function' ? await integration.syncStatus() : [] });
    }));

    // A workspace's own integrations (built in The Integrator): publish a version, read it back for the editor. The
    // integration then appears to that workspace like any other; no one else can see, read or install it.
    const registeredNames = new Set(integrationClasses.map((c) => c.Definition?.name).filter(Boolean));
    router.route(path('ownPublish')).post(guard(async (req, res) => {
        const user = await authenticateUser.execute(req);
        const { document, notes, publish } = req.body || {};
        const out = await new PublishDefinitionVersion({ repository: repository(), manifests, isReserved: (id) => registeredNames.has(id) })
            .execute({ document, notes, publish: publish !== false, workspaceId: String(user.getId()), createdBy: String(user.getId()) });
        const { document: _omit, ...version } = out.version;
        res.status(out.created ? 201 : 200).json({ ...out, version });
    }));
    router.route(path('ownRead')).get(guard(async (req, res) => {
        const user = await authenticateUser.execute(req);
        const out = await new GetOwnDefinition({ repository: repository() }).execute({ definitionId: req.params.definitionId, workspaceId: String(user.getId()) });
        res.json(out);
    }));

    const admin = (path) => router.route(path).all(validateAdminApiKey);
    const repository = () => {
        const repo = definitions.repository;
        if (!repo) throw new DefinitionError('This app runs bundled definitions; there is no store to publish to', { status: 501, code: 'NO_STORE' });
        return repo;
    };

    admin(path('adminPublish')).post(guard(async (req, res) => {
        const { document, notes, publish, strict, createdBy } = req.body || {};
        const out = await new PublishDefinitionVersion({ repository: repository(), manifests, isReserved: (id) => registeredNames.has(id) }).execute({ document, notes, createdBy, publish: publish !== false, strict: Boolean(strict) });
        const { document: _omit, ...version } = out.version;
        res.status(out.created ? 201 : 200).json({ ...out, version });
    }));
    admin(path('adminVersions')).get(guard(async (req, res) => {
        res.json({ versions: await new GetDefinitionHistory({ repository: repository() }).execute({ definitionId: req.params.definitionId }) });
    }));
    admin(path('adminDeprecate')).post(guard(async (req, res) => {
        const row = await new DeprecateDefinitionVersion({ repository: repository() }).execute(req.params);
        const { document: _omit, ...version } = row;
        res.json({ version });
    }));
    return true;
}

module.exports = { setDataDefinedRoutes, DEFINITION_ROUTES };
