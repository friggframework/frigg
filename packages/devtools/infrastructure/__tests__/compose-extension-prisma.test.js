/**
 * The build step that composes core extension schemas into the backend's
 * installed @friggframework/core. Uses a temp backend whose node_modules holds
 * a core with the real composer and a minimal PostgreSQL schema.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { composeAppExtensionPrisma } = require('../compose-extension-prisma');
const { buildWithProvider } = require('../provider-build');

const REAL_CORE = path.dirname(
    require.resolve('@friggframework/core/package.json')
);

const BASE = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id Int @id
}
`;

function makeBackend({ withCore = true } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-compose-ext-'));
    const backend = path.join(dir, 'backend');
    fs.mkdirSync(backend);
    fs.writeFileSync(path.join(backend, 'package.json'), '{"name":"backend"}');
    const extSchema = path.join(dir, 'ext.prisma');
    fs.writeFileSync(
        extSchema,
        'model OAuthAppCredential {\n  id Int @id\n}\n'
    );
    let core = null;
    if (withCore) {
        core = path.join(backend, 'node_modules', '@friggframework', 'core');
        fs.mkdirSync(path.join(core, 'prisma-postgresql'), { recursive: true });
        fs.writeFileSync(
            path.join(core, 'package.json'),
            '{"name":"@friggframework/core"}'
        );
        fs.writeFileSync(
            path.join(core, 'prisma-postgresql', 'schema.prisma'),
            BASE
        );
        fs.symlinkSync(
            path.join(REAL_CORE, 'extensions'),
            path.join(core, 'extensions'),
            'dir'
        );
        fs.symlinkSync(
            path.join(REAL_CORE, 'management-api'),
            path.join(core, 'management-api'),
            'dir'
        );
    }
    return { dir, backend, core, extSchema };
}

const appDefinition = (extSchema) => ({
    name: 'compose-app',
    provider: 'netlify',
    integrations: [],
    database: { postgres: { enable: true } },
    coreExtensions: [{ name: 'db-credentials', schema: extSchema }],
});

describe('composeAppExtensionPrisma', () => {
    const dirs = [];
    afterAll(() =>
        dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }))
    );

    it("composes into the backend's installed core, not devtools' copy", () => {
        const { dir, backend, core, extSchema } = makeBackend();
        dirs.push(dir);
        const generated = [];
        const result = composeAppExtensionPrisma({
            appDefinition: appDefinition(extSchema),
            backendDir: backend,
            generate: ({ corePath }) => generated.push(corePath),
            log: () => {},
        });
        expect(result.changed).toBe(true);
        expect(generated).toEqual([core]);
        expect(
            fs.readFileSync(
                path.join(core, 'prisma-postgresql', 'schema.prisma'),
                'utf-8'
            )
        ).toContain('model OAuthAppCredential');
    });

    it('is a no-op without an installed core when no extension declares a schema', () => {
        const { dir, backend } = makeBackend({ withCore: false });
        dirs.push(dir);
        expect(
            composeAppExtensionPrisma({
                appDefinition: { coreExtensions: [{ name: 'x' }] },
                backendDir: backend,
            })
        ).toEqual({ changed: false, results: [] });
    });

    it('refuses to build without an installed core when an extension declares a schema', () => {
        const { dir, backend, extSchema } = makeBackend({ withCore: false });
        dirs.push(dir);
        expect(() =>
            composeAppExtensionPrisma({
                appDefinition: appDefinition(extSchema),
                backendDir: backend,
            })
        ).toThrow(
            /declare Prisma schemas, but @friggframework\/core is not installed/
        );
    });
});

describe('buildWithProvider composes extension schemas', () => {
    const plugin = {
        validate: () => ({ errors: [], warnings: [] }),
        generateConfig: () => '# config',
    };

    it('composes before writing the provider files', () => {
        const { dir, backend } = makeBackend({ withCore: false });
        try {
            const order = [];
            const def = { provider: 'netlify', integrations: [] };
            buildWithProvider({
                appDefinition: def,
                backendDir: backend,
                provider: {
                    ...plugin,
                    generateConfig: () => (order.push('config'), '# config'),
                },
                composePrisma: (args) =>
                    order.push([
                        'compose',
                        args.appDefinition,
                        args.backendDir,
                    ]),
            });
            expect(order).toEqual([['compose', def, backend], 'config']);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('does not compose when validation fails', () => {
        const { dir, backend } = makeBackend({ withCore: false });
        try {
            const compose = jest.fn();
            buildWithProvider({
                appDefinition: { provider: 'netlify' },
                backendDir: backend,
                provider: { validate: () => ({ errors: ['bad'] }) },
                composePrisma: compose,
                exit: () => {},
            });
            expect(compose).not.toHaveBeenCalled();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
