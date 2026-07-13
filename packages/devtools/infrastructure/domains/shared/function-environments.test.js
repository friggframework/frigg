const {
    isScopedEnvironmentActive,
    applyFunctionEnvironments,
} = require('./function-environments');

describe('function-environments', () => {
    const originalSkipDiscovery = process.env.FRIGG_SKIP_AWS_DISCOVERY;

    afterEach(() => {
        if (originalSkipDiscovery === undefined) {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        } else {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = originalSkipDiscovery;
        }
    });

    describe('isScopedEnvironmentActive', () => {
        it('is true only when lambda.scopedEnvironment is set', () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            expect(
                isScopedEnvironmentActive({
                    lambda: { scopedEnvironment: true },
                })
            ).toBe(true);
            expect(isScopedEnvironmentActive({})).toBe(false);
            expect(
                isScopedEnvironmentActive({
                    lambda: { scopedEnvironment: false },
                })
            ).toBe(false);
        });

        it('is false in local mode: the serverless-plugin injects LocalStack queue URLs at provider level only', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            expect(
                isScopedEnvironmentActive({
                    lambda: { scopedEnvironment: true },
                })
            ).toBe(false);
        });
    });

    describe('getIntegrationFunctionNames', () => {
        const { getIntegrationFunctionNames } = require('./function-environments');

        it('always includes the router and queue worker', () => {
            expect(
                getIntegrationFunctionNames({ Definition: { name: 'hubspot' } })
            ).toEqual(['hubspot', 'hubspotQueueWorker']);
        });

        it('includes the webhook handler when webhooks are enabled', () => {
            expect(
                getIntegrationFunctionNames({
                    Definition: { name: 'hubspot', webhooks: true },
                })
            ).toContain('hubspotWebhook');
            expect(
                getIntegrationFunctionNames({
                    Definition: { name: 'hubspot', webhooks: { enabled: true } },
                })
            ).toContain('hubspotWebhook');
            expect(
                getIntegrationFunctionNames({
                    Definition: { name: 'hubspot', webhooks: { enabled: false } },
                })
            ).not.toContain('hubspotWebhook');
        });

        it('includes one function per routed extension binding, sanitized', () => {
            const names = getIntegrationFunctionNames({
                Definition: {
                    name: 'hubspot',
                    extensions: {
                        'my-ext': { extension: { routes: [{ path: '/x', method: 'GET' }] } },
                        routeless: { extension: { routes: [] } },
                    },
                },
            });
            expect(names).toContain('hubspot__myext');
            expect(names).not.toContain('hubspot__routeless');
        });
    });

    describe('getAdminFunctionNames', () => {
        const { getAdminFunctionNames } = require('./function-environments');

        it('returns the admin functions only when admin scripts are configured', () => {
            expect(
                getAdminFunctionNames({ adminScripts: [{ Definition: { name: 'x' } }] })
            ).toEqual(['adminScriptRouter', 'adminScriptExecutor']);
            expect(getAdminFunctionNames({})).toEqual([]);
            expect(getAdminFunctionNames({ adminScripts: [] })).toEqual([]);
        });
    });

    describe('applyFunctionEnvironments', () => {
        const makeFunctions = () => ({
            auth: { handler: 'auth.handler' },
            hubspot: {
                handler: 'hubspot.handler',
                environment: { EXISTING: 'builder-set' },
            },
        });

        it('assigns scoped env vars onto the target functions', () => {
            const functions = makeFunctions();
            applyFunctionEnvironments(functions, {
                auth: { HUBSPOT_QUEUE_URL: 'url-1' },
                hubspot: { HUBSPOT_QUEUE_URL: 'url-1' },
            });

            expect(functions.auth.environment).toEqual({
                HUBSPOT_QUEUE_URL: 'url-1',
            });
            expect(functions.hubspot.environment).toEqual({
                EXISTING: 'builder-set',
                HUBSPOT_QUEUE_URL: 'url-1',
            });
        });

        it('never clobbers a key a builder already set directly on the function', () => {
            const functions = makeFunctions();
            applyFunctionEnvironments(functions, {
                hubspot: { EXISTING: 'scoped-value', OTHER: 'x' },
            });

            expect(functions.hubspot.environment.EXISTING).toBe('builder-set');
            expect(functions.hubspot.environment.OTHER).toBe('x');
        });

        it('throws on an unknown function name instead of silently dropping vars', () => {
            expect(() =>
                applyFunctionEnvironments(makeFunctions(), {
                    typoFunction: { A: '1' },
                })
            ).toThrow(/typoFunction/);
        });

        it('is a no-op for an empty map', () => {
            const functions = makeFunctions();
            applyFunctionEnvironments(functions, {});
            expect(functions.auth.environment).toBeUndefined();
        });
    });
});
