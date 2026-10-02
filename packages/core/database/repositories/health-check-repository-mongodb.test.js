const { HealthCheckRepositoryMongoDB } = require('./health-check-repository-mongodb');

describe('HealthCheckRepositoryMongoDB', () => {
    let repository;
    let mockPrismaClient;

    beforeEach(() => {
        mockPrismaClient = {
            $runCommandRaw: jest.fn(),
            credential: {
                findRaw: jest.fn(),
                create: jest.fn(),
                findUnique: jest.fn(),
                delete: jest.fn(),
            },
        };
        
        repository = new HealthCheckRepositoryMongoDB({ 
            prismaClient: mockPrismaClient 
        });
    });

    describe('getDatabaseConnectionState()', () => {
        it('should return connected state when ping succeeds', async () => {
            mockPrismaClient.$runCommandRaw.mockResolvedValue({ ok: 1 });

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            });
            expect(mockPrismaClient.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should return disconnected state when ping fails', async () => {
            mockPrismaClient.$runCommandRaw.mockRejectedValue(new Error('Connection failed'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
            expect(mockPrismaClient.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should return disconnected state when ping throws network error', async () => {
            mockPrismaClient.$runCommandRaw.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
        });

        it('should return disconnected state when ping times out', async () => {
            mockPrismaClient.$runCommandRaw.mockRejectedValue(new Error('Timeout'));

            const result = await repository.getDatabaseConnectionState();

            expect(result.isConnected).toBe(false);
            expect(result.stateName).toBe('disconnected');
        });
    });

    describe('pingDatabase()', () => {
        it('should return response time when ping succeeds', async () => {
            mockPrismaClient.$runCommandRaw.mockResolvedValue({ ok: 1 });

            const responseTime = await repository.pingDatabase(2000);

            expect(typeof responseTime).toBe('number');
            expect(responseTime).toBeGreaterThanOrEqual(0);
            expect(mockPrismaClient.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should throw error when ping fails', async () => {
            const error = new Error('Database unreachable');
            mockPrismaClient.$runCommandRaw.mockRejectedValue(error);

            await expect(repository.pingDatabase(2000)).rejects.toThrow('Database unreachable');
        });

        it('should measure actual response time', async () => {
            mockPrismaClient.$runCommandRaw.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve({ ok: 1 }), 50))
            );

            const responseTime = await repository.pingDatabase(2000);

            expect(responseTime).toBeGreaterThanOrEqual(50);
            expect(responseTime).toBeLessThan(200);
        });

        it('should reject with timeout error when ping exceeds maxTimeMS', async () => {
            mockPrismaClient.$runCommandRaw.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve({ ok: 1 }), 500))
            );

            await expect(repository.pingDatabase(50)).rejects.toThrow('Database ping timeout');
        });
    });

    describe('getRawCredentialById()', () => {
        it('should return null when id is falsy', async () => {
            const result = await repository.getRawCredentialById(null);
            expect(result).toBeNull();
            expect(mockPrismaClient.credential.findRaw).not.toHaveBeenCalled();
        });

        it('should return the first result from findRaw', async () => {
            const mockCredential = { _id: '123', data: { access_token: 'tok' } };
            mockPrismaClient.credential.findRaw.mockResolvedValue([mockCredential]);

            const result = await repository.getRawCredentialById('123');

            expect(result).toEqual(mockCredential);
            expect(mockPrismaClient.credential.findRaw).toHaveBeenCalledWith({
                filter: { _id: { $oid: '123' } },
            });
        });

        it('should return null when findRaw returns empty array', async () => {
            mockPrismaClient.credential.findRaw.mockResolvedValue([]);

            const result = await repository.getRawCredentialById('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('createCredential()', () => {
        it('should delegate to prisma.credential.create', async () => {
            const credentialData = { userId: 'u1', authIsValid: true };
            const created = { id: 'c1', ...credentialData };
            mockPrismaClient.credential.create.mockResolvedValue(created);

            const result = await repository.createCredential(credentialData);

            expect(result).toEqual(created);
            expect(mockPrismaClient.credential.create).toHaveBeenCalledWith({
                data: credentialData,
            });
        });
    });

    describe('findCredentialById()', () => {
        it('should delegate to prisma.credential.findUnique', async () => {
            const credential = { id: 'c1', userId: 'u1' };
            mockPrismaClient.credential.findUnique.mockResolvedValue(credential);

            const result = await repository.findCredentialById('c1');

            expect(result).toEqual(credential);
            expect(mockPrismaClient.credential.findUnique).toHaveBeenCalledWith({
                where: { id: 'c1' },
            });
        });
    });

    describe('deleteCredential()', () => {
        it('should delegate to prisma.credential.delete', async () => {
            mockPrismaClient.credential.delete.mockResolvedValue(undefined);

            await repository.deleteCredential('c1');

            expect(mockPrismaClient.credential.delete).toHaveBeenCalledWith({
                where: { id: 'c1' },
            });
        });
    });
});

