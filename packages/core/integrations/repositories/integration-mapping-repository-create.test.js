jest.mock('../../database/prisma', () => ({
    prisma: { integrationMapping: {}, $runCommandRaw: jest.fn() },
}));
jest.mock('../../database/documentdb-encryption-service');

const {
    DocumentDBEncryptionService,
} = require('../../database/documentdb-encryption-service');
const { MappingAlreadyExistsError } = require('../../errors');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');
const {
    IntegrationMappingRepositoryMongo,
} = require('./integration-mapping-repository-mongo');
const {
    IntegrationMappingRepositoryPostgres,
} = require('./integration-mapping-repository-postgres');
const {
    IntegrationMappingRepository,
} = require('./integration-mapping-repository');
const {
    IntegrationMappingRepositoryDocumentDB,
} = require('./integration-mapping-repository-documentdb');

const uniqueViolation = () =>
    Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('IntegrationMappingRepositoryInterface.createMapping', () => {
    it('must be implemented by subclasses', async () => {
        await expect(
            new IntegrationMappingRepositoryInterface().createMapping(
                'i',
                's',
                {}
            )
        ).rejects.toThrow('createMapping must be implemented');
    });
});

describe.each([
    [
        'Mongo',
        () => new IntegrationMappingRepositoryMongo(),
        '65a0000000000000000000aa',
        '65a0000000000000000000aa',
    ],
    [
        'Prisma (generic)',
        () => new IntegrationMappingRepository({ integrationMapping: {} }),
        'int-1',
        'int-1',
    ],
    ['Postgres', () => new IntegrationMappingRepositoryPostgres(), '7', 7],
])('createMapping - %s', (_name, makeRepo, integrationId, storedId) => {
    let repo;
    let create;

    beforeEach(() => {
        repo = makeRepo();
        create = jest.fn();
        repo.prisma = { integrationMapping: { create } };
    });

    it('inserts via prisma create (never upsert)', async () => {
        create.mockResolvedValue({
            id: storedId,
            integrationId: storedId,
            sourceId: 'claim:hs:1',
            mapping: { a: 1 },
        });

        const result = await repo.createMapping(integrationId, 'claim:hs:1', {
            a: 1,
        });

        expect(create).toHaveBeenCalledWith({
            data: {
                integrationId: storedId,
                sourceId: 'claim:hs:1',
                mapping: { a: 1 },
            },
        });
        expect(result.sourceId).toBe('claim:hs:1');
        expect(result.mapping).toEqual({ a: 1 });
    });

    it('throws MappingAlreadyExistsError on unique violation (P2002)', async () => {
        create.mockRejectedValue(uniqueViolation());

        const error = await repo
            .createMapping(integrationId, 'claim:hs:1', {})
            .catch((e) => e);

        expect(error).toBeInstanceOf(MappingAlreadyExistsError);
        expect(error.sourceId).toBe('claim:hs:1');
    });

    it('rethrows other errors untouched', async () => {
        const boom = Object.assign(new Error('boom'), { code: 'P1001' });
        create.mockRejectedValue(boom);

        await expect(
            repo.createMapping(integrationId, 'claim:hs:1', {})
        ).rejects.toBe(boom);
    });
});

describe('createMapping - Postgres id handling', () => {
    it('returns string ids', async () => {
        const repo = new IntegrationMappingRepositoryPostgres();
        repo.prisma = {
            integrationMapping: {
                create: jest.fn().mockResolvedValue({
                    id: 3,
                    integrationId: 7,
                    sourceId: 's',
                    mapping: {},
                }),
            },
        };

        const result = await repo.createMapping('7', 's', {});

        expect(result.id).toBe('3');
        expect(result.integrationId).toBe('7');
    });
});

describe('createMapping - DocumentDB', () => {
    const INTEGRATION_ID = '65a0000000000000000000aa';
    let repo;
    let encryptionService;
    let runCommandRaw;

    beforeEach(() => {
        encryptionService = {
            encryptFields: jest.fn(async (_model, doc) => ({
                ...doc,
                mapping: 'enc:mapping',
            })),
            decryptFields: jest.fn(async (_model, doc) => ({
                ...doc,
                mapping: { a: 1 },
            })),
        };
        DocumentDBEncryptionService.mockImplementation(
            () => encryptionService
        );
        repo = new IntegrationMappingRepositoryDocumentDB();
        runCommandRaw = jest.fn();
        repo.prisma = { $runCommandRaw: runCommandRaw };
    });

    it('encrypts mapping and only inserts (no find-then-update)', async () => {
        runCommandRaw.mockImplementation(async (command) => {
            if (command.insert) {
                return {
                    ok: 1,
                    n: 1,
                    insertedId: command.documents[0]._id,
                };
            }
            return {
                cursor: {
                    firstBatch: [
                        {
                            ...command.filter,
                            _id: 'x',
                            integrationId: INTEGRATION_ID,
                            sourceId: 'claim:hs:1',
                            mapping: 'enc:mapping',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    ],
                },
                ok: 1,
            };
        });

        const result = await repo.createMapping(INTEGRATION_ID, 'claim:hs:1', {
            a: 1,
        });

        expect(encryptionService.encryptFields).toHaveBeenCalledWith(
            'IntegrationMapping',
            expect.objectContaining({
                integrationId: INTEGRATION_ID,
                sourceId: 'claim:hs:1',
                mapping: { a: 1 },
            })
        );
        const insert = runCommandRaw.mock.calls
            .map(([c]) => c)
            .find((c) => c.insert);
        expect(insert.documents[0].mapping).toBe('enc:mapping');
        expect(runCommandRaw.mock.calls[0][0].insert).toBe('IntegrationMapping');
        expect(result.mapping).toEqual({ a: 1 });
        expect(result.sourceId).toBe('claim:hs:1');
    });

    it('throws MappingAlreadyExistsError on duplicate key (11000)', async () => {
        runCommandRaw.mockResolvedValue({
            ok: 1,
            n: 0,
            writeErrors: [{ index: 0, code: 11000, errmsg: 'E11000 dup' }],
        });

        const error = await repo
            .createMapping(INTEGRATION_ID, 'claim:hs:1', {})
            .catch((e) => e);

        expect(error).toBeInstanceOf(MappingAlreadyExistsError);
        expect(error.integrationId).toBe(INTEGRATION_ID);
        expect(error.sourceId).toBe('claim:hs:1');
    });

    it('rethrows other write errors untouched', async () => {
        runCommandRaw.mockResolvedValue({
            ok: 1,
            n: 0,
            writeErrors: [{ index: 0, code: 121, errmsg: 'validation' }],
        });

        await expect(
            repo.createMapping(INTEGRATION_ID, 'claim:hs:1', {})
        ).rejects.not.toBeInstanceOf(MappingAlreadyExistsError);
    });
});
