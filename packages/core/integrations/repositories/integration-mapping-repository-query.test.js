/**
 * SQL-generation tests for IntegrationMappingRepositoryPostgres.queryMappings.
 *
 * These stub `prisma.$queryRawUnsafe` to capture the page SQL, and the
 * fallback count SQL, with their bound parameters. The contract under test:
 * the SQL text is fixed and every caller-supplied value, JSON paths included,
 * reaches Postgres only as a bound parameter.
 */

jest.mock('../../database/encryption/encryption-schema-registry', () => ({
    ...jest.requireActual(
        '../../database/encryption/encryption-schema-registry'
    ),
    loadCustomEncryptionSchema: jest.fn(),
}));

const {
    loadCustomEncryptionSchema,
    registerCustomSchema,
    registerEncryptionOptOut,
    resetCustomSchema,
    resetEncryptionOptOut,
} = require('../../database/encryption/encryption-schema-registry');
const { logger } = require('../../database/encryption/logger');
const {
    resetMappingEncryptionCheck,
} = require('../../database/encryption/integration-mapping-encryption');
const {
    IntegrationMappingRepositoryPostgres,
} = require('./integration-mapping-repository-postgres');
const {
    IntegrationMappingRepositoryMongo,
} = require('./integration-mapping-repository-mongo');
const {
    IntegrationMappingRepositoryDocumentDB,
} = require('./integration-mapping-repository-documentdb');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');
const {
    IntegrationMappingRepository,
} = require('./integration-mapping-repository');

function makeRepo({ rows = [], total = rows.length, fallbackTotal = 0 } = {}) {
    const repo = new IntegrationMappingRepositoryPostgres();
    const calls = [];
    repo.prisma = {
        $queryRawUnsafe: jest.fn(async (sql, ...params) => {
            calls.push({ sql, params });
            return isPage(sql)
                ? rows.map((row) => ({ ...row, __total: total }))
                : [{ total: fallbackTotal }];
        }),
    };
    return {
        repo,
        calls,
        page: () => calls.find((call) => isPage(call.sql)),
        count: () => calls.find((call) => !isPage(call.sql)),
    };
}

const isPage = (sql) => /COUNT\(\*\) OVER \(\)/.test(sql);

describe('IntegrationMappingRepositoryPostgres.queryMappings', () => {
    it('binds the integration id as an int and returns string ids with the total', async () => {
        const createdAt = new Date('2026-01-01T00:00:00Z');
        const updatedAt = new Date('2026-01-02T00:00:00Z');
        const { repo, page, calls } = makeRepo({
            rows: [
                {
                    id: 5,
                    integrationId: 12,
                    sourceId: 'hubspot:1',
                    mapping: { crmId: '1' },
                    createdAt,
                    updatedAt,
                },
            ],
            total: 7,
        });

        const result = await repo.queryMappings('12', { take: 10 });

        expect(page().sql).toMatch(/"integrationId" = \$1::int/);
        expect(page().params[0]).toBe(12);
        expect(calls).toHaveLength(1);
        expect(result).toEqual({
            mappings: [
                {
                    id: '5',
                    integrationId: '12',
                    sourceId: 'hubspot:1',
                    mapping: { crmId: '1' },
                    createdAt,
                    updatedAt,
                },
            ],
            total: 7,
        });
    });

    it('only matches rows whose mapping is a JSON object, so ciphertext strings never match', async () => {
        const { repo, page } = makeRepo();

        await repo.queryMappings('12', { take: 10 });

        expect(page().sql).toMatch(/jsonb_typeof\("mapping"\) = 'object'/);
    });

    describe('total', () => {
        const row = (id) => ({
            id,
            integrationId: 12,
            sourceId: `hubspot:${id}`,
            mapping: { crmId: String(id) },
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
        });

        it('reads the total from a window count on the page, in one statement', async () => {
            const { repo, page, calls } = makeRepo({
                rows: [row(1), row(2)],
                total: 42,
            });

            const { total } = await repo.queryMappings('12', { take: 2 });

            expect(normalize(page().sql)).toContain(
                `"updatedAt", (COUNT(*) OVER ())::int AS "__total" FROM "IntegrationMapping"`
            );
            expect(calls).toHaveLength(1);
            expect(total).toBe(42);
        });

        it('leaves the window column out of the returned rows', async () => {
            const { repo } = makeRepo({ rows: [row(1)], total: 1 });

            const { mappings } = await repo.queryMappings('12', { take: 10 });

            expect(mappings[0]).not.toHaveProperty('__total');
        });

        it('uses the window total when a later page has rows', async () => {
            const { repo, calls } = makeRepo({ rows: [row(51)], total: 51 });

            const { total } = await repo.queryMappings('12', {
                skip: 50,
                take: 10,
            });

            expect(calls).toHaveLength(1);
            expect(total).toBe(51);
        });

        it('returns 0 for an empty first page without counting again', async () => {
            const { repo, calls } = makeRepo({ fallbackTotal: 99 });

            const result = await repo.queryMappings('12', { take: 10 });

            expect(calls).toHaveLength(1);
            expect(result).toEqual({ mappings: [], total: 0 });
        });

        it('counts in a second statement only when a page after the first is empty', async () => {
            const { repo, calls, count } = makeRepo({ fallbackTotal: 12 });

            const result = await repo.queryMappings('12', {
                skip: 50,
                take: 10,
            });

            expect(calls).toHaveLength(2);
            expect(normalize(count().sql)).toMatch(
                /^SELECT COUNT\(\*\)::int AS "total" FROM "IntegrationMapping" WHERE /
            );
            expect(count().sql).not.toMatch(/OVER|OFFSET|LIMIT/);
            expect(count().params).toEqual([12]);
            expect(result).toEqual({ mappings: [], total: 12 });
        });
    });

    describe('conditions', () => {
        it('exists binds the path and treats JSON null as absent', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', {
                where: [{ path: 'mapping.c2h', op: 'exists' }],
                take: 10,
            });

            expect(page().sql).toContain(
                `COALESCE(jsonb_typeof("mapping" #> $2::text[]), 'null') <> 'null'`
            );
            expect(page().params[1]).toEqual(['c2h']);
            expect(page().sql).not.toContain('c2h');
        });

        it('notExists is the exact negation of exists (missing or JSON null)', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', {
                where: [{ path: 'mapping.crmId', op: 'notExists' }],
                take: 10,
            });

            expect(page().sql).toContain(
                `COALESCE(jsonb_typeof("mapping" #> $2::text[]), 'null') = 'null'`
            );
            expect(page().params[1]).toEqual(['crmId']);
        });

        it('in matches JSON strings against a bound text[] of values', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', {
                where: [
                    {
                        path: 'mapping.c2h.lastStatus',
                        op: 'in',
                        value: ['failed', 'skipped'],
                    },
                ],
                take: 10,
            });

            expect(page().sql).toContain(
                `(jsonb_typeof("mapping" #> $2::text[]) = 'string' AND "mapping" #>> $2::text[] = ANY($3::text[]))`
            );
            expect(page().params.slice(1, 3)).toEqual([
                ['c2h', 'lastStatus'],
                ['failed', 'skipped'],
            ]);
            expect(page().sql).not.toMatch(/lastStatus|failed|skipped/);
        });

        it('notStartsWith binds the prefix and keeps rows with a NULL sourceId', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', {
                where: [
                    {
                        path: 'sourceId',
                        op: 'notStartsWith',
                        value: "clockwork:'%_",
                    },
                ],
                take: 10,
            });

            expect(page().sql).toContain(
                `("sourceId" IS NULL OR NOT starts_with("sourceId", $2::text))`
            );
            expect(page().params[1]).toBe("clockwork:'%_");
            expect(page().sql).not.toContain('clockwork');
        });

        it('ANDs top-level conditions and ORs an anyOf group inside parentheses', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', {
                where: [
                    { path: 'mapping.c2h', op: 'exists' },
                    {
                        anyOf: [
                            {
                                path: 'sourceId',
                                op: 'notStartsWith',
                                value: 'clockwork:',
                            },
                            { path: 'mapping.crmId', op: 'notExists' },
                        ],
                    },
                ],
                take: 10,
            });

            expect(normalize(page().sql)).toContain(
                `WHERE "integrationId" = $1::int` +
                    ` AND jsonb_typeof("mapping") = 'object'` +
                    ` AND COALESCE(jsonb_typeof("mapping" #> $2::text[]), 'null') <> 'null'` +
                    ` AND (("sourceId" IS NULL OR NOT starts_with("sourceId", $3::text))` +
                    ` OR COALESCE(jsonb_typeof("mapping" #> $4::text[]), 'null') = 'null')`
            );
            expect(page().params.slice(0, 4)).toEqual([
                12,
                ['c2h'],
                'clockwork:',
                ['crmId'],
            ]);
        });
    });

    describe('ordering', () => {
        it.each([
            ['desc', 'DESC'],
            ['asc', 'ASC'],
        ])(
            'orders %s by the bound path with nulls last and ties by id',
            async (direction, sql) => {
                const { repo, page } = makeRepo();

                await repo.queryMappings('12', {
                    orderBy: { path: 'mapping.c2h.lastAttemptAt', direction },
                    take: 10,
                });

                expect(normalize(page().sql)).toContain(
                    `ORDER BY NULLIF("mapping" #> $2::text[], 'null'::jsonb) ${sql} NULLS LAST, "id" ${sql}`
                );
                expect(page().params[1]).toEqual(['c2h', 'lastAttemptAt']);
                expect(page().sql).not.toContain('lastAttemptAt');
            }
        );

        it('orders by id when no orderBy is given, so pages are stable', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', { take: 10 });

            expect(normalize(page().sql)).toContain('ORDER BY "id" ASC');
        });

        it('keeps ORDER BY out of the fallback count query', async () => {
            const { repo, count } = makeRepo();

            await repo.queryMappings('12', {
                orderBy: {
                    path: 'mapping.c2h.lastAttemptAt',
                    direction: 'desc',
                },
                skip: 10,
                take: 10,
            });

            expect(count().sql).not.toContain('ORDER BY');
            expect(count().params).toEqual([12]);
        });
    });

    describe('paging and projection', () => {
        it('binds skip and take as OFFSET and LIMIT', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', { skip: 40, take: 20 });

            expect(normalize(page().sql)).toMatch(
                /OFFSET \$2::bigint LIMIT \$3::int$/
            );
            expect(page().params.slice(1)).toEqual([40, 20]);
        });

        it('defaults OFFSET to 0', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', { take: 20 });

            expect(page().params.slice(1)).toEqual([0, 20]);
        });

        it('subtracts omitted top-level keys from the returned mapping', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', {
                omit: ['changeLog', 'lastCanonical'],
                take: 10,
            });

            expect(page().sql).toContain(`"mapping" - $2::text[] AS "mapping"`);
            expect(page().params[1]).toEqual(['changeLog', 'lastCanonical']);
            expect(page().sql).not.toContain('changeLog');
        });

        it('selects the whole mapping when nothing is omitted', async () => {
            const { repo, page } = makeRepo();

            await repo.queryMappings('12', { take: 10 });

            expect(normalize(page().sql)).toContain(
                `SELECT "id", "integrationId", "sourceId", "mapping", "createdAt", "updatedAt"`
            );
        });
    });

    describe('the Synced Records query', () => {
        const syncedRecordsQuery = {
            where: [
                { path: 'mapping.c2h', op: 'exists' },
                { path: 'mapping.c2h.lastStatus', op: 'in', value: ['failed'] },
                {
                    anyOf: [
                        {
                            path: 'sourceId',
                            op: 'notStartsWith',
                            value: 'clockwork:',
                        },
                        { path: 'mapping.crmId', op: 'notExists' },
                    ],
                },
            ],
            orderBy: { path: 'mapping.c2h.lastAttemptAt', direction: 'desc' },
            skip: 25,
            take: 25,
            omit: ['changeLog', 'lastCanonical', 'lastExtra'],
        };

        const whereClause = (sql) =>
            normalize(sql).match(/WHERE (.*?)(?: ORDER BY|$)/)[1];

        it('falls back to a count with exactly the WHERE clause and parameters of the page query', async () => {
            const { repo, page, count } = makeRepo({ fallbackTotal: 3 });

            const { total } = await repo.queryMappings(
                '12',
                syncedRecordsQuery
            );

            expect(normalize(count().sql)).toMatch(
                /^SELECT COUNT\(\*\)::int AS "total" FROM "IntegrationMapping" WHERE /
            );
            expect(whereClause(count().sql)).toBe(whereClause(page().sql));
            expect(page().params.slice(0, count().params.length)).toEqual(
                count().params
            );
            expect(count().params).toEqual([
                12,
                ['c2h'],
                ['c2h', 'lastStatus'],
                ['failed'],
                'clockwork:',
                ['crmId'],
            ]);
            expect(total).toBe(3);
        });

        it('never puts a path segment or value into the SQL text', async () => {
            const { repo, page, count } = makeRepo();

            await repo.queryMappings('12', syncedRecordsQuery);

            for (const { sql } of [page(), count()]) {
                expect(sql).not.toMatch(
                    /c2h|lastStatus|failed|clockwork|crmId|lastAttemptAt|changeLog|lastCanonical|lastExtra/
                );
                expect(sql).not.toMatch(/'\{/);
            }
        });
    });

    describe('input errors', () => {
        it('rejects an invalid query before touching the database', async () => {
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', {
                    where: [{ path: "mapping.c2h'", op: 'exists' }],
                    take: 10,
                })
            ).rejects.toThrow(/queryMappings: invalid path/);
            expect(repo.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
        });

        it.each([
            [
                'more than 500 in values',
                [
                    {
                        path: 'mapping.c2h.lastStatus',
                        op: 'in',
                        value: Array.from({ length: 501 }, (_, i) => `s${i}`),
                    },
                ],
                /at most 500 strings/,
            ],
            [
                'more than 20 conditions',
                Array.from({ length: 21 }, (_, i) => ({
                    path: `mapping.f${i}`,
                    op: 'exists',
                })),
                /at most 20 conditions/,
            ],
        ])(
            'rejects %s before touching the database',
            async (_, where, message) => {
                const { repo } = makeRepo();

                await expect(
                    repo.queryMappings('12', { where, take: 10 })
                ).rejects.toThrow(message);
                expect(repo.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
            }
        );

        it('rejects a partially numeric integration id instead of truncating it', async () => {
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12abc', { take: 10 })
            ).rejects.toThrow(/cannot be converted to integer/);
            expect(repo.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
        });
    });

    describe('encryption guard', () => {
        const ENV_KEYS = ['STAGE', 'NODE_ENV', 'AES_KEY_ID', 'KMS_KEY_ARN'];
        let savedEnv;

        beforeEach(() => {
            savedEnv = Object.fromEntries(
                ENV_KEYS.map((key) => [key, process.env[key]])
            );
            loadCustomEncryptionSchema.mockReset();
            resetEncryptionOptOut();
            resetCustomSchema();
            resetMappingEncryptionCheck();
        });

        afterEach(() => {
            for (const [key, value] of Object.entries(savedEnv)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
            resetEncryptionOptOut();
            resetCustomSchema();
            resetMappingEncryptionCheck();
        });

        const enableEncryption = () => {
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'test-key';
            delete process.env.KMS_KEY_ARN;
        };

        it('refuses to query while encryption is on and still encrypts mapping on write', async () => {
            enableEncryption();
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).rejects.toThrow(
                "queryMappings: field-level encryption still encrypts IntegrationMapping.mapping on write, so it cannot be queried. Opt out by adding 'mapping' to appDefinition.encryption.disable.IntegrationMapping."
            );
            expect(repo.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
        });

        it('runs when the app opts mapping out of encryption in its definition', async () => {
            enableEncryption();
            loadCustomEncryptionSchema.mockImplementation(() =>
                registerEncryptionOptOut({ IntegrationMapping: ['mapping'] })
            );
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 0 });
        });

        it('names every nested mapping path that still needs an opt-out', async () => {
            enableEncryption();
            registerCustomSchema({
                IntegrationMapping: { fields: ['mapping.secret'] },
            });
            registerEncryptionOptOut({ IntegrationMapping: ['mapping'] });
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).rejects.toThrow(
                /encrypts IntegrationMapping\.mapping\.secret on write.*adding 'mapping\.secret'/
            );
            expect(repo.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
        });

        it('runs on STAGE=dev, where encryption is off and the opt-out is never registered', async () => {
            process.env.STAGE = 'dev';
            process.env.AES_KEY_ID = 'test-key';
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 0 });
        });

        it('checks once per process, not once per repository', async () => {
            process.env.STAGE = 'production';
            delete process.env.AES_KEY_ID;
            delete process.env.KMS_KEY_ARN;
            const warn = jest
                .spyOn(logger, 'warn')
                .mockImplementation(() => {});

            await makeRepo().repo.queryMappings('12', { take: 10 });
            await makeRepo().repo.queryMappings('12', { take: 10 });

            const noKeyWarnings = warn.mock.calls.filter(([message]) =>
                /No encryption keys configured/.test(message)
            );
            expect(noKeyWarnings).toHaveLength(1);
            warn.mockRestore();
        });
    });
});

describe.each([
    ['IntegrationMappingRepositoryMongo', IntegrationMappingRepositoryMongo],
    [
        'IntegrationMappingRepositoryDocumentDB',
        IntegrationMappingRepositoryDocumentDB,
    ],
    ['IntegrationMappingRepository (legacy)', IntegrationMappingRepository],
    [
        'IntegrationMappingRepositoryInterface',
        IntegrationMappingRepositoryInterface,
    ],
])('%s.queryMappings', (_, Repository) => {
    it('is not supported yet and never touches the database', async () => {
        const repo = new Repository();
        repo.prisma = {
            $queryRawUnsafe: jest.fn(),
            $runCommandRaw: jest.fn(),
            integrationMapping: { findMany: jest.fn() },
        };

        await expect(
            repo.queryMappings('507f1f77bcf86cd799439011', { take: 10 })
        ).rejects.toThrow(
            'queryMappings is not supported by this database adapter yet'
        );
        expect(repo.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
        expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
        expect(repo.prisma.integrationMapping.findMany).not.toHaveBeenCalled();
    });
});

const normalize = (sql) => sql.replace(/\s+/g, ' ').trim();
