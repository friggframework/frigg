const { validateAppDefinition } = require('../index');

const withRoutePath = (path) => ({
    integrations: [],
    extensions: [{ name: 'db-credentials', routes: { path } }],
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
