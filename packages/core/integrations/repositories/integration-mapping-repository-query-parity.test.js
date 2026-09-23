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

const { ObjectId } = require('bson');
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
        'c2h-failed-a',
        'crm:1',
        {
            crmId: '1',
            c2h: {
                lastStatus: 'failed',
                lastAttemptAt: '2026-01-03T00:00:00.000Z',
            },
            changeLog: [{ at: 1 }],
            lastCanonical: { name: 'a' },
        },
    ],
    [
        'c2h-failed-b',
        'crm:2',
        {
            crmId: '2',
            c2h: {
                lastStatus: 'failed',
                lastAttemptAt: '2026-01-01T00:00:00.000Z',
            },
            changeLog: ['x'],
        },
    ],
    [
        'c2h-skipped',
        'crm:3',
        {
            crmId: '3',
            c2h: {
                lastStatus: 'skipped',
                lastAttemptAt: '2026-01-02T00:00:00.000Z',
            },
        },
    ],
    [
        'c2h-synced-tie',
        'crm:4',
        {
            crmId: '4',
            c2h: {
                lastStatus: 'synced',
                lastAttemptAt: '2026-01-02T00:00:00.000Z',
            },
        },
    ],
    [
        'reverse-no-crm',
        'reverse:5',
        {
            h2c: {
                lastStatus: 'failed',
                lastAttemptAt: '2026-01-05T00:00:00.000Z',
            },
        },
    ],
    [
        'reverse-with-crm',
        'reverse:6',
        {
            crmId: '6',
            c2h: {
                lastStatus: 'failed',
                lastAttemptAt: '2026-01-06T00:00:00.000Z',
            },
            h2c: { lastStatus: 'synced' },
        },
    ],
    [
        'null-source',
        null,
        {
            crmId: '7',
            c2h: { lastStatus: 'failed' },
            h2c: { lastStatus: 'failed', lastAttemptAt: 7 },
        },
    ],
    [
        'status-null',
        'crm:8',
        { c2h: { lastStatus: null, lastAttemptAt: null } },
    ],
    [
        'status-array',
        'crm:9',
        { c2h: { lastStatus: ['failed'], lastAttemptAt: [1, 2] } },
    ],
    [
        'c2h-array',
        'crm:10',
        {
            c2h: [
                {
                    lastStatus: 'failed',
                    lastAttemptAt: '2026-01-09T00:00:00.000Z',
                },
            ],
        },
    ],
    ['c2h-string', 'crm:11', { c2h: 'failed' }],
    [
        'c2h-null',
        'crm:12',
        { c2h: null, h2c: { lastStatus: 'skipped', lastAttemptAt: 3 } },
    ],
    [
        'attempt-number',
        'crm:13',
        { c2h: { lastStatus: 'failed', lastAttemptAt: 42 } },
    ],
    [
        'attempt-bool',
        'crm:14',
        { c2h: { lastStatus: 'skipped', lastAttemptAt: false } },
    ],
    [
        'attempt-object',
        'crm:15',
        { c2h: { lastStatus: 'failed', lastAttemptAt: { at: 1 } } },
    ],
    [
        'status-dollar',
        'crm:16',
        {
            c2h: {
                lastStatus: '$failed',
                lastAttemptAt: '2026-01-04T00:00:00.000Z',
            },
        },
    ],
    ['prefix-dot', 'a.b:17', { c2h: { lastStatus: 'failed' } }],
    ['prefix-dot-lookalike', 'aXb:18', { c2h: { lastStatus: 'failed' } }],
    [
        'prefix-group',
        '(x)+:19',
        { h2c: { lastStatus: 'failed', lastAttemptAt: 1 } },
    ],
    ['prefix-anchors', '^$:20', { h2c: { lastStatus: 'skipped' } }],
    ['prefix-class', '[x]:21', { c2h: { lastStatus: 'skipped' } }],
    ['prefix-backslash', '\\:22', { c2h: { lastStatus: 'synced' } }],
    [
        'prefix-wildcard',
        '.*:23',
        { h2c: { lastStatus: 'synced', lastAttemptAt: 2 } },
    ],
    [
        'prefix-unicode',
        'é😀:24',
        {
            c2h: {
                lastStatus: 'failed',
                lastAttemptAt: '2026-01-07T00:00:00.000Z',
            },
        },
    ],
    ['mapping-ciphertext', 'crm:25', CIPHERTEXT],
    ['mapping-array', 'crm:26', [{ c2h: { lastStatus: 'failed' } }]],
    ['mapping-empty', 'crm:27', {}],
].map(([key, sourceId, mapping]) => ({ key, sourceId, mapping }));

const OTHER_INTEGRATION_FIXTURES = [
    {
        key: 'other-failed',
        sourceId: 'crm:1',
        mapping: {
            crmId: '1',
            c2h: {
                lastStatus: 'failed',
                lastAttemptAt: '2026-01-01T00:00:00.000Z',
            },
        },
    },
    {
        key: 'other-null-source',
        sourceId: null,
        mapping: { h2c: { lastStatus: 'failed' } },
    },
];

const REVERSE_GROUP = {
    anyOf: [
        { path: 'sourceId', op: 'notStartsWith', value: 'reverse:' },
        { path: 'mapping.crmId', op: 'notExists' },
    ],
};
const OMIT = ['changeLog', 'lastCanonical'];
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
    for (const direction of ['c2h', 'h2c']) {
        for (const statuses of [
            null,
            ['failed'],
            ['failed', 'skipped'],
            ['synced'],
            ['$failed'],
        ]) {
            for (const reverse of [false, true]) {
                for (const sort of [undefined, 'asc', 'desc']) {
                    for (const [skip, take] of PAGES) {
                        queries.push({
                            where: [
                                { path: `mapping.${direction}`, op: 'exists' },
                                ...(statuses
                                    ? [
                                          {
                                              path: `mapping.${direction}.lastStatus`,
                                              op: 'in',
                                              value: statuses,
                                          },
                                      ]
                                    : []),
                                ...(reverse ? [REVERSE_GROUP] : []),
                            ],
                            ...(sort && {
                                orderBy: {
                                    path: `mapping.${direction}.lastAttemptAt`,
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
        'reverse:',
        'a.b',
        '(x)+',
        '^$',
        '[x]',
        '\\',
        '.*',
        'é😀',
        'crm:1',
    ];
    const paths = [
        'mapping.c2h',
        'mapping.c2h.lastStatus',
        'mapping.c2h.lastAttemptAt',
        'mapping.c2h.lastAttemptAt.at',
        'mapping.c2h.lastStatus.x',
        'mapping.crmId',
        'mapping.h2c.lastAttemptAt',
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
                'mapping.crmId',
                'mapping.c2h.lastAttemptAt',
                'mapping.h2c.lastAttemptAt',
                'mapping.c2h.lastAttemptAt.at',
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
                            path: 'mapping.c2h.lastStatus',
                            op: 'in',
                            value: ['synced'],
                        },
                        {
                            path: 'mapping.h2c.lastStatus',
                            op: 'in',
                            value: ['synced'],
                        },
                    ],
                },
            ],
            take: 500,
        },
        { where: [], take: 500, omit: ['c2h', 'h2c', 'crmId', 'missing'] },
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

const LEGS = [
    {
        name: 'MongoDB',
        url: MONGO_URL,
        compareIds: compareHex,
        async setUp() {
            const client = mongoClient();
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
        async setUp() {
            const client = mongoClient();
            const repo = new IntegrationMappingRepositoryDocumentDB();
            repo.prisma = client;
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
        async setUp() {
            const {
                PrismaClient,
            } = require('../../generated/prisma-postgresql');
            const client = new PrismaClient({ datasourceUrl: POSTGRES_URL });
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
