/**
 * SQL-generation tests for IntegrationMappingRepositoryPostgres.queryMappings.
 *
 * These stub `prisma.$queryRawUnsafe` to capture the page and count SQL with
 * their bound parameters. The contract under test: the SQL text is fixed and
 * every caller-supplied value, JSON paths included, reaches Postgres only as
 * a bound parameter.
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

function makeRepo({ rows = [], total = 0 } = {}) {
    const repo = new IntegrationMappingRepositoryPostgres();
    const calls = [];
    repo.prisma = {
        $queryRawUnsafe: jest.fn(async (sql, ...params) => {
            calls.push({ sql, params });
            return isCount(sql) ? [{ total }] : rows;
        }),
    };
    return {
        repo,
        page: () => calls.find((call) => !isCount(call.sql)),
        count: () => calls.find((call) => isCount(call.sql)),
    };
}

const isCount = (sql) => /COUNT\(\*\)/.test(sql);

describe('IntegrationMappingRepositoryPostgres.queryMappings', () => {
    it('binds the integration id as an int and returns string ids with the total', async () => {
        const createdAt = new Date('2026-01-01T00:00:00Z');
        const updatedAt = new Date('2026-01-02T00:00:00Z');
        const { repo, page, count } = makeRepo({
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
        expect(count().params).toEqual([12]);
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
        const { repo, page, count } = makeRepo();

        await repo.queryMappings('12', { take: 10 });

        expect(page().sql).toMatch(/jsonb_typeof\("mapping"\) = 'object'/);
        expect(count().sql).toMatch(/jsonb_typeof\("mapping"\) = 'object'/);
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

        it('keeps ORDER BY out of the count query', async () => {
            const { repo, count } = makeRepo();

            await repo.queryMappings('12', {
                orderBy: {
                    path: 'mapping.c2h.lastAttemptAt',
                    direction: 'desc',
                },
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
            const { repo, page, count } = makeRepo();

            await repo.queryMappings('12', {
                omit: ['changeLog', 'lastCanonical'],
                take: 10,
            });

            expect(page().sql).toContain(`"mapping" - $2::text[] AS "mapping"`);
            expect(page().params[1]).toEqual(['changeLog', 'lastCanonical']);
            expect(page().sql).not.toContain('changeLog');
            expect(count().params).toEqual([12]);
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

        it('counts with exactly the WHERE clause and parameters of the page query', async () => {
            const { repo, page, count } = makeRepo({ total: 3 });

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

        it('runs the page and count queries in parallel', async () => {
            const { repo } = makeRepo();
            let inFlight = 0;
            let maxInFlight = 0;
            repo.prisma.$queryRawUnsafe = jest.fn(async (sql) => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise((resolve) => setImmediate(resolve));
                inFlight -= 1;
                return isCount(sql) ? [{ total: 0 }] : [];
            });

            await repo.queryMappings('12', syncedRecordsQuery);

            expect(maxInFlight).toBe(2);
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
        });

        afterEach(() => {
            for (const [key, value] of Object.entries(savedEnv)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
            resetEncryptionOptOut();
            resetCustomSchema();
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
                /queryMappings: field-level encryption still encrypts IntegrationMapping\.mapping/
            );
            expect(loadCustomEncryptionSchema).toHaveBeenCalled();
            expect(repo.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
        });

        it('runs when the app opts mapping out of encryption in its definition', async () => {
            enableEncryption();
            loadCustomEncryptionSchema.mockImplementation(() =>
                registerEncryptionOptOut({ IntegrationMapping: ['mapping'] })
            );
            const { repo } = makeRepo({ total: 1 });

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 1 });
            expect(loadCustomEncryptionSchema).toHaveBeenCalled();
        });

        it('runs when the opt-out is already registered', async () => {
            enableEncryption();
            registerEncryptionOptOut({ IntegrationMapping: ['mapping'] });
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 0 });
        });

        it('refuses to query while a custom schema still encrypts a nested mapping path', async () => {
            enableEncryption();
            registerCustomSchema({
                IntegrationMapping: { fields: ['mapping.secret'] },
            });
            registerEncryptionOptOut({ IntegrationMapping: ['mapping'] });
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).rejects.toThrow(
                /queryMappings: field-level encryption still encrypts IntegrationMapping\.mapping\.secret on write/
            );
            expect(repo.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
        });

        it('runs when the nested mapping path is opted out too', async () => {
            enableEncryption();
            registerCustomSchema({
                IntegrationMapping: { fields: ['mapping.secret'] },
            });
            registerEncryptionOptOut({
                IntegrationMapping: ['mapping', 'mapping.secret'],
            });
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 0 });
        });

        it('ignores an encrypted field that only shares the mapping prefix', async () => {
            enableEncryption();
            registerCustomSchema({
                IntegrationMapping: { fields: ['mappingVersion'] },
            });
            registerEncryptionOptOut({ IntegrationMapping: ['mapping'] });
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings('12', { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 0 });
        });

        it.each([['dev'], ['test'], ['local']])(
            'runs on STAGE=%s, where encryption is off and the opt-out is never registered',
            async (stage) => {
                process.env.STAGE = stage;
                process.env.AES_KEY_ID = 'test-key';
                const { repo } = makeRepo();

                await expect(
                    repo.queryMappings('12', { take: 10 })
                ).resolves.toEqual({ mappings: [], total: 0 });
            }
        );
    });
});

describe.each([
    ['MongoDB', IntegrationMappingRepositoryMongo],
    ['DocumentDB', IntegrationMappingRepositoryDocumentDB],
])('IntegrationMappingRepository%s.queryMappings', (dbName, Repository) => {
    it('is not supported yet and never touches the database', async () => {
        const repo = new Repository();
        repo.prisma = {
            $runCommandRaw: jest.fn(),
            integrationMapping: { findMany: jest.fn() },
        };

        await expect(
            repo.queryMappings('507f1f77bcf86cd799439011', { take: 10 })
        ).rejects.toThrow(`queryMappings is not supported on ${dbName} yet`);
        expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
        expect(repo.prisma.integrationMapping.findMany).not.toHaveBeenCalled();
    });
});

describe('IntegrationMappingRepositoryInterface.queryMappings', () => {
    it('must be implemented by an adapter', async () => {
        await expect(
            new IntegrationMappingRepositoryInterface().queryMappings('1', {
                take: 10,
            })
        ).rejects.toThrow(
            'Method queryMappings must be implemented by subclass'
        );
    });
});

const normalize = (sql) => sql.replace(/\s+/g, ' ').trim();
