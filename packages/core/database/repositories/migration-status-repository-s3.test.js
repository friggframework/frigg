/**
 * Tests for Migration Status Repository (S3)
 * 
 * Tests S3-based storage for migration status tracking
 * (avoids chicken-and-egg dependency on User/Process tables)
 */

const { MigrationStatusRepositoryS3 } = require('./migration-status-repository-s3');

/**
 * @group unit
 * @group infrastructure
 */
describe('MigrationStatusRepositoryS3', () => {
    let repository;
    let mockS3Client;

    beforeEach(() => {
        mockS3Client = {
            send: jest.fn(),
        };
        repository = new MigrationStatusRepositoryS3('test-bucket', mockS3Client);
    });

    describe('create()', () => {
        it('should create new migration status record in S3', async () => {
            const migrationData = {
                migrationId: 'migration-123',
                stage: 'dev',
                triggeredBy: 'admin',
                triggeredAt: '2025-10-19T12:00:00Z',
            };

            mockS3Client.send.mockResolvedValue({});

            const result = await repository.create(migrationData);

            expect(result.migrationId).toBe('migration-123');
            expect(result.state).toBe('INITIALIZING');
            expect(mockS3Client.send).toHaveBeenCalled();
        });

        it('should generate UUID if migrationId not provided', async () => {
            const migrationData = {
                stage: 'dev',
                triggeredBy: 'admin',
                triggeredAt: '2025-10-19T12:00:00Z',
            };

            mockS3Client.send.mockResolvedValue({});

            const result = await repository.create(migrationData);

            expect(result.migrationId).toMatch(/^[a-f0-9-]{36}$/); // UUID format
            expect(result.state).toBe('INITIALIZING');
        });

        it('should store status at correct S3 key', async () => {
            const migrationData = {
                migrationId: 'migration-123',
                stage: 'dev',
            };

            mockS3Client.send.mockResolvedValue({});

            await repository.create(migrationData);

            const putCommand = mockS3Client.send.mock.calls[0][0];
            expect(putCommand.input.Bucket).toBe('test-bucket');
            expect(putCommand.input.Key).toBe('migrations/dev/migration-123.json');
        });
    });

    describe('update()', () => {
        it('should update existing migration status', async () => {
            mockS3Client.send.mockResolvedValue({
                Body: {
                    transformToString: () => JSON.stringify({
                        migrationId: 'migration-123',
                        state: 'INITIALIZING',
                        progress: 0,
                    }),
                },
            });

            const updateData = {
                migrationId: 'migration-123',
                stage: 'dev',
                state: 'RUNNING',
                progress: 50,
            };

            await repository.update(updateData);

            expect(mockS3Client.send).toHaveBeenCalledTimes(2); // GET then PUT
        });

        it('should merge updates with existing data', async () => {
            mockS3Client.send
                .mockResolvedValueOnce({
                    Body: {
                        transformToString: () => JSON.stringify({
                            migrationId: 'migration-123',
                            state: 'INITIALIZING',
                            progress: 0,
                            triggeredAt: '2025-10-19T12:00:00Z',
                        }),
                    },
                })
                .mockResolvedValueOnce({});

            await repository.update({
                migrationId: 'migration-123',
                stage: 'dev',
                state: 'COMPLETED',
                progress: 100,
            });

            const putCommand = mockS3Client.send.mock.calls[1][0];
            const storedData = JSON.parse(putCommand.input.Body);
            expect(storedData.triggeredAt).toBe('2025-10-19T12:00:00Z'); // Preserved
            expect(storedData.state).toBe('COMPLETED'); // Updated
        });
    });

    describe('get()', () => {
        it('should retrieve migration status from S3', async () => {
            const statusData = {
                migrationId: 'migration-123',
                state: 'COMPLETED',
                progress: 100,
            };

            mockS3Client.send.mockResolvedValue({
                Body: {
                    transformToString: () => JSON.stringify(statusData),
                },
            });

            const result = await repository.get('migration-123', 'dev');

            expect(result).toEqual(statusData);
            expect(mockS3Client.send).toHaveBeenCalled();
        });

        it('should throw error if migration not found', async () => {
            mockS3Client.send.mockRejectedValue({ name: 'NoSuchKey' });

            await expect(repository.get('nonexistent', 'dev')).rejects.toThrow(
                'Migration not found'
            );
        });
    });

    describe('S3 Key Generation', () => {
        it('should use consistent key format', () => {
            const key = repository._buildS3Key('migration-123', 'production');
            expect(key).toBe('migrations/production/migration-123.json');
        });
    });
});

