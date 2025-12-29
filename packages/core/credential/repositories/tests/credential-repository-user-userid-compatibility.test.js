jest.mock('../../../database/config', () => ({
    DB_TYPE: 'postgresql',
    getDatabaseType: jest.fn(() => 'postgresql'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const {
    CredentialRepositoryPostgres,
} = require('../credential-repository-postgres');

describe('CredentialRepositoryPostgres - user/userId compatibility', () => {
    let repository;
    let mockPrisma;

    beforeEach(() => {
        // Mock Prisma client
        mockPrisma = {
            credential: {
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
        };

        repository = new CredentialRepositoryPostgres();
        repository.prisma = mockPrisma;
    });

    describe('upsertCredential with legacy "user" field', () => {
        it('should accept identifiers.user instead of identifiers.userId for backward compatibility', async () => {
            const credentialDetails = {
                identifiers: {
                    user: '13', // Legacy field name
                    externalId: 'workspace-123',
                },
                details: {
                    access_token: 'token-abc',
                    refresh_token: 'refresh-xyz',
                    authIsValid: true,
                },
            };

            mockPrisma.credential.findFirst.mockResolvedValue(null);
            mockPrisma.credential.create.mockResolvedValue({
                id: 1,
                userId: 13,
                externalId: 'workspace-123',
                data: {
                    access_token: 'token-abc',
                    refresh_token: 'refresh-xyz',
                },
                authIsValid: true,
            });

            // Should not throw "userId required in identifiers" error
            await expect(
                repository.upsertCredential(credentialDetails)
            ).resolves.not.toThrow();

            // Should convert user to userId and create credential
            expect(mockPrisma.credential.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        userId: 13, // Converted from string '13' to int
                        externalId: 'workspace-123',
                    }),
                })
            );
        });

        it('should prefer userId over user when both are provided', async () => {
            const credentialDetails = {
                identifiers: {
                    userId: '15', // Preferred field
                    user: '13', // Legacy field (should be ignored)
                    externalId: 'workspace-123',
                },
                details: {
                    access_token: 'token-abc',
                    authIsValid: true,
                },
            };

            mockPrisma.credential.findFirst.mockResolvedValue(null);
            mockPrisma.credential.create.mockResolvedValue({
                id: 1,
                userId: 15,
                externalId: 'workspace-123',
                data: { access_token: 'token-abc' },
                authIsValid: true,
            });

            await repository.upsertCredential(credentialDetails);

            // Should use userId (15), not user (13)
            expect(mockPrisma.credential.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        userId: 15, // Used userId field
                    }),
                })
            );
        });

        it('should throw error when neither userId nor user is provided', async () => {
            const credentialDetails = {
                identifiers: {
                    externalId: 'workspace-123',
                    // Missing both userId and user
                },
                details: {
                    access_token: 'token-abc',
                    authIsValid: true,
                },
            };

            await expect(
                repository.upsertCredential(credentialDetails)
            ).rejects.toThrow('userId required in identifiers');
        });

        it('should update existing credential using user field in where clause', async () => {
            const credentialDetails = {
                identifiers: {
                    user: '13', // Legacy field
                    externalId: 'workspace-123',
                },
                details: {
                    access_token: 'new-token',
                    authIsValid: true,
                },
            };

            const existingCredential = {
                id: 1,
                userId: 13,
                externalId: 'workspace-123',
                data: { access_token: 'old-token' },
                authIsValid: true,
            };

            mockPrisma.credential.findFirst.mockResolvedValue(
                existingCredential
            );
            mockPrisma.credential.update.mockResolvedValue({
                ...existingCredential,
                data: { access_token: 'new-token' },
            });

            await repository.upsertCredential(credentialDetails);

            // Should find existing credential using converted userId
            expect(mockPrisma.credential.findFirst).toHaveBeenCalledWith({
                where: expect.objectContaining({
                    userId: 13, // Converted from user field
                    externalId: 'workspace-123',
                }),
            });

            // Should update the credential
            expect(mockPrisma.credential.update).toHaveBeenCalled();
        });
    });

    describe('_convertIdentifiersToWhere compatibility', () => {
        it('should convert user field to userId in where clause', () => {
            const identifiers = {
                user: '13',
                externalId: 'workspace-123',
            };

            const where = repository._convertIdentifiersToWhere(identifiers);

            expect(where).toEqual({
                userId: 13, // Converted from user
                externalId: 'workspace-123',
            });
        });

        it('should prioritize userId over user when both present', () => {
            const identifiers = {
                userId: '15',
                user: '13',
                externalId: 'workspace-123',
            };

            const where = repository._convertIdentifiersToWhere(identifiers);

            expect(where).toEqual({
                userId: 15, // Used userId, not user
                externalId: 'workspace-123',
            });
        });
    });
});
