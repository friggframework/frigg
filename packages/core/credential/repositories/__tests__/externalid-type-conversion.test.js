/**
 * @jest-environment node
 */

const { CredentialRepositoryMongo } = require('../credential-repository-mongo');
const { CredentialRepositoryPostgres } = require('../credential-repository-postgres');

describe('Credential Repository - externalId Type Conversion', () => {
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = {
            credential: {
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
        };
    });

    describe('MongoDB Repository', () => {
        let repository;

        beforeEach(() => {
            repository = new CredentialRepositoryMongo(mockPrisma);
        });

        describe('upsertCredential', () => {
            it('should convert integer externalId to string when creating', async () => {
                mockPrisma.credential.findFirst.mockResolvedValue(null);
                mockPrisma.credential.create.mockResolvedValue({
                    id: 'cred-123',
                    userId: 'user-123',
                    externalId: '1944396',
                    authIsValid: true,
                    data: { access_token: 'token' },
                });

                await repository.upsertCredential({
                    identifiers: { userId: 'user-123' },
                    details: {
                        userId: 'user-123',
                        externalId: 1944396, // Integer from HubSpot
                        access_token: 'token',
                    },
                });

                expect(mockPrisma.credential.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        externalId: '1944396', // Should be converted to string
                    }),
                });
            });

            it('should convert integer externalId to string when updating', async () => {
                mockPrisma.credential.findFirst.mockResolvedValue({
                    id: 'cred-123',
                    userId: 'user-123',
                    externalId: '1944396',
                    authIsValid: true,
                    data: {},
                });
                mockPrisma.credential.update.mockResolvedValue({
                    id: 'cred-123',
                    userId: 'user-123',
                    externalId: '999999',
                    authIsValid: true,
                    data: {},
                });

                await repository.upsertCredential({
                    identifiers: { userId: 'user-123' },
                    details: {
                        externalId: 999999, // Integer
                    },
                });

                expect(mockPrisma.credential.update).toHaveBeenCalledWith({
                    where: { id: 'cred-123' },
                    data: expect.objectContaining({
                        externalId: '999999', // Should be converted to string
                    }),
                });
            });

            it('should handle string externalId without conversion', async () => {
                mockPrisma.credential.findFirst.mockResolvedValue(null);
                mockPrisma.credential.create.mockResolvedValue({
                    id: 'cred-123',
                    userId: 'user-123',
                    externalId: 'ext-abc',
                    authIsValid: true,
                    data: {},
                });

                await repository.upsertCredential({
                    identifiers: { userId: 'user-123' },
                    details: {
                        userId: 'user-123',
                        externalId: 'ext-abc', // Already string
                    },
                });

                expect(mockPrisma.credential.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        externalId: 'ext-abc',
                    }),
                });
            });
        });

        describe('_convertIdentifiersToWhere', () => {
            it('should convert integer externalId to string in where clause', () => {
                const where = repository._convertIdentifiersToWhere({
                    externalId: 12345,
                });

                expect(where.externalId).toBe('12345');
            });
        });

        describe('_convertFilterToWhere', () => {
            it('should convert integer externalId to string in filter', () => {
                const where = repository._convertFilterToWhere({
                    externalId: 67890,
                });

                expect(where.externalId).toBe('67890');
            });
        });
    });

    describe('PostgreSQL Repository', () => {
        let repository;

        beforeEach(() => {
            repository = new CredentialRepositoryPostgres(mockPrisma);
        });

        it('should convert integer externalId to string when creating', async () => {
            mockPrisma.credential.findFirst.mockResolvedValue(null);
            mockPrisma.credential.create.mockResolvedValue({
                id: 123,
                userId: 456,
                externalId: '1944396',
                authIsValid: true,
                data: {},
            });

            await repository.upsertCredential({
                identifiers: {
                    user: 456,
                    externalId: 1944396, // Integer - gets converted in _convertIdentifiersToWhere
                },
                details: {
                    authIsValid: true,
                },
            });

            expect(mockPrisma.credential.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    externalId: '1944396', // Should be string (from identifiers)
                }),
            });
        });

        it('should convert integer externalId in identifiers', () => {
            const where = repository._convertIdentifiersToWhere({
                externalId: 99999,
            });

            expect(where.externalId).toBe('99999');
        });
    });
});
