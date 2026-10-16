const dbCredentials = require('../index');

describe('@friggframework/extension-db-credentials', () => {
    it('should export a valid extension definition', () => {
        expect(dbCredentials.name).toBe('db-credentials');
        expect(typeof dbCredentials.schema).toBe('string');
        expect(dbCredentials.schema).toMatch(/\.prisma$/);
        expect(dbCredentials.encryption).toBeDefined();
        expect(dbCredentials.encryption.OAuthAppCredential.fields).toContain('clientSecret');
        expect(dbCredentials.routes.path).toBe('/api/admin/oauth-credentials');
        expect(typeof dbCredentials.routes.handler).toBe('function');
        expect(typeof dbCredentials.bootstrap).toBe('function');
    });

    it('should have schema path pointing to existing file', () => {
        const fs = require('fs');
        expect(fs.existsSync(dbCredentials.schema)).toBe(true);
    });

    it('should be usable directly in appDefinition.extensions', () => {
        // Verify it matches the ExtensionDefinition shape
        const ext = dbCredentials;

        expect(ext).toEqual(
            expect.objectContaining({
                name: expect.any(String),
                schema: expect.any(String),
                encryption: expect.any(Object),
                routes: expect.objectContaining({
                    path: expect.any(String),
                    handler: expect.any(Function),
                }),
                bootstrap: expect.any(Function),
            })
        );
    });
});
