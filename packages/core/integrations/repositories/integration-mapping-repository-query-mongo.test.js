jest.mock('../../database/encryption/encryption-schema-registry', () => ({
    ...jest.requireActual(
        '../../database/encryption/encryption-schema-registry'
    ),
    loadCustomEncryptionSchema: jest.fn(),
}));

const {
    loadCustomEncryptionSchema,
    registerEncryptionOptOut,
    resetCustomSchema,
    resetEncryptionOptOut,
} = require('../../database/encryption/encryption-schema-registry');
const {
    resetMappingEncryptionCheck,
} = require('../../database/encryption/integration-mapping-encryption');
const {
    IntegrationMappingRepositoryMongo,
} = require('./integration-mapping-repository-mongo');

const INTEGRATION_ID = '65a0000000000000000000aa';

function makeRepo({ mappings = [], total = mappings.length } = {}) {
    const repo = new IntegrationMappingRepositoryMongo();
    repo.prisma = {
        $runCommandRaw: jest.fn(async () => ({
            cursor: {
                firstBatch: [
                    {
                        mappings,
                        total: total > 0 ? [{ total }] : [],
                    },
                ],
                id: 0,
            },
            ok: 1,
        })),
    };
    const command = () => repo.prisma.$runCommandRaw.mock.calls[0][0];
    return { repo, command };
}

const rawDoc = (overrides = {}) => ({
    _id: { $oid: '65a0000000000000000000b1' },
    integrationId: { $oid: INTEGRATION_ID },
    sourceId: 'record:1',
    mapping: { externalId: '1' },
    createdAt: { $date: '2026-01-01T00:00:00.000Z' },
    updatedAt: { $date: '2026-01-02T00:00:00.000Z' },
    ...overrides,
});

describe('IntegrationMappingRepositoryMongo.queryMappings', () => {
    it('answers with one aggregate that matches the ObjectId and counts next to the page', async () => {
        const { repo, command } = makeRepo({ mappings: [rawDoc()], total: 7 });

        const result = await repo.queryMappings(INTEGRATION_ID, { take: 10 });

        expect(repo.prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
        expect(command()).toEqual({
            aggregate: 'IntegrationMapping',
            pipeline: [
                {
                    $match: {
                        integrationId: { $oid: INTEGRATION_ID },
                        $expr: {
                            $and: [{ $eq: [{ $type: '$mapping' }, 'object'] }],
                        },
                    },
                },
                {
                    $facet: {
                        mappings: [{ $sort: { _id: 1 } }, { $limit: 10 }],
                        total: [{ $count: 'total' }],
                    },
                },
            ],
            cursor: {},
            allowDiskUse: true,
        });
        expect(result).toEqual({
            mappings: [
                {
                    id: '65a0000000000000000000b1',
                    integrationId: INTEGRATION_ID,
                    sourceId: 'record:1',
                    mapping: { externalId: '1' },
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
                },
            ],
            total: 7,
        });
    });

    describe('a status-filtered page query', () => {
        const pageQuery = {
            where: [
                { path: 'mapping.outbound', op: 'exists' },
                {
                    path: 'mapping.outbound.status',
                    op: 'in',
                    value: ['failed'],
                },
                {
                    anyOf: [
                        {
                            path: 'sourceId',
                            op: 'notStartsWith',
                            value: 'alias:',
                        },
                        { path: 'mapping.externalId', op: 'notExists' },
                    ],
                },
            ],
            orderBy: {
                path: 'mapping.outbound.attemptedAt',
                direction: 'desc',
            },
            skip: 25,
            take: 25,
            omit: ['history', 'snapshot', 'extras'],
        };
        const LAST_STATUS = {
            $cond: [
                { $eq: [{ $type: '$mapping.outbound' }, 'object'] },
                '$mapping.outbound.status',
                null,
            ],
        };
        const LAST_ATTEMPT_AT = {
            $cond: [
                { $eq: [{ $type: '$mapping.outbound' }, 'object'] },
                '$mapping.outbound.attemptedAt',
                null,
            ],
        };

        it('filters inside $expr, resolving a nested path only through objects', async () => {
            const { repo, command } = makeRepo();

            await repo.queryMappings(INTEGRATION_ID, pageQuery);

            expect(command().pipeline[0]).toEqual({
                $match: {
                    integrationId: { $oid: INTEGRATION_ID },
                    $expr: {
                        $and: [
                            { $eq: [{ $type: '$mapping' }, 'object'] },
                            {
                                $ne: [
                                    { $ifNull: ['$mapping.outbound', null] },
                                    null,
                                ],
                            },
                            {
                                $and: [
                                    { $eq: [{ $type: LAST_STATUS }, 'string'] },
                                    {
                                        $in: [
                                            LAST_STATUS,
                                            { $literal: ['failed'] },
                                        ],
                                    },
                                ],
                            },
                            {
                                $or: [
                                    {
                                        $cond: [
                                            {
                                                $eq: [
                                                    { $type: '$sourceId' },
                                                    'string',
                                                ],
                                            },
                                            {
                                                $ne: [
                                                    {
                                                        $substrCP: [
                                                            '$sourceId',
                                                            0,
                                                            6,
                                                        ],
                                                    },
                                                    { $literal: 'alias:' },
                                                ],
                                            },
                                            true,
                                        ],
                                    },
                                    {
                                        $eq: [
                                            {
                                                $ifNull: [
                                                    '$mapping.externalId',
                                                    null,
                                                ],
                                            },
                                            null,
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                },
            });
        });

        it('sorts by a type-ranked key with nulls last, omits keys before the sort, then skips and limits', async () => {
            const { repo, command } = makeRepo();

            await repo.queryMappings(INTEGRATION_ID, pageQuery);

            expect(command().pipeline[1].$facet.mappings).toEqual([
                {
                    $addFields: {
                        __sortKey: {
                            $let: {
                                vars: { value: LAST_ATTEMPT_AT },
                                in: {
                                    missing: {
                                        $eq: [
                                            { $ifNull: ['$$value', null] },
                                            null,
                                        ],
                                    },
                                    rank: {
                                        $switch: {
                                            branches: [
                                                {
                                                    case: {
                                                        $in: [
                                                            {
                                                                $type: '$$value',
                                                            },
                                                            ['string'],
                                                        ],
                                                    },
                                                    then: 1,
                                                },
                                                {
                                                    case: {
                                                        $in: [
                                                            {
                                                                $type: '$$value',
                                                            },
                                                            [
                                                                'int',
                                                                'long',
                                                                'double',
                                                                'decimal',
                                                            ],
                                                        ],
                                                    },
                                                    then: 2,
                                                },
                                                {
                                                    case: {
                                                        $in: [
                                                            {
                                                                $type: '$$value',
                                                            },
                                                            ['bool'],
                                                        ],
                                                    },
                                                    then: 3,
                                                },
                                                {
                                                    case: {
                                                        $in: [
                                                            {
                                                                $type: '$$value',
                                                            },
                                                            ['array'],
                                                        ],
                                                    },
                                                    then: 4,
                                                },
                                                {
                                                    case: {
                                                        $in: [
                                                            {
                                                                $type: '$$value',
                                                            },
                                                            ['object'],
                                                        ],
                                                    },
                                                    then: 5,
                                                },
                                            ],
                                            default: 0,
                                        },
                                    },
                                    value: {
                                        $cond: [
                                            {
                                                $in: [
                                                    { $type: '$$value' },
                                                    [
                                                        'string',
                                                        'int',
                                                        'long',
                                                        'double',
                                                        'decimal',
                                                        'bool',
                                                    ],
                                                ],
                                            },
                                            '$$value',
                                            null,
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
                {
                    $project: {
                        'mapping.history': 0,
                        'mapping.snapshot': 0,
                        'mapping.extras': 0,
                    },
                },
                {
                    $sort: {
                        '__sortKey.missing': 1,
                        '__sortKey.rank': -1,
                        '__sortKey.value': -1,
                        _id: -1,
                    },
                },
                { $skip: 25 },
                { $limit: 25 },
            ]);
        });

        it('sorts ascending with nulls still last and ties by id ascending', async () => {
            const { repo, command } = makeRepo();

            await repo.queryMappings(INTEGRATION_ID, {
                orderBy: {
                    path: 'mapping.outbound.attemptedAt',
                    direction: 'asc',
                },
                take: 10,
            });

            expect(command().pipeline[1].$facet.mappings[1]).toEqual({
                $sort: {
                    '__sortKey.missing': 1,
                    '__sortKey.rank': 1,
                    '__sortKey.value': 1,
                    _id: 1,
                },
            });
        });

        it('checks every enclosing object of a deeper path', async () => {
            const { repo, command } = makeRepo();

            await repo.queryMappings(INTEGRATION_ID, {
                where: [{ path: 'mapping.a.b.c', op: 'exists' }],
                take: 10,
            });

            expect(command().pipeline[0].$match.$expr.$and[1]).toEqual({
                $ne: [
                    {
                        $ifNull: [
                            {
                                $cond: [
                                    {
                                        $and: [
                                            {
                                                $eq: [
                                                    { $type: '$mapping.a' },
                                                    'object',
                                                ],
                                            },
                                            {
                                                $eq: [
                                                    { $type: '$mapping.a.b' },
                                                    'object',
                                                ],
                                            },
                                        ],
                                    },
                                    '$mapping.a.b.c',
                                    null,
                                ],
                            },
                            null,
                        ],
                    },
                    null,
                ],
            });
        });

        it('keeps caller values literal, so a leading $ is never read as a field path', async () => {
            const { repo, command } = makeRepo();

            await repo.queryMappings(INTEGRATION_ID, {
                where: [
                    { path: 'mapping.status', op: 'in', value: ['$sourceId'] },
                    {
                        path: 'sourceId',
                        op: 'notStartsWith',
                        value: '$mapping',
                    },
                ],
                take: 10,
            });

            const [, inCondition, prefixCondition] =
                command().pipeline[0].$match.$expr.$and;
            expect(inCondition.$and[1].$in[1]).toEqual({
                $literal: ['$sourceId'],
            });
            expect(prefixCondition.$cond[1].$ne[1]).toEqual({
                $literal: '$mapping',
            });
        });

        it('measures a notStartsWith prefix in code points', async () => {
            const { repo, command } = makeRepo();

            await repo.queryMappings(INTEGRATION_ID, {
                where: [
                    { path: 'sourceId', op: 'notStartsWith', value: '😀é:' },
                ],
                take: 10,
            });

            const [, prefixCondition] = command().pipeline[0].$match.$expr.$and;
            expect(prefixCondition.$cond[1].$ne[0]).toEqual({
                $substrCP: ['$sourceId', 0, 3],
            });
        });
    });

    describe('total', () => {
        it('returns 0 and no rows when nothing matches', async () => {
            const { repo } = makeRepo({ total: 0 });

            await expect(
                repo.queryMappings(INTEGRATION_ID, { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 0 });
        });

        it('returns the total for an empty page past the end', async () => {
            const { repo } = makeRepo({ total: 12 });

            await expect(
                repo.queryMappings(INTEGRATION_ID, { skip: 50, take: 10 })
            ).resolves.toEqual({ mappings: [], total: 12 });
        });
    });

    it('returns a null sourceId for a document without one, as findMany does', async () => {
        const doc = rawDoc();
        delete doc.sourceId;
        const { repo } = makeRepo({ mappings: [doc] });

        const { mappings } = await repo.queryMappings(INTEGRATION_ID, {
            take: 10,
        });

        expect(mappings[0].sourceId).toBeNull();
    });

    describe('input errors', () => {
        it('rejects an invalid query before touching the database', async () => {
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings(INTEGRATION_ID, {
                    where: [{ path: 'mapping.outbound.$x', op: 'exists' }],
                    take: 10,
                })
            ).rejects.toThrow(/queryMappings: invalid path/);
            expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
        });

        it.each([['12'], ['65a0000000000000000000zz'], [undefined], [null]])(
            'rejects the integration id %p before touching the database',
            async (integrationId) => {
                const { repo } = makeRepo();

                await expect(
                    repo.queryMappings(integrationId, { take: 10 })
                ).rejects.toThrow(/is not an ObjectId/);
                expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
            }
        );
    });

    describe('encryption guard', () => {
        const ENV_KEYS = ['STAGE', 'NODE_ENV', 'AES_KEY_ID', 'KMS_KEY_ARN'];
        let savedEnv;

        beforeEach(() => {
            savedEnv = Object.fromEntries(
                ENV_KEYS.map((key) => [key, process.env[key]])
            );
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'test-key';
            delete process.env.KMS_KEY_ARN;
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

        it('refuses to query while encryption still encrypts mapping on write', async () => {
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings(INTEGRATION_ID, { take: 10 })
            ).rejects.toThrow(
                "queryMappings: field-level encryption still encrypts IntegrationMapping.mapping on write, so it cannot be queried. Opt out by adding 'mapping' to appDefinition.encryption.disable.IntegrationMapping."
            );
            expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
        });

        it('runs when the app opts mapping out of encryption', async () => {
            loadCustomEncryptionSchema.mockImplementation(() =>
                registerEncryptionOptOut({ IntegrationMapping: ['mapping'] })
            );
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings(INTEGRATION_ID, { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 0 });
        });
    });
});
