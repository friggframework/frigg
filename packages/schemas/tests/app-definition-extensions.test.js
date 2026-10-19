const { validateAppDefinition } = require('../index');

const withRoutePath = (path) => ({
    integrations: [],
    coreExtensions: [{ name: 'db-credentials', routes: { path } }],
});

describe('app definition: core extension route paths', () => {
    test.each(['/admin/oauth-credentials', '/admin/oauth/credentials', '/admin/audit_log-v2'])(
        'accepts %s',
        (path) => {
            expect(validateAppDefinition(withRoutePath(path)).valid).toBe(true);
        }
    );

    test.each([
        '/api/admin/oauth-credentials',
        '/oauth-credentials',
        '/admin',
        '/admin/',
        '/admin/scripts',
        '/admin/db-migrate/status',
        '/admin/queue',
    ])('rejects %s (admin routes live under /admin, reserved segments excluded)', (path) => {
        expect(validateAppDefinition(withRoutePath(path)).valid).toBe(false);
    });
});

describe('app definition: appDefinition.extensions (ADR-017) beside coreExtensions', () => {
    test("accepts ADR-017's keyed extensions object", () => {
        const def = {
            integrations: [],
            extensions: { alerting: { extension: { name: 'pagerduty' }, config: { serviceKey: 'x' } } },
        };
        expect(validateAppDefinition(def).valid).toBe(true);
    });

    test('rejects the old array shape at extensions (it moved to coreExtensions)', () => {
        const def = { integrations: [], extensions: [{ name: 'db-credentials' }] };
        expect(validateAppDefinition(def).valid).toBe(false);
    });

    test('rejects a binding without an extension', () => {
        const def = { integrations: [], extensions: { alerting: { config: {} } } };
        expect(validateAppDefinition(def).valid).toBe(false);
    });
});
