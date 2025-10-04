/**
 * @jest-environment node
 */

const { ModuleRepositoryMongo } = require('../module-repository-mongo');
const { ModuleRepositoryPostgres } = require('../module-repository-postgres');

describe('Module Repository - Entity externalId Type Conversion', () => {
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = {
            entity: {
                create: jest.fn(),
                update: jest.fn(),
                findUnique: jest.fn(),
            },
        };
    });

    describe('MongoDB Repository', () => {
        let repository;

        beforeEach(() => {
            repository = new ModuleRepositoryMongo(mockPrisma);
        });

        describe('createEntity', () => {
            it('should convert integer externalId to string', async () => {
                mockPrisma.entity.create.mockResolvedValue({
                    id: 'entity-123',
                    userId: 'user-123',
                    credentialId: 'cred-123',
                    moduleName: 'hubspot',
                    externalId: '1944396',
                    name: 'Test Entity',
                    credential: {},
                });

                await repository.createEntity({
                    userId: 'user-123',
                    credentialId: 'cred-123',
                    moduleName: 'hubspot',
                    externalId: 1944396, // Integer from HubSpot
                    name: 'Test Entity',
                });

                expect(mockPrisma.entity.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        externalId: '1944396', // Should be converted to string
                    }),
                    include: { credential: true },
                });
            });

            it('should handle string externalId without conversion', async () => {
                mockPrisma.entity.create.mockResolvedValue({
                    id: 'entity-123',
                    userId: 'user-123',
                    credentialId: 'cred-123',
                    moduleName: 'salesforce',
                    externalId: 'sf-abc-123',
                    name: 'Test Entity',
                    credential: {},
                });

                await repository.createEntity({
                    userId: 'user-123',
                    credentialId: 'cred-123',
                    moduleName: 'salesforce',
                    externalId: 'sf-abc-123', // Already string
                    name: 'Test Entity',
                });

                expect(mockPrisma.entity.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        externalId: 'sf-abc-123',
                    }),
                    include: { credential: true },
                });
            });

            it('should handle undefined externalId', async () => {
                mockPrisma.entity.create.mockResolvedValue({
                    id: 'entity-123',
                    userId: 'user-123',
                    credentialId: 'cred-123',
                    moduleName: 'hubspot',
                    externalId: null,
                    name: 'Test Entity',
                    credential: {},
                });

                await repository.createEntity({
                    userId: 'user-123',
                    credentialId: 'cred-123',
                    moduleName: 'hubspot',
                    name: 'Test Entity',
                    // externalId not provided
                });

                expect(mockPrisma.entity.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        externalId: undefined,
                    }),
                    include: { credential: true },
                });
            });
        });

        describe('updateEntity', () => {
            it('should convert integer externalId to string when updating', async () => {
                mockPrisma.entity.update.mockResolvedValue({
                    id: 'entity-123',
                    userId: 'user-123',
                    credentialId: 'cred-123',
                    moduleName: 'hubspot',
                    externalId: '999999',
                    name: 'Updated Entity',
                    credential: {},
                });

                await repository.updateEntity('entity-123', {
                    externalId: 999999, // Integer
                    name: 'Updated Entity',
                });

                expect(mockPrisma.entity.update).toHaveBeenCalledWith({
                    where: { id: 'entity-123' },
                    data: expect.objectContaining({
                        externalId: '999999', // Should be string
                    }),
                    include: { credential: true },
                });
            });
        });

        describe('_convertFilterToWhere', () => {
            it('should convert integer externalId to string in filter', () => {
                const where = repository._convertFilterToWhere({
                    externalId: 12345,
                });

                expect(where.externalId).toBe('12345');
            });
        });
    });

    describe('PostgreSQL Repository', () => {
        let repository;

        beforeEach(() => {
            repository = new ModuleRepositoryPostgres(mockPrisma);
        });

        describe('createEntity', () => {
            it('should convert integer externalId to string', async () => {
                mockPrisma.entity.create.mockResolvedValue({
                    id: 123,
                    userId: 456,
                    credentialId: 789,
                    moduleName: 'hubspot',
                    externalId: '1944396',
                    name: 'Test Entity',
                    credential: {},
                });

                await repository.createEntity({
                    userId: 456,
                    credentialId: 789,
                    moduleName: 'hubspot',
                    externalId: 1944396, // Integer
                    name: 'Test Entity',
                });

                expect(mockPrisma.entity.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        externalId: '1944396', // Should be string
                    }),
                    include: { credential: true },
                });
            });
        });

        describe('updateEntity', () => {
            it('should convert integer externalId to string', async () => {
                mockPrisma.entity.update.mockResolvedValue({
                    id: 123,
                    userId: 456,
                    credentialId: 789,
                    moduleName: 'hubspot',
                    externalId: '999999',
                    name: 'Updated',
                    credential: {},
                });

                await repository.updateEntity(123, {
                    externalId: 999999, // Integer
                });

                expect(mockPrisma.entity.update).toHaveBeenCalledWith({
                    where: { id: 123 },
                    data: expect.objectContaining({
                        externalId: '999999', // Should be string
                    }),
                    include: { credential: true },
                });
            });
        });

        it('should convert integer externalId in filter', () => {
            const where = repository._convertFilterToWhere({
                externalId: 67890,
            });

            expect(where.externalId).toBe('67890');
        });
    });
});
