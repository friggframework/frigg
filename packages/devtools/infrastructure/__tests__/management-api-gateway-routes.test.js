/**
 * Management API ↔ API Gateway route coverage
 *
 * The Management API is an Express app (core's createIntegrationRouter)
 * served by the `auth` Lambda. API Gateway HTTP APIs have no implicit
 * catch-all: a request whose path matches no declared route gets a gateway
 * 404 and never reaches Express. So every route the integration router
 * registers must be covered by an httpApi event on the `auth` function, and
 * no more-specific route on another function may shadow it.
 *
 * The Express routes are read from the live router (not a hard-coded list),
 * so a route added to core later fails this test until the gateway routes
 * are updated alongside it.
 */

// Avoid AWS calls: hand the builders a fixed discovery result.
jest.mock('../domains/shared/resource-discovery', () => {
    const actual = jest.requireActual('../domains/shared/resource-discovery');
    return {
        ...actual,
        gatherDiscoveredResources: jest.fn().mockResolvedValue({
            defaultVpcId: 'vpc-123456',
            vpcCidr: '172.31.0.0/16',
            defaultSecurityGroupId: 'sg-123456',
            privateSubnetId1: 'subnet-123456',
            privateSubnetId2: 'subnet-789012',
            publicSubnetId1: 'subnet-public-1',
            publicSubnetId2: 'subnet-public-2',
            defaultRouteTableId: 'rtb-123456',
            defaultKmsKeyId:
                'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
            existingNatGatewayId: 'nat-default123',
            auroraClusterEndpoint:
                'test-cluster.cluster-abc123.us-east-1.rds.amazonaws.com',
            auroraPort: 5432,
            auroraEngine: 'aurora-postgresql',
        }),
    };
});

// createIntegrationRouter loads the app definition from the consuming
// backend; give it an empty one so the router can be built in isolation.
jest.mock('@friggframework/core/handlers/app-definition-loader', () => ({
    loadAppDefinition: () => ({ integrations: [], userConfig: {} }),
}));

const { composeServerlessDefinition } = require('../infrastructure-composer');

// Routes the auth Lambda's handler (core/handlers/routers/auth.js) adds on
// top of createIntegrationRouter().
const AUTH_HANDLER_EXTRA_ROUTES = [
    { method: 'GET', path: '/api/integrations/redirect/:appId' },
];

function getIntegrationRouterRoutes() {
    const { createIntegrationRouter } = require('@friggframework/core');
    // The repository factories pick an adapter from DB_TYPE (or the backend's
    // app definition, which doesn't exist here). Nothing connects.
    const previousDbType = process.env.DB_TYPE;
    process.env.DB_TYPE = 'postgresql';
    let app;
    try {
        app = createIntegrationRouter();
    } finally {
        if (previousDbType === undefined) delete process.env.DB_TYPE;
        else process.env.DB_TYPE = previousDbType;
    }
    const stack = (app._router || app.router).stack;
    const routes = [];
    for (const layer of stack) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) {
            routes.push({
                method: method === '_all' ? 'ANY' : method.toUpperCase(),
                path: layer.route.path,
            });
        }
    }
    return routes;
}

function getGatewayRoutes(definition) {
    const routes = [];
    for (const [functionName, fn] of Object.entries(definition.functions)) {
        for (const event of fn.events || []) {
            if (!event.httpApi) continue;
            routes.push({
                functionName,
                method: String(event.httpApi.method).toUpperCase(),
                path: event.httpApi.path,
            });
        }
    }
    return routes;
}

const segmentsOf = (p) => p.split('/').filter(Boolean);

// Turn an Express path into a concrete request path, e.g.
// /api/entities/:entityId/options -> /api/entities/sample-entityId/options
const toConcretePath = (expressPath) =>
    expressPath.replace(/:([A-Za-z0-9_]+)/g, 'sample-$1');

/**
 * HTTP API path matching: literal segments match exactly, {param} matches
 * one segment, a trailing {proxy+} greedily matches one or more segments.
 * Returns null on no match, otherwise a specificity descriptor.
 */
function matchGatewayPath(gatewayPath, requestPath) {
    const g = segmentsOf(gatewayPath);
    const r = segmentsOf(requestPath);
    let literals = 0;
    for (let i = 0; i < g.length; i++) {
        const seg = g[i];
        if (/^\{[^}]+\+\}$/.test(seg)) {
            if (i !== g.length - 1 || r.length <= i) return null;
            return { greedy: true, literals, prefixLength: i };
        }
        if (i >= r.length) return null;
        if (/^\{[^}]+\}$/.test(seg)) continue;
        if (seg !== r[i]) return null;
        literals++;
    }
    if (g.length !== r.length) return null;
    return { greedy: false, literals, prefixLength: g.length };
}

/**
 * Select the route API Gateway would invoke: a non-greedy match beats a
 * greedy one, then more literal segments, then the longer greedy prefix,
 * then an explicit method beats ANY.
 */
function selectGatewayRoute(gatewayRoutes, method, requestPath) {
    const candidates = gatewayRoutes
        .filter(
            (r) => r.method === 'ANY' || method === 'ANY' || r.method === method
        )
        .map((r) => ({
            route: r,
            match: matchGatewayPath(r.path, requestPath),
        }))
        .filter((c) => c.match);
    candidates.sort(
        (a, b) =>
            Number(a.match.greedy) - Number(b.match.greedy) ||
            b.match.literals - a.match.literals ||
            b.match.prefixLength - a.match.prefixLength ||
            Number(a.route.method === 'ANY') - Number(b.route.method === 'ANY')
    );
    return candidates.length ? candidates[0].route : null;
}

describe('Management API routes are reachable through API Gateway', () => {
    let gatewayRoutes;
    let managementRoutes;
    const originalArgv = process.argv;

    beforeAll(async () => {
        process.argv = ['node', 'test'];
        process.env.AWS_REGION = 'us-east-1';
        // The builders narrate their progress; keep the test output quiet.
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = jest
            .spyOn(console, 'warn')
            .mockImplementation(() => {});
        try {
            const definition = await composeServerlessDefinition({
                name: 'route-coverage-app',
                provider: 'aws',
                usePrismaLambdaLayer: false,
                database: { postgres: { enable: true } },
                websockets: { enable: true },
                adminScripts: [
                    class ExampleScript {
                        static Definition = { name: 'example-script' };
                    },
                ],
                admin: { includeBuiltinReports: true },
                integrations: [
                    {
                        Definition: {
                            name: 'acme',
                            webhooks: true,
                            extensions: {
                                inbound: {
                                    extension: {
                                        routes: [
                                            { path: '/events', method: 'POST' },
                                        ],
                                    },
                                },
                            },
                        },
                    },
                    // Integration names share the /api/ namespace with the
                    // Management API; make sure they don't shadow it.
                    { Definition: { name: 'entities' } },
                ],
            });
            gatewayRoutes = getGatewayRoutes(definition);
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
        }
        managementRoutes = [
            ...getIntegrationRouterRoutes(),
            ...AUTH_HANDLER_EXTRA_ROUTES,
        ];
    });

    afterAll(() => {
        process.argv = originalArgv;
        delete process.env.AWS_REGION;
    });

    it('reads the Management API routes from the core integration router', () => {
        const paths = managementRoutes.map((r) => r.path);
        expect(paths).toEqual(
            expect.arrayContaining([
                '/api/integrations',
                '/api/authorize',
                '/api/entity',
                '/api/entity/options/:credentialId',
                '/api/entities/:entityId',
            ])
        );
    });

    it('routes every Management API route to the auth function', () => {
        const unreachable = managementRoutes
            .map(({ method, path: expressPath }) => {
                const requestPath = toConcretePath(expressPath);
                const selected = selectGatewayRoute(
                    gatewayRoutes,
                    method,
                    requestPath
                );
                return {
                    route: `${method} ${expressPath}`,
                    reachedBy: selected
                        ? `${selected.method} ${selected.path} -> ${selected.functionName}`
                        : 'no API Gateway route',
                    ok: selected && selected.functionName === 'auth',
                };
            })
            .filter((r) => !r.ok)
            .map(({ route, reachedBy }) => `${route} (${reachedBy})`);

        expect(unreachable).toEqual([]);
    });

    it.each([
        ['GET', '/api/v2/reports', 'reportRouter'],
        ['POST', '/api/v2/reports/daily/run', 'reportRouter'],
        ['GET', '/admin/scripts/example-script', 'adminScriptRouter'],
        ['POST', '/api/acme-integration/webhooks', 'acmeWebhook'],
        ['POST', '/api/acme-integration/inbound/events', 'acme__inbound'],
        ['GET', '/api/acme-integration/custom', 'acme'],
        ['GET', '/api/entities-integration/custom', 'entities'],
        ['POST', '/user/login', 'user'],
        ['GET', '/health/ready', 'health'],
    ])('leaves %s %s on %s', (method, requestPath, functionName) => {
        const selected = selectGatewayRoute(gatewayRoutes, method, requestPath);
        expect(selected && selected.functionName).toBe(functionName);
    });

    it('declares no method + path pair on more than one function', () => {
        const seen = new Map();
        const duplicates = [];
        for (const r of gatewayRoutes) {
            const key = `${r.method} ${r.path}`;
            if (seen.has(key) && seen.get(key) !== r.functionName) {
                duplicates.push(
                    `${key}: ${seen.get(key)} and ${r.functionName}`
                );
            }
            seen.set(key, r.functionName);
        }
        expect(duplicates).toEqual([]);
    });
});
