const { wrapPrismaForDocumentDB, cleanForDocumentDB } = require('./prisma-documentdb-wrapper');

describe('Prisma DocumentDB Wrapper', () => {
    let originalEnv;
    let mockPrismaClient;

    beforeEach(() => {
        originalEnv = { ...process.env };
        
        // Mock Prisma client
        mockPrismaClient = {
            credential: {
                create: jest.fn(),
                createMany: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
                upsert: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
            },
            user: {
                create: jest.fn(),
                update: jest.fn(),
            },
            $connect: jest.fn(),
            $disconnect: jest.fn(),
        };
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.clearAllMocks();
    });

    describe('wrapPrismaForDocumentDB', () => {
        it('should return unwrapped client for non-DocumentDB', () => {
            process.env.MONGO_URI = 'mongodb://localhost:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            expect(wrapped).toBe(mockPrismaClient);
        });

        it('should wrap client for DocumentDB', () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            expect(wrapped).not.toBe(mockPrismaClient);
        });

        it('should clean undefined values in create()', async () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            await wrapped.credential.create({
                data: {
                    userId: 'user123',
                    externalId: undefined,
                    data: {
                        token: 'abc',
                        refresh: undefined,
                    },
                },
            });

            expect(mockPrismaClient.credential.create).toHaveBeenCalledWith({
                data: {
                    userId: 'user123',
                    data: {
                        token: 'abc',
                    },
                },
            });
        });

        it('should clean undefined values in createMany()', async () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            await wrapped.credential.createMany({
                data: [
                    { userId: 'user1', externalId: undefined },
                    { userId: 'user2', externalId: 'ext2' },
                ],
            });

            expect(mockPrismaClient.credential.createMany).toHaveBeenCalledWith({
                data: [
                    { userId: 'user1' },
                    { userId: 'user2', externalId: 'ext2' },
                ],
            });
        });

        it('should clean undefined values in update()', async () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            await wrapped.credential.update({
                where: { id: '123' },
                data: {
                    userId: 'user123',
                    externalId: undefined,
                },
            });

            expect(mockPrismaClient.credential.update).toHaveBeenCalledWith({
                where: { id: '123' },
                data: {
                    userId: 'user123',
                },
            });
        });

        it('should clean undefined values in upsert()', async () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            await wrapped.credential.upsert({
                where: { id: '123' },
                create: {
                    userId: 'user123',
                    externalId: undefined,
                },
                update: {
                    userId: 'user456',
                    data: undefined,
                },
            });

            expect(mockPrismaClient.credential.upsert).toHaveBeenCalledWith({
                where: { id: '123' },
                create: {
                    userId: 'user123',
                },
                update: {
                    userId: 'user456',
                },
            });
        });

        it('should not modify read operations', async () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            await wrapped.credential.findUnique({ where: { id: '123' } });
            await wrapped.credential.findMany({ where: { userId: 'user123' } });

            expect(mockPrismaClient.credential.findUnique).toHaveBeenCalledWith({
                where: { id: '123' },
            });
            expect(mockPrismaClient.credential.findMany).toHaveBeenCalledWith({
                where: { userId: 'user123' },
            });
        });

        it('should preserve null values', async () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            await wrapped.credential.create({
                data: {
                    userId: null,
                    externalId: undefined,
                },
            });

            expect(mockPrismaClient.credential.create).toHaveBeenCalledWith({
                data: {
                    userId: null,
                },
            });
        });

        it('should work with multiple models', async () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            await wrapped.credential.create({ data: { userId: undefined } });
            await wrapped.user.create({ data: { email: undefined } });

            expect(mockPrismaClient.credential.create).toHaveBeenCalledWith({ data: {} });
            expect(mockPrismaClient.user.create).toHaveBeenCalledWith({ data: {} });
        });

        it('should preserve non-model properties', () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const wrapped = wrapPrismaForDocumentDB(mockPrismaClient);

            expect(wrapped.$connect).toBe(mockPrismaClient.$connect);
            expect(wrapped.$disconnect).toBe(mockPrismaClient.$disconnect);
        });
    });

    describe('cleanForDocumentDB', () => {
        it('should return original data for non-DocumentDB', () => {
            process.env.MONGO_URI = 'mongodb://localhost:27017/test';

            const data = { field: undefined };
            const result = cleanForDocumentDB(data);

            expect(result).toBe(data);
            expect(result.field).toBeUndefined();
        });

        it('should clean data for DocumentDB', () => {
            process.env.MONGO_URI = 'mongodb://host.docdb.amazonaws.com:27017/test';

            const data = {
                field1: 'value',
                field2: undefined,
                field3: null,
            };
            const result = cleanForDocumentDB(data);

            expect(result).toEqual({
                field1: 'value',
                field3: null,
            });
        });
    });
});

