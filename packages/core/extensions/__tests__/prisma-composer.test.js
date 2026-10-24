const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    composeExtensionPrisma,
    resolvePrismaDbTypes,
    buildComposedSchema,
} = require('../prisma-composer');

const BASE_PG = `generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma-postgresql"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id Int @id @default(autoincrement())
}
`;

const EXT_PG = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model OAuthAppCredential {
  id           Int    @id @default(autoincrement())
  moduleName   String @unique
  clientSecret String
}
`;

const MIGRATION_SQL =
    'CREATE TABLE "OAuthAppCredential" ("id" SERIAL PRIMARY KEY);\n';

function makeFixture() {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'frigg-prisma-composer-')
    );
    const corePath = path.join(root, 'core');
    fs.mkdirSync(
        path.join(
            corePath,
            'prisma-postgresql',
            'migrations',
            '20250930193005_init'
        ),
        {
            recursive: true,
        }
    );
    fs.writeFileSync(
        path.join(corePath, 'prisma-postgresql', 'schema.prisma'),
        BASE_PG
    );
    fs.writeFileSync(
        path.join(
            corePath,
            'prisma-postgresql',
            'migrations',
            '20250930193005_init',
            'migration.sql'
        ),
        'CREATE TABLE "User" ("id" SERIAL PRIMARY KEY);\n'
    );
    const extDir = path.join(root, 'ext');
    fs.mkdirSync(
        path.join(extDir, 'migrations', '20261024000000_oauth_app_credential'),
        {
            recursive: true,
        }
    );
    fs.writeFileSync(path.join(extDir, 'schema.prisma'), EXT_PG);
    fs.writeFileSync(
        path.join(
            extDir,
            'migrations',
            '20261024000000_oauth_app_credential',
            'migration.sql'
        ),
        MIGRATION_SQL
    );
    return { root, corePath, extDir };
}

// A stand-in for `prisma generate`: writes the composed schema where the
// generated client keeps its copy, as Prisma does.
function fakeGenerate(calls) {
    return ({ schemaPath, corePath, dbType }) => {
        calls.push(dbType);
        const out = path.join(corePath, 'generated', `prisma-${dbType}`);
        fs.mkdirSync(out, { recursive: true });
        fs.copyFileSync(schemaPath, path.join(out, 'schema.prisma'));
    };
}

function appWith(extDir, overrides = {}) {
    return {
        database: { postgres: { enable: true } },
        coreExtensions: [
            {
                name: 'db-credentials',
                schema: path.join(extDir, 'schema.prisma'),
                migrations: path.join(extDir, 'migrations'),
                ...overrides,
            },
        ],
    };
}

describe('resolvePrismaDbTypes', () => {
    it.each([
        [{ database: { postgres: { enable: true } } }, ['postgresql']],
        [{ database: { mongoDB: { enable: true } } }, ['mongodb']],
        [{ database: { documentDB: { enable: true } } }, ['mongodb']],
        [{ database: {} }, []],
        [{}, []],
    ])('%j -> %j', (appDefinition, expected) => {
        expect(resolvePrismaDbTypes(appDefinition)).toEqual(expected);
    });
});

describe('composeExtensionPrisma', () => {
    let fixture;
    let calls;
    const quiet = () => {};

    beforeEach(() => {
        fixture = makeFixture();
        calls = [];
    });
    afterEach(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

    const schemaOf = () =>
        fs.readFileSync(
            path.join(fixture.corePath, 'prisma-postgresql', 'schema.prisma'),
            'utf-8'
        );

    it('adds the extension model to schema.prisma, keeps the base, copies the migration and generates', () => {
        const result = composeExtensionPrisma({
            appDefinition: appWith(fixture.extDir),
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        });

        expect(result.changed).toBe(true);
        expect(calls).toEqual(['postgresql']);
        expect(schemaOf()).toContain('model OAuthAppCredential');
        expect(schemaOf()).toContain('model User');
        // the extension's datasource block is not duplicated
        expect(schemaOf().match(/datasource db/g)).toHaveLength(1);
        expect(
            fs.readFileSync(
                path.join(
                    fixture.corePath,
                    'prisma-postgresql',
                    'schema.base.prisma'
                ),
                'utf-8'
            )
        ).toBe(BASE_PG);
        expect(
            fs.readFileSync(
                path.join(
                    fixture.corePath,
                    'prisma-postgresql',
                    'migrations',
                    '20261024000000_oauth_app_credential',
                    'migration.sql'
                ),
                'utf-8'
            )
        ).toBe(MIGRATION_SQL);
        expect(result.results[0].migrations).toEqual([
            '20261024000000_oauth_app_credential',
        ]);
    });

    it('is idempotent: a second run appends nothing and does not regenerate', () => {
        const params = {
            appDefinition: appWith(fixture.extDir),
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        };
        composeExtensionPrisma(params);
        const first = schemaOf();
        const second = composeExtensionPrisma(params);

        expect(schemaOf()).toBe(first);
        expect(schemaOf().match(/model OAuthAppCredential/g)).toHaveLength(1);
        expect(calls).toEqual(['postgresql']);
        expect(second.changed).toBe(false);
    });

    it('regenerates when the client is missing even though the schema is already composed', () => {
        const params = {
            appDefinition: appWith(fixture.extDir),
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        };
        composeExtensionPrisma(params);
        fs.rmSync(path.join(fixture.corePath, 'generated'), {
            recursive: true,
        });
        composeExtensionPrisma(params);
        expect(calls).toEqual(['postgresql', 'postgresql']);
    });

    it('restores the base schema and regenerates when the extension is removed', () => {
        composeExtensionPrisma({
            appDefinition: appWith(fixture.extDir),
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        });
        composeExtensionPrisma({
            appDefinition: { database: { postgres: { enable: true } } },
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        });
        expect(schemaOf()).toBe(BASE_PG);
        expect(calls).toEqual(['postgresql', 'postgresql']);
    });

    it('copies the migrations of an extension that ships no schema, without touching the schema or regenerating', () => {
        const result = composeExtensionPrisma({
            appDefinition: appWith(fixture.extDir, { schema: undefined }),
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        });
        expect(result.changed).toBe(true);
        expect(result.results[0].migrations).toEqual([
            '20261024000000_oauth_app_credential',
        ]);
        expect(calls).toEqual([]);
        expect(schemaOf()).toBe(BASE_PG);
        expect(
            fs.existsSync(
                path.join(
                    fixture.corePath,
                    'prisma-postgresql',
                    'schema.base.prisma'
                )
            )
        ).toBe(false);
    });

    it('leaves core untouched when no extension declares a schema', () => {
        const result = composeExtensionPrisma({
            appDefinition: {
                database: { postgres: { enable: true } },
                coreExtensions: [{ name: 'routes-only' }],
            },
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        });
        expect(result.changed).toBe(false);
        expect(calls).toEqual([]);
        expect(
            fs.existsSync(
                path.join(
                    fixture.corePath,
                    'prisma-postgresql',
                    'schema.base.prisma'
                )
            )
        ).toBe(false);
    });

    it('uses the schema for the database the app runs, when the extension gives one per database', () => {
        composeExtensionPrisma({
            appDefinition: appWith(fixture.extDir, {
                schema: {
                    postgresql: path.join(fixture.extDir, 'schema.prisma'),
                    mongodb: '/nowhere/mongo.prisma',
                },
            }),
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        });
        expect(schemaOf()).toContain('model OAuthAppCredential');
    });

    it('refuses an extension model that redeclares a core model', () => {
        fs.writeFileSync(
            path.join(fixture.extDir, 'schema.prisma'),
            'model User {\n  id Int @id\n}\n'
        );
        expect(() =>
            composeExtensionPrisma({
                appDefinition: appWith(fixture.extDir),
                corePath: fixture.corePath,
                generate: fakeGenerate(calls),
                log: quiet,
            })
        ).toThrow(/declares "User", already declared by the core schema/);
        expect(calls).toEqual([]);
    });

    it('refuses an extension migration whose name exists with different SQL', () => {
        const dest = path.join(
            fixture.corePath,
            'prisma-postgresql',
            'migrations',
            '20261024000000_oauth_app_credential'
        );
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, 'migration.sql'), 'SELECT 1;\n');
        expect(() =>
            composeExtensionPrisma({
                appDefinition: appWith(fixture.extDir),
                corePath: fixture.corePath,
                generate: fakeGenerate(calls),
                log: quiet,
            })
        ).toThrow(/conflicts with an existing migration/);
    });

    it('does not copy migrations for MongoDB', () => {
        fs.mkdirSync(path.join(fixture.corePath, 'prisma-mongodb'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(fixture.corePath, 'prisma-mongodb', 'schema.prisma'),
            BASE_PG.replace(/postgresql/g, 'mongodb')
        );
        const result = composeExtensionPrisma({
            appDefinition: {
                ...appWith(fixture.extDir),
                database: { mongoDB: { enable: true } },
            },
            corePath: fixture.corePath,
            generate: fakeGenerate(calls),
            log: quiet,
        });
        expect(calls).toEqual(['mongodb']);
        expect(result.results[0].migrations).toEqual([]);
        expect(
            fs.existsSync(
                path.join(fixture.corePath, 'prisma-mongodb', 'migrations')
            )
        ).toBe(false);
    });
});

describe('buildComposedSchema', () => {
    it('refuses two extensions declaring the same model', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-prisma-dup-'));
        try {
            const a = path.join(dir, 'a.prisma');
            const b = path.join(dir, 'b.prisma');
            fs.writeFileSync(a, 'model Shared {\n  id Int @id\n}\n');
            fs.writeFileSync(b, 'model Shared {\n  id Int @id\n}\n');
            expect(() => buildComposedSchema(BASE_PG, [a, b])).toThrow(
                /declares "Shared"/
            );
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

// The real `prisma generate`, once: the composed client must expose the
// extension's model. The fixture sits outside the package (a generated client
// inside it would be picked up by Jest's module map in other suites) with a
// node_modules link, so prisma generate finds @prisma/client.
describe('composeExtensionPrisma with the real Prisma CLI', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-prisma-real-'));
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    it('generates a client with the extension model', () => {
        const corePath = path.join(root, 'core');
        fs.symlinkSync(
            path.resolve(
                require.resolve('@prisma/client/package.json'),
                '..',
                '..',
                '..'
            ),
            path.join(root, 'node_modules'),
            'dir'
        );
        fs.mkdirSync(path.join(corePath, 'prisma-postgresql'), {
            recursive: true,
        });
        fs.copyFileSync(
            path.join(
                __dirname,
                '..',
                '..',
                'prisma-postgresql',
                'schema.prisma'
            ),
            path.join(corePath, 'prisma-postgresql', 'schema.prisma')
        );
        const extSchema = path.join(root, 'ext.prisma');
        fs.writeFileSync(extSchema, EXT_PG);

        composeExtensionPrisma({
            appDefinition: {
                database: { postgres: { enable: true } },
                coreExtensions: [{ name: 'db-credentials', schema: extSchema }],
            },
            corePath,
            log: () => {},
        });

        const { PrismaClient } = require(path.join(
            corePath,
            'generated',
            'prisma-postgresql'
        ));
        const client = new PrismaClient({
            datasourceUrl: 'postgresql://u:p@localhost:5432/none',
        });
        expect(typeof client.oAuthAppCredential.findMany).toBe('function');
        expect(typeof client.credential.findMany).toBe('function');
    }, 120000);
});
