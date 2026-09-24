/**
 * queryMappings parity against real databases. Every case runs through each
 * adapter and must equal an in-memory reference of the Postgres semantics.
 *
 * Skipped unless a database URL is set:
 * - QUERY_MAPPINGS_PARITY_MONGO_URL (a replica set) runs the MongoDB and the
 *   DocumentDB adapters against MongoDB.
 * - QUERY_MAPPINGS_PARITY_POSTGRES_URL (schema pushed from
 *   prisma-postgresql) runs the PostgreSQL adapter.
 */

jest.mock('../../database/encryption/encryption-schema-registry', () => ({
    ...jest.requireActual(
        '../../database/encryption/encryption-schema-registry'
    ),
    loadCustomEncryptionSchema: jest.fn(),
}));

const { ObjectId } = require('bson');
const { Cryptor } = require('../../encrypt/Cryptor');
const {
    createEncryptionExtension,
} = require('../../database/encryption/prisma-encryption-extension');
const {
    registerCustomSchema,
    registerEncryptionOptOut,
    resetCustomSchema,
    resetEncryptionOptOut,
} = require('../../database/encryption/encryption-schema-registry');
const {
    resetMappingEncryptionCheck,
} = require('../../database/encryption/integration-mapping-encryption');
const {
    DocumentDBEncryptionService,
} = require('../../database/documentdb-encryption-service');
const {
    IntegrationMappingRepositoryMongo,
} = require('./integration-mapping-repository-mongo');
const {
    IntegrationMappingRepositoryDocumentDB,
} = require('./integration-mapping-repository-documentdb');
const {
    IntegrationMappingRepositoryPostgres,
} = require('./integration-mapping-repository-postgres');

const MONGO_URL = process.env.QUERY_MAPPINGS_PARITY_MONGO_URL;
const POSTGRES_URL = process.env.QUERY_MAPPINGS_PARITY_POSTGRES_URL;

const CIPHERTEXT =
    'YWVzLWtleS0x:TXlJVkhlcmUxMjM0NTY3OA==:QWN0dWFsQ2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5QmFzZTY0VmFsdWU=';

const FIXTURES = [
    [
        'outbound-failed-a',
        'record:1',
        {
            externalId: '1',
            outbound: {
                status: 'failed',
                attemptedAt: '2026-01-03T00:00:00.000Z',
            },
            history: [{ at: 1 }],
            snapshot: { name: 'a' },
        },
    ],
    [
        'outbound-failed-b',
        'record:2',
        {
            externalId: '2',
            outbound: {
                status: 'failed',
                attemptedAt: '2026-01-01T00:00:00.000Z',
            },
            history: ['x'],
        },
    ],
    [
        'outbound-skipped',
        'record:3',
        {
            externalId: '3',
            outbound: {
                status: 'skipped',
                attemptedAt: '2026-01-02T00:00:00.000Z',
            },
        },
    ],
    [
        'outbound-synced-tie',
        'record:4',
        {
            externalId: '4',
            outbound: {
                status: 'synced',
                attemptedAt: '2026-01-02T00:00:00.000Z',
            },
        },
    ],
    [
        'alias-without-external-id',
        'alias:5',
        {
            inbound: {
                status: 'failed',
                attemptedAt: '2026-01-05T00:00:00.000Z',
            },
        },
    ],
    [
        'alias-with-external-id',
        'alias:6',
        {
            externalId: '6',
            outbound: {
                status: 'failed',
                attemptedAt: '2026-01-06T00:00:00.000Z',
            },
            inbound: { status: 'synced' },
        },
    ],
    [
        'null-source',
        null,
        {
            externalId: '7',
            outbound: { status: 'failed' },
            inbound: { status: 'failed', attemptedAt: 7 },
        },
    ],
    [
        'status-null',
        'record:8',
        { outbound: { status: null, attemptedAt: null } },
    ],
    [
        'status-array',
        'record:9',
        { outbound: { status: ['failed'], attemptedAt: [1, 2] } },
    ],
    [
        'outbound-array',
        'record:10',
        {
            outbound: [
                {
                    status: 'failed',
                    attemptedAt: '2026-01-09T00:00:00.000Z',
                },
            ],
        },
    ],
    ['outbound-string', 'record:11', { outbound: 'failed' }],
    [
        'outbound-null',
        'record:12',
        { outbound: null, inbound: { status: 'skipped', attemptedAt: 3 } },
    ],
    [
        'attempt-number',
        'record:13',
        { outbound: { status: 'failed', attemptedAt: 42 } },
    ],
    [
        'attempt-bool',
        'record:14',
        { outbound: { status: 'skipped', attemptedAt: false } },
    ],
    [
        'attempt-object',
        'record:15',
        { outbound: { status: 'failed', attemptedAt: { at: 1 } } },
    ],
    [
        'status-dollar',
        'record:16',
        {
            outbound: {
                status: '$failed',
                attemptedAt: '2026-01-04T00:00:00.000Z',
            },
        },
    ],
    ['prefix-dot', 'a.b:17', { outbound: { status: 'failed' } }],
    ['prefix-dot-lookalike', 'aXb:18', { outbound: { status: 'failed' } }],
    [
        'prefix-group',
        '(x)+:19',
        { inbound: { status: 'failed', attemptedAt: 1 } },
    ],
    ['prefix-anchors', '^$:20', { inbound: { status: 'skipped' } }],
    ['prefix-class', '[x]:21', { outbound: { status: 'skipped' } }],
    ['prefix-backslash', '\\:22', { outbound: { status: 'synced' } }],
    [
        'prefix-wildcard',
        '.*:23',
        { inbound: { status: 'synced', attemptedAt: 2 } },
    ],
    [
        'prefix-unicode',
        'é😀:24',
        {
            outbound: {
                status: 'failed',
                attemptedAt: '2026-01-07T00:00:00.000Z',
            },
        },
    ],
    ['mapping-ciphertext', 'record:25', CIPHERTEXT],
    ['mapping-array', 'record:26', [{ outbound: { status: 'failed' } }]],
    ['mapping-empty', 'record:27', {}],
].map(([key, sourceId, mapping]) => ({ key, sourceId, mapping }));

const OTHER_INTEGRATION_FIXTURES = [
    {
        key: 'other-failed',
        sourceId: 'record:1',
        mapping: {
            externalId: '1',
            outbound: {
                status: 'failed',
                attemptedAt: '2026-01-01T00:00:00.000Z',
            },
        },
    },
    {
        key: 'other-null-source',
        sourceId: null,
        mapping: { inbound: { status: 'failed' } },
    },
];

const ALIAS_GROUP = {
    anyOf: [
        { path: 'sourceId', op: 'notStartsWith', value: 'alias:' },
        { path: 'mapping.externalId', op: 'notExists' },
    ],
};
const OMIT = ['history', 'snapshot'];
const PAGES = [
    [0, 1],
    [0, 3],
    [2, 2],
    [1, 500],
    [4, 3],
    [100, 10],
    [0, 500],
];

function statusQueries() {
    const queries = [];
    for (const direction of ['outbound', 'inbound']) {
        for (const statuses of [
            null,
            ['failed'],
            ['failed', 'skipped'],
            ['synced'],
            ['$failed'],
        ]) {
            for (const withAlias of [false, true]) {
                for (const sort of [undefined, 'asc', 'desc']) {
                    for (const [skip, take] of PAGES) {
                        queries.push({
                            where: [
                                { path: `mapping.${direction}`, op: 'exists' },
                                ...(statuses
                                    ? [
                                          {
                                              path: `mapping.${direction}.status`,
                                              op: 'in',
                                              value: statuses,
                                          },
                                      ]
                                    : []),
                                ...(withAlias ? [ALIAS_GROUP] : []),
                            ],
                            ...(sort && {
                                orderBy: {
                                    path: `mapping.${direction}.attemptedAt`,
                                    direction: sort,
                                },
                            }),
                            skip,
                            take,
                            omit: OMIT,
                        });
                    }
                }
            }
        }
    }
    return queries;
}

function edgeQueries() {
    const prefixes = [
        'alias:',
        'a.b',
        '(x)+',
        '^$',
        '[x]',
        '\\',
        '.*',
        'é😀',
        'record:1',
    ];
    const paths = [
        'mapping.outbound',
        'mapping.outbound.status',
        'mapping.outbound.attemptedAt',
        'mapping.outbound.attemptedAt.at',
        'mapping.outbound.status.x',
        'mapping.externalId',
        'mapping.inbound.attemptedAt',
    ];
    return [
        ...prefixes.map((value) => ({
            where: [{ path: 'sourceId', op: 'notStartsWith', value }],
            take: 500,
        })),
        ...paths.flatMap((path) => [
            { where: [{ path, op: 'exists' }], take: 500 },
            { where: [{ path, op: 'notExists' }], take: 500 },
            {
                where: [
                    { path, op: 'in', value: ['failed', '42', 'false', '1'] },
                ],
                take: 500,
            },
        ]),
        ...['asc', 'desc'].flatMap((direction) =>
            [
                'mapping.externalId',
                'mapping.outbound.attemptedAt',
                'mapping.inbound.attemptedAt',
                'mapping.outbound.attemptedAt.at',
            ].map((path) => ({
                orderBy: { path, direction },
                take: 500,
            }))
        ),
        {
            where: [
                {
                    anyOf: [
                        {
                            path: 'mapping.outbound.status',
                            op: 'in',
                            value: ['synced'],
                        },
                        {
                            path: 'mapping.inbound.status',
                            op: 'in',
                            value: ['synced'],
                        },
                    ],
                },
            ],
            take: 500,
        },
        {
            where: [],
            take: 500,
            omit: ['outbound', 'inbound', 'externalId', 'missing'],
        },
    ];
}

const CASES = [...statusQueries(), ...edgeQueries()].map((query) => [
    JSON.stringify(query),
    query,
]);

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const absent = (value) => value === undefined || value === null;

function resolve(mapping, dottedPath) {
    let value = mapping;
    for (const segment of dottedPath.split('.').slice(1)) {
        if (!isObject(value) || !Object.hasOwn(value, segment))
            return undefined;
        value = value[segment];
    }
    return value;
}

const MATCHES = {
    exists: (row, { path }) => !absent(resolve(row.mapping, path)),
    notExists: (row, { path }) => absent(resolve(row.mapping, path)),
    in: (row, { path, value }) => {
        const resolved = resolve(row.mapping, path);
        return typeof resolved === 'string' && value.includes(resolved);
    },
    notStartsWith: (row, { value }) =>
        row.sourceId === null || !row.sourceId.startsWith(value),
};

const matchesEntry = (row, entry) =>
    entry.anyOf
        ? entry.anyOf.some((condition) => MATCHES[condition.op](row, condition))
        : MATCHES[entry.op](row, entry);

function typeRank(value) {
    if (typeof value === 'string') return 1;
    if (typeof value === 'number') return 2;
    if (typeof value === 'boolean') return 3;
    return Array.isArray(value) ? 4 : 5;
}

function compareValues(a, b) {
    const rank = typeRank(a) - typeRank(b);
    if (rank !== 0 || typeRank(a) > 3) return rank;
    return a < b ? -1 : a > b ? 1 : 0;
}

function referencePage(
    rows,
    { where = [], orderBy, skip = 0, take, omit = [] },
    compareIds
) {
    const matched = rows.filter(
        (row) =>
            isObject(row.mapping) &&
            where.every((entry) => matchesEntry(row, entry))
    );
    const direction = orderBy?.direction === 'desc' ? -1 : 1;
    const sorted = [...matched].sort((a, b) => {
        if (orderBy) {
            const va = resolve(a.mapping, orderBy.path);
            const vb = resolve(b.mapping, orderBy.path);
            if (absent(va) !== absent(vb)) return absent(va) ? 1 : -1;
            const byValue = absent(va) ? 0 : compareValues(va, vb);
            if (byValue !== 0) return direction * byValue;
        }
        return direction * compareIds(a.id, b.id);
    });
    return {
        total: matched.length,
        rows: sorted.slice(skip, skip + take).map((row) => ({
            key: row.key,
            sourceId: row.sourceId,
            mapping: Object.fromEntries(
                Object.entries(row.mapping).filter(([k]) => !omit.includes(k))
            ),
        })),
    };
}

const compareHex = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const compareInts = (a, b) => Number(a) - Number(b);

function mongoClient() {
    const { PrismaClient } = require('../../generated/prisma-mongodb');
    return new PrismaClient({ datasourceUrl: MONGO_URL });
}

const newObjectIdHex = () => new ObjectId().toHexString();

const withEncryption = (client, cryptor) =>
    cryptor ? client.$extends(createEncryptionExtension({ cryptor })) : client;

const LEGS = [
    {
        name: 'MongoDB',
        url: MONGO_URL,
        compareIds: compareHex,
        async setUp({ cryptor } = {}) {
            const client = withEncryption(mongoClient(), cryptor);
            const repo = new IntegrationMappingRepositoryMongo();
            repo.prisma = client;
            const integrationIds = [newObjectIdHex(), newObjectIdHex()];
            return {
                repo,
                integrationIds,
                seed: async (integrationId, { sourceId, mapping }) =>
                    (
                        await client.integrationMapping.create({
                            data: { integrationId, sourceId, mapping },
                        })
                    ).id,
                tearDown: async () => {
                    await client.integrationMapping.deleteMany({
                        where: { integrationId: { in: integrationIds } },
                    });
                    await client.$disconnect();
                },
            };
        },
    },
    {
        name: 'DocumentDB',
        url: MONGO_URL,
        compareIds: compareHex,
        async setUp({ cryptor } = {}) {
            const client = mongoClient();
            const repo = new IntegrationMappingRepositoryDocumentDB();
            repo.prisma = client;
            if (cryptor) {
                repo.encryptionService = new DocumentDBEncryptionService({
                    cryptor,
                });
            }
            const integrationIds = [newObjectIdHex(), newObjectIdHex()];
            return {
                repo,
                integrationIds,
                seed: async (integrationId, { sourceId, mapping }) =>
                    (await repo.upsertMapping(integrationId, sourceId, mapping))
                        .id,
                tearDown: async () => {
                    for (const id of integrationIds)
                        await repo.deleteMappingsByIntegration(id);
                    await client.$disconnect();
                },
            };
        },
    },
    {
        name: 'PostgreSQL',
        url: POSTGRES_URL,
        compareIds: compareInts,
        async setUp({ cryptor } = {}) {
            const {
                PrismaClient,
            } = require('../../generated/prisma-postgresql');
            const client = withEncryption(
                new PrismaClient({ datasourceUrl: POSTGRES_URL }),
                cryptor
            );
            const repo = new IntegrationMappingRepositoryPostgres();
            repo.prisma = client;
            const integrations = [
                await client.integration.create({ data: {} }),
                await client.integration.create({ data: {} }),
            ];
            const integrationIds = integrations.map(({ id }) => String(id));
            return {
                repo,
                integrationIds,
                seed: async (integrationId, { sourceId, mapping }) =>
                    String(
                        (
                            await client.integrationMapping.create({
                                data: {
                                    integrationId: Number(integrationId),
                                    sourceId,
                                    mapping,
                                },
                            })
                        ).id
                    ),
                tearDown: async () => {
                    await client.integration.deleteMany({
                        where: { id: { in: integrations.map(({ id }) => id) } },
                    });
                    await client.$disconnect();
                },
            };
        },
    },
];

const RUNNABLE_LEGS = LEGS.filter((leg) => leg.url).map((leg) => [
    leg.name,
    leg,
]);
const describeLegs =
    RUNNABLE_LEGS.length > 0
        ? describe.each(RUNNABLE_LEGS)
        : describe.skip.each([['no database URL set', null]]);

describeLegs('queryMappings parity on %s', (_, leg) => {
    let context;
    let rows;

    beforeAll(async () => {
        context = await leg.setUp();
        const [integrationId, otherIntegrationId] = context.integrationIds;
        rows = [];
        for (const fixture of FIXTURES) {
            rows.push({
                ...fixture,
                id: await context.seed(integrationId, fixture),
            });
        }
        for (const fixture of OTHER_INTEGRATION_FIXTURES) {
            await context.seed(otherIntegrationId, fixture);
        }
    }, 60000);

    afterAll(async () => {
        await context?.tearDown();
    });

    it.each(CASES)('%s', async (_, query) => {
        const [integrationId] = context.integrationIds;
        const keyById = new Map(rows.map((row) => [row.id, row.key]));

        const { mappings, total } = await context.repo.queryMappings(
            integrationId,
            query
        );

        expect({
            total,
            rows: mappings.map((row) => ({
                key: keyById.get(row.id),
                sourceId: row.sourceId,
                mapping: row.mapping,
            })),
        }).toEqual(referencePage(rows, query, leg.compareIds));
    });

    it('returns rows equal to findMappingsByIntegration, object mappings only', async () => {
        const [integrationId] = context.integrationIds;

        const { mappings } = await context.repo.queryMappings(integrationId, {
            take: 500,
        });
        const found = await context.repo.findMappingsByIntegration(
            integrationId
        );

        const expected = found
            .filter((row) => isObject(row.mapping))
            .sort((a, b) => leg.compareIds(a.id, b.id));
        expect(mappings).toEqual(expected);
    });
});

describeLegs(
    'queryMappings on %s after a nested mapping path is opted out of encryption',
    (_, leg) => {
        const ENV_KEYS = ['STAGE', 'AES_KEY_ID', 'AES_KEY', 'KMS_KEY_ARN'];
        const LEGACY = { externalId: 'legacy', apiSecret: 'legacy-secret' };
        const FRESH = { externalId: 'fresh', apiSecret: 'fresh-secret' };
        let savedEnv;
        let context;

        beforeAll(async () => {
            context = await leg.setUp({
                cryptor: new Cryptor({ shouldUseAws: false }),
            });

            savedEnv = Object.fromEntries(
                ENV_KEYS.map((key) => [key, process.env[key]])
            );
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'parity-key';
            process.env.AES_KEY = '12345678901234567890123456789012';
            delete process.env.KMS_KEY_ARN;
            registerCustomSchema({
                IntegrationMapping: { fields: ['mapping.apiSecret'] },
            });
            registerEncryptionOptOut({ IntegrationMapping: ['mapping'] });
            resetMappingEncryptionCheck();

            const [integrationId] = context.integrationIds;
            await context.seed(integrationId, {
                sourceId: 'record:legacy',
                mapping: LEGACY,
            });
            registerEncryptionOptOut({
                IntegrationMapping: ['mapping', 'mapping.apiSecret'],
            });
            await context.seed(integrationId, {
                sourceId: 'record:fresh',
                mapping: FRESH,
            });
        }, 60000);

        afterAll(async () => {
            await context?.tearDown();
            for (const [key, value] of Object.entries(savedEnv ?? {})) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
            resetEncryptionOptOut();
            resetCustomSchema();
            resetMappingEncryptionCheck();
        });

        it('returns the path plain on rows written before the opt-out, like findMappingsByIntegration', async () => {
            const [integrationId] = context.integrationIds;

            const { mappings, total } = await context.repo.queryMappings(
                integrationId,
                { take: 10 }
            );
            const found = await context.repo.findMappingsByIntegration(
                integrationId
            );

            expect(total).toBe(2);
            expect(mappings.map((row) => row.mapping)).toEqual([LEGACY, FRESH]);
            expect(mappings).toEqual(
                [...found].sort((a, b) => leg.compareIds(a.id, b.id))
            );
        });

        it('matches that path only on rows written after the opt-out', async () => {
            const [integrationId] = context.integrationIds;

            const { mappings } = await context.repo.queryMappings(
                integrationId,
                {
                    where: [
                        {
                            path: 'mapping.apiSecret',
                            op: 'in',
                            value: ['legacy-secret', 'fresh-secret'],
                        },
                    ],
                    take: 10,
                }
            );

            expect(mappings.map((row) => row.mapping)).toEqual([FRESH]);
        });

        it('leaves an omitted path out of the decrypted rows', async () => {
            const [integrationId] = context.integrationIds;

            const { mappings } = await context.repo.queryMappings(
                integrationId,
                { take: 10, omit: ['apiSecret'] }
            );

            expect(mappings.map((row) => row.mapping)).toEqual([
                { externalId: 'legacy' },
                { externalId: 'fresh' },
            ]);
        });
    }
);
