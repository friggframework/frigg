/* eslint-disable camelcase -- JWT claim names (org_id, org_role) and module fields (api_key) are snake_case */
/**
 * Tenant isolation at Management API v2, on a real PostgreSQL database
 * (ADR-056 §3.4–3.6, F6).
 *
 * Nothing between the HTTP request and the database is faked: real adopter-JWT
 * authentication (HS256, verified by the real verifier), the real v2 router,
 * dependencies, use cases and Prisma repositories, and the migrations in
 * prisma-postgresql/migrations applied to an empty database. The one stand-in
 * is the upstream API a proxied call would reach: the test module's API class
 * answers `_proxyRequest` itself, so no network is involved.
 *
 * Needs a PostgreSQL database it may wipe:
 *
 *   FRIGG_TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:5432/frigg_isolation \
 *     npx jest management-api/v2/tenant-isolation.postgres.test.js
 *
 * Without FRIGG_TEST_POSTGRES_URL the suite is skipped (and says so), so the
 * default unit run does not need a database. The database's tables are
 * truncated before every test: never point it at data you want to keep.
 *
 * Users A and B; organizations X and Y. A and B are members of X, A also of
 * Y. Organization roles come from the token's org_role claim, as in
 * production.
 */
const POSTGRES_URL = process.env.FRIGG_TEST_POSTGRES_URL;

if (POSTGRES_URL) {
    process.env.DB_TYPE = 'postgresql';
    process.env.DATABASE_URL = POSTGRES_URL;
    // Field-level encryption is not under test; 'test' bypasses it.
    process.env.STAGE = 'test';
}

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const describePostgres = POSTGRES_URL ? describe : describe.skip;
if (!POSTGRES_URL) {
    // eslint-disable-next-line no-console
    console.warn(
        '[tenant-isolation] FRIGG_TEST_POSTGRES_URL is not set: the real-Postgres isolation suite is SKIPPED, not passed.'
    );
}

const JWT_SECRET = 'tenant-isolation-test-secret-0123456789abcdef';

const userConfig = {
    primary: 'individual',
    individualUserRequired: true,
    organizationUserRequired: true,
    authModes: { adopterJwt: true, friggToken: false, sharedSecret: false },
    jwtConfig: { secret: JWT_SECRET },
};

/**
 * A module whose API is real except for the upstream call: `_proxyRequest`
 * answers with the account it was built for, so a test can tell which
 * credential the proxy used.
 */
function moduleDefinition(moduleName) {
    class Api {
        static requesterType = 'apiKey';
        constructor(params = {}) {
            this.api_key = params.api_key;
            this.calls = [];
        }
        async _proxyRequest(call) {
            this.calls.push(call);
            const body = Buffer.from(
                JSON.stringify({ module: moduleName, apiKey: this.api_key, path: call.path })
            );
            return {
                status: 200,
                headers: { 'content-type': 'application/json' },
                body,
                contentType: 'application/json',
                redirectBlocked: false,
            };
        }
    }
    return {
        moduleName,
        modelName: moduleName,
        getName: () => moduleName,
        API: Api,
        proxy: { allow: [{ method: 'GET', path: '/whoami' }] },
        requiredAuthMethods: {
            apiPropertiesToPersist: { credential: ['api_key'], entity: [] },
            setAuthParams: async (api, params) => {
                // v2 authorize hands the step's data straight through.
                api.api_key = params?.data?.key ?? params?.key;
            },
            testAuthRequest: async () => true,
            getCredentialDetails: async (api, userId) => ({
                identifiers: { userId, externalId: `cred-${api.api_key}` },
                details: { api_key: api.api_key },
            }),
            getEntityDetails: async (api, _params, _token, userId) => ({
                identifiers: { userId, externalId: `acct-${api.api_key}` },
                details: { name: `${moduleName} ${api.api_key}` },
            }),
        },
        getAuthRequirementsForStep: async () => ({
            type: 'api-key',
            data: {
                jsonSchema: { type: 'object', properties: { key: { type: 'string' } } },
            },
        }),
    };
}

const acme = moduleDefinition('acme');
const slack = moduleDefinition('slack');

describePostgres('tenant isolation at Management API v2 (real PostgreSQL)', () => {
    let prisma;
    let request;
    let createApp;
    let createManagementApiV2Router;
    let resolveManagementApiConfig;
    let getEntityTypeRegistry;
    let resolveOwnershipConfig;
    let SignJWT;
    let SyncIntegration;
    let sink;

    beforeAll(async () => {
        // An empty database gets the real schema; an already-migrated one is a no-op.
        const prismaCli = path.join(
            path.dirname(require.resolve('prisma/package.json')),
            'build',
            'index.js'
        );
        execFileSync(
            process.execPath,
            [prismaCli, 'migrate', 'deploy', '--schema', path.join(__dirname, '../../prisma-postgresql/schema.prisma')],
            { env: { ...process.env, DATABASE_URL: POSTGRES_URL }, stdio: 'pipe' }
        );

        ({ prisma } = require('../../database/prisma'));
        ({ request } = require('../test-support/http-client'));
        ({ createApp } = require('../../handlers/app-handler-helpers'));
        ({ createManagementApiV2Router } = require('./create-v2-router'));
        ({ resolveManagementApiConfig } = require('../management-api-config'));
        ({ getEntityTypeRegistry } = require('../../modules/entity-type-registry'));
        ({ resolveOwnershipConfig } = require('../../modules/entity-scope'));
        ({ SignJWT } = require('jose'));
        const { IntegrationBase } = require('../../integrations/integration-base');

        SyncIntegration = class extends IntegrationBase {
            static Definition = {
                name: 'sync',
                version: '1.0.0',
                modules: { acme: { definition: acme } },
                display: {
                    label: 'Sync',
                    description: 'Sync',
                    detailsUrl: 'https://example.com',
                    icon: 'sync',
                },
            };
            static getOptionDetails() {
                return { name: 'sync' };
            }
            async initialize() {}
            async send() {
                return null;
            }
        };

        // Prove this is the real thing before trusting anything below.
        const [{ version }] = await prisma.$queryRawUnsafe('SELECT version()');
        expect(version).toMatch(/^PostgreSQL/);
    });

    afterAll(async () => {
        await prisma?.$disconnect();
    });

    beforeEach(async () => {
        // Server-side errors land here, so a 500 explains itself.
        sink = require('../../logs').createMemorySink();
        const tables = await prisma.$queryRawUnsafe(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
        );
        const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
        await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    });

    /** The router an app with these settings serves, built as loadAppDefinition builds it. */
    function appFor({ managementApi = {}, ownership } = {}) {
        const raw = {
            integrations: [SyncIntegration],
            entities: {
                slack: { definition: slack, scope: 'organization' },
            },
            user: userConfig,
            ...(ownership && { ownership }),
            managementApi: {
                ...managementApi,
                proxy: { enable: true, ...(managementApi.proxy || {}) },
            },
        };
        const entityTypeRegistry = getEntityTypeRegistry(raw);
        const definition = {
            ...raw,
            userConfig,
            entityTypeRegistry,
            ownership: resolveOwnershipConfig(raw, entityTypeRegistry),
        };
        const config = resolveManagementApiConfig(definition.managementApi);
        return createApp((app) =>
            app.use(createManagementApiV2Router({ appDefinition: definition, config }))
        );
    }

    /** A token for `who` acting in organization `org`, with an optional org role. */
    async function as(who, org, role) {
        const claims = { ...(org && { org_id: org }), ...(role && { org_role: role }) };
        const token = await new SignJWT(claims)
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(who)
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(new TextEncoder().encode(JWT_SECRET));
        return { authorization: `Bearer ${token}` };
    }

    const call = async (app, who, org, { method = 'GET', path: url, body, role } = {}) =>
        request(app, { method, path: url, headers: await as(who, org, role), body });

    const connect = async (app, who, org, { entityType = 'acme', key, role } = {}) => {
        const res = await call(app, who, org, {
            method: 'POST',
            path: '/api/v2/authorize',
            role,
            body: { entityType, data: { key } },
        });
        if (res.status !== 200) {
            const errors = sink.records
                .filter((record) => record.error)
                .map((record) => record.error.message);
            throw new Error(`authorize answered ${res.status}: ${JSON.stringify(res.body)} ${errors.join('; ')}`);
        }
        return res.body.entity;
    };

    const listIds = async (app, who, org, role) => {
        const res = await call(app, who, org, { path: '/api/v2/entities', role });
        expect(res.status).toBe(200);
        return res.body.entities.map((entity) => String(entity.id));
    };

    const proxy = (app, who, org, entityId, role) =>
        call(app, who, org, {
            method: 'POST',
            path: `/api/v2/entities/${entityId}/proxy`,
            role,
            body: { method: 'GET', path: '/whoami' },
        });

    const bind = (app, who, org, entityId, role) =>
        call(app, who, org, {
            method: 'POST',
            path: '/api/v2/integrations',
            role,
            body: { entities: [String(entityId)], config: { type: 'sync' } },
        });

    const expectNotFound = (res) => {
        expect(res.status).toBe(404);
        expect(res.body.error).toEqual(
            expect.objectContaining({ code: expect.any(String), message: expect.any(String) })
        );
        expect(res.body.error.code).toMatch(/NOT_FOUND/);
    };

    describe('A cannot reach B’s entities', () => {
        it('cannot list, read, proxy or bind them; B can do all four', async () => {
            const app = appFor();
            const a = await connect(app, 'user-a', 'org-x', { key: 'a-key' });
            const b = await connect(app, 'user-b', 'org-x', { key: 'b-key' });

            // The rows really are in Postgres, paired with org X, owned by different people.
            const rows = await prisma.entity.findMany({ orderBy: { id: 'asc' } });
            expect(rows).toHaveLength(2);
            expect(rows[0].userId).not.toBe(rows[1].userId);
            expect(rows[0].organizationId).toBe(rows[1].organizationId);

            expect(await listIds(app, 'user-a', 'org-x')).toEqual([String(a.id)]);
            expectNotFound(await call(app, 'user-a', 'org-x', { path: `/api/v2/entities/${b.id}` }));
            expectNotFound(await proxy(app, 'user-a', 'org-x', b.id));
            const bound = await bind(app, 'user-a', 'org-x', b.id);
            expectNotFound(bound);
            expect(await prisma.integration.count()).toBe(0);

            // Control: the owner gets through every one of them.
            expect(await listIds(app, 'user-b', 'org-x')).toEqual([String(b.id)]);
            expect((await call(app, 'user-b', 'org-x', { path: `/api/v2/entities/${b.id}` })).status).toBe(200);
            const own = await proxy(app, 'user-b', 'org-x', b.id);
            expect(own.status).toBe(200);
            expect(own.body.data).toEqual({ module: 'acme', apiKey: 'b-key', path: '/whoami' });
            expect((await bind(app, 'user-b', 'org-x', b.id)).status).toBe(201);
            expect(await prisma.integration.count()).toBe(1);
        });

        it('an org admin of the same organization still cannot proxy or bind a member’s individual entity', async () => {
            const app = appFor();
            const b = await connect(app, 'user-b', 'org-x', { key: 'b-key' });
            expectNotFound(await proxy(app, 'user-a', 'org-x', b.id, 'ADMIN'));
            expectNotFound(await bind(app, 'user-a', 'org-x', b.id, 'ADMIN'));
            expect(await listIds(app, 'user-a', 'org-x', 'ADMIN')).toEqual([]);
            expect(await prisma.integration.count()).toBe(0);
        });

        it('an id that does not exist is the same 404 as someone else’s', async () => {
            const app = appFor();
            const b = await connect(app, 'user-b', 'org-x', { key: 'b-key' });
            const missing = await proxy(app, 'user-a', 'org-x', 999999);
            const foreign = await proxy(app, 'user-a', 'org-x', b.id);
            expect(missing.status).toBe(404);
            expect(foreign.status).toBe(404);
            expect(foreign.body.error.code).toBe(missing.body.error.code);
        });
    });

    describe('A, active in X, cannot reach A’s own org-Y entities', () => {
        it('cannot list, read, proxy or bind them in X; can in Y', async () => {
            const app = appFor();
            const inX = await connect(app, 'user-a', 'org-x', { key: 'a-x' });
            const inY = await connect(app, 'user-a', 'org-y', { key: 'a-y' });

            const rows = await prisma.entity.findMany({ orderBy: { id: 'asc' } });
            expect(rows.map((r) => r.userId)).toEqual([rows[0].userId, rows[0].userId]);
            expect(rows[0].organizationId).not.toBe(rows[1].organizationId);

            expect(await listIds(app, 'user-a', 'org-x')).toEqual([String(inX.id)]);
            expectNotFound(await call(app, 'user-a', 'org-x', { path: `/api/v2/entities/${inY.id}` }));
            expectNotFound(await proxy(app, 'user-a', 'org-x', inY.id));
            expectNotFound(await bind(app, 'user-a', 'org-x', inY.id));

            expect(await listIds(app, 'user-a', 'org-y')).toEqual([String(inY.id)]);
            const there = await proxy(app, 'user-a', 'org-y', inY.id);
            expect(there.status).toBe(200);
            expect(there.body.data.apiKey).toBe('a-y');
            expectNotFound(await proxy(app, 'user-a', 'org-y', inX.id));
        });
    });

    describe('organization entities and managementApi.proxy.scopes (ADR-056 §3.5)', () => {
        async function orgEntity(app) {
            // Creating an organization entity needs an org admin.
            const entity = await connect(app, 'user-a', 'org-x', {
                entityType: 'slack',
                key: 'workspace-x',
                role: 'ADMIN',
            });
            expect(entity).toMatchObject({ scope: 'organization' });
            return entity;
        }

        it('refuses them with 403 scope when scopes is the default, even for an admin', async () => {
            const app = appFor();
            const shared = await orgEntity(app);

            // B, a plain member, sees it with use access...
            const listed = await call(app, 'user-b', 'org-x', { path: '/api/v2/entities', role: 'MEMBER' });
            expect(listed.body.entities).toEqual([
                expect.objectContaining({ id: shared.id, scope: 'organization', access: 'use' }),
            ]);

            // ...and still cannot proxy through it.
            for (const [who, role] of [['user-b', 'MEMBER'], ['user-a', 'ADMIN']]) {
                const res = await proxy(app, who, 'org-x', shared.id, role);
                expect(res.status).toBe(403);
                expect(res.body.error).toMatchObject({
                    code: 'PROXY_NOT_ALLOWED',
                    message: expect.stringMatching(/does not accept organization entities/),
                    details: { reason: 'scope', scope: 'organization' },
                });
            }
        });

        it('allows a member with use access once the app opts in', async () => {
            const app = appFor({ managementApi: { proxy: { scopes: ['individual', 'organization'] } } });
            const shared = await orgEntity(app);

            const res = await proxy(app, 'user-b', 'org-x', shared.id, 'MEMBER');
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual({ module: 'slack', apiKey: 'workspace-x', path: '/whoami' });

            // Individual entities keep working alongside.
            const own = await connect(app, 'user-b', 'org-x', { key: 'b-key', role: 'MEMBER' });
            expect((await proxy(app, 'user-b', 'org-x', own.id, 'MEMBER')).status).toBe(200);
        });

        it('still hides it from another organization, opted in or not', async () => {
            const app = appFor({ managementApi: { proxy: { scopes: ['individual', 'organization'] } } });
            const shared = await orgEntity(app);
            // A is a member of Y too, but X's workspace is not Y's.
            expectNotFound(await proxy(app, 'user-a', 'org-y', shared.id, 'ADMIN'));
            expect(await listIds(app, 'user-a', 'org-y', 'ADMIN')).toEqual([]);
            // C belongs only to Y.
            expectNotFound(await proxy(app, 'user-c', 'org-y', shared.id));
        });

        it('with scopes [organization] only, refuses an individual entity', async () => {
            const app = appFor({ managementApi: { proxy: { scopes: ['organization'] } } });
            const own = await connect(app, 'user-b', 'org-x', { key: 'b-key' });
            const res = await proxy(app, 'user-b', 'org-x', own.id);
            expect(res.status).toBe(403);
            expect(res.body.error.details).toMatchObject({ reason: 'scope', scope: 'individual' });
        });
    });

    describe("ownership.individualAcross: 'all' (ADR-056 §3.6)", () => {
        const across = () => appFor({ ownership: { individualAcross: 'all' } });

        it('stores the person’s entity with no organization, usable by them in every organization they belong to', async () => {
            const app = across();
            const mine = await connect(app, 'user-a', 'org-x', { key: 'a-everywhere' });
            expect(mine).toMatchObject({ scope: 'individual', organizationId: null, access: 'manage' });
            const row = await prisma.entity.findFirst();
            expect(row.organizationId).toBeNull();

            for (const org of ['org-x', 'org-y']) {
                expect(await listIds(app, 'user-a', org)).toEqual([String(mine.id)]);
                const res = await proxy(app, 'user-a', org, mine.id);
                expect(res.status).toBe(200);
                expect(res.body.data.apiKey).toBe('a-everywhere');
            }

            // An integration that uses it belongs to the organization it was created in.
            expect((await bind(app, 'user-a', 'org-y', mine.id)).status).toBe(201);
            const integration = await prisma.integration.findFirst();
            const orgY = await prisma.user.findFirst({ where: { appOrgId: 'org-y' } });
            expect(integration.organizationId).toBe(orgY.id);
        });

        it('is still nobody else’s: B in the same organization cannot see, proxy or bind it', async () => {
            const app = across();
            const mine = await connect(app, 'user-a', 'org-x', { key: 'a-everywhere' });
            expect(await listIds(app, 'user-b', 'org-x')).toEqual([]);
            expectNotFound(await proxy(app, 'user-b', 'org-x', mine.id));
            expectNotFound(await proxy(app, 'user-b', 'org-x', mine.id, 'ADMIN'));
            expectNotFound(await bind(app, 'user-b', 'org-x', mine.id));
        });

        it("does not widen the default: under 'organization' the same flow pairs the entity with X only", async () => {
            const app = appFor();
            const mine = await connect(app, 'user-a', 'org-x', { key: 'a-x' });
            expect(mine.organizationId).not.toBeNull();
            expectNotFound(await proxy(app, 'user-a', 'org-y', mine.id));
        });
    });
});
