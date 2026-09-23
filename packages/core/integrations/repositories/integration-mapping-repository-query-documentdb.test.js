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
    IntegrationMappingRepositoryDocumentDB,
} = require('./integration-mapping-repository-documentdb');

const INTEGRATION_ID = '65a0000000000000000000aa';

const isCount = (command) =>
    command.pipeline[command.pipeline.length - 1].$count !== undefined;

function makeRepo({ docs = [], total = docs.length } = {}) {
    const repo = new IntegrationMappingRepositoryDocumentDB();
    repo.prisma = {
        $runCommandRaw: jest.fn(async (command) => ({
            cursor: {
                firstBatch: isCount(command)
                    ? total > 0
                        ? [{ total }]
                        : []
                    : docs,
                id: 0,
            },
            ok: 1,
        })),
    };
    const commands = () =>
        repo.prisma.$runCommandRaw.mock.calls.map(([command]) => command);
    const page = () => commands().find((command) => !isCount(command));
    const count = () => commands().find(isCount);
    return { repo, commands, page, count };
}

const storedDoc = (overrides = {}) => ({
    _id: '65a0000000000000000000b1',
    integrationId: INTEGRATION_ID,
    sourceId: 'record:1',
    mapping: { externalId: '1' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
});

const MATCH_OBJECT_MAPPINGS = {
    $match: {
        integrationId: INTEGRATION_ID,
        $expr: { $and: [{ $eq: [{ $type: '$mapping' }, 'object'] }] },
    },
};

describe('IntegrationMappingRepositoryDocumentDB.queryMappings', () => {
    it('runs the page and a separate count, since DocumentDB has no $facet', async () => {
        const { repo, commands, page, count } = makeRepo({
            docs: [storedDoc()],
            total: 7,
        });

        const result = await repo.queryMappings(INTEGRATION_ID, { take: 10 });

        expect(commands()).toHaveLength(2);
        expect(page()).toEqual({
            aggregate: 'IntegrationMapping',
            pipeline: [
                MATCH_OBJECT_MAPPINGS,
                { $sort: { _id: 1 } },
                { $limit: 10 },
                { $sort: { _id: 1 } },
            ],
            cursor: { batchSize: 1000 },
            allowDiskUse: true,
        });
        expect(count()).toEqual({
            aggregate: 'IntegrationMapping',
            pipeline: [MATCH_OBJECT_MAPPINGS, { $count: 'total' }],
            cursor: {},
        });
        expect(result).toEqual({
            mappings: [
                {
                    id: '65a0000000000000000000b1',
                    integrationId: INTEGRATION_ID,
                    sourceId: 'record:1',
                    mapping: { externalId: '1' },
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-02T00:00:00.000Z',
                },
            ],
            total: 7,
        });
    });

    it('ends the page with the same $sort, the only place DocumentDB keeps sort order', async () => {
        const { repo, page, count } = makeRepo();

        await repo.queryMappings(INTEGRATION_ID, {
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
        });

        const stages = page().pipeline.map((stage) => Object.keys(stage)[0]);
        expect(stages).toEqual([
            '$match',
            '$addFields',
            '$project',
            '$sort',
            '$skip',
            '$limit',
            '$sort',
        ]);
        const sort = {
            $sort: {
                '__sortKey.missing': 1,
                '__sortKey.rank': -1,
                '__sortKey.value': -1,
                _id: -1,
            },
        };
        expect(page().pipeline[3]).toEqual(sort);
        expect(page().pipeline[6]).toEqual(sort);
        expect(page().pipeline[2]).toEqual({
            $project: {
                'mapping.history': 0,
                'mapping.snapshot': 0,
                'mapping.extras': 0,
            },
        });
        expect(count().pipeline).toEqual([
            page().pipeline[0],
            { $count: 'total' },
        ]);
        expect(page().pipeline[0].$match.integrationId).toBe(INTEGRATION_ID);
        expect(page().pipeline[0].$match.$expr.$and).toHaveLength(4);
    });

    it('matches the integration id as the string DocumentDB stores', async () => {
        const { repo, page } = makeRepo();

        await repo.queryMappings(7, { take: 10 });

        expect(page().pipeline[0].$match.integrationId).toBe('7');
    });

    it('decrypts each row the way findMappingsByIntegration does', async () => {
        const { repo } = makeRepo({ docs: [storedDoc()] });
        repo.encryptionService = {
            decryptFields: jest.fn(async (_, doc) => ({
                ...doc,
                mapping: { externalId: 'decrypted' },
            })),
        };

        const { mappings } = await repo.queryMappings(INTEGRATION_ID, {
            take: 10,
        });

        expect(repo.encryptionService.decryptFields).toHaveBeenCalledWith(
            'IntegrationMapping',
            storedDoc()
        );
        expect(mappings[0].mapping).toEqual({ externalId: 'decrypted' });
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

    describe('input errors', () => {
        it('rejects an invalid query before touching the database', async () => {
            const { repo } = makeRepo();

            await expect(
                repo.queryMappings(INTEGRATION_ID, {
                    where: [{ path: 'sourceId', op: 'in', value: ['a'] }],
                    take: 10,
                })
            ).rejects.toThrow(/op "in" is not allowed on 'sourceId'/);
            expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
        });

        it.each([[undefined], [null], [''], [{}]])(
            'rejects the integration id %p instead of querying every integration',
            async (integrationId) => {
                const { repo } = makeRepo();

                await expect(
                    repo.queryMappings(integrationId, { take: 10 })
                ).rejects.toThrow(/Invalid ID/);
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
            repo.encryptionService = { decryptFields: jest.fn() };

            await expect(
                repo.queryMappings(INTEGRATION_ID, { take: 10 })
            ).resolves.toEqual({ mappings: [], total: 0 });
        });
    });
});
