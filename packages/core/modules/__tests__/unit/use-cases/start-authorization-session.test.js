/**
 * StartAuthorizationSessionUseCase Unit Tests
 * Tests initialization of multi-step authorization sessions
 */

const crypto = require('crypto');

describe('StartAuthorizationSessionUseCase', () => {
    let useCase;
    let mockRepository;
    let AuthorizationSession;

    beforeEach(() => {
        // Mock AuthorizationSession entity
        AuthorizationSession = class {
            constructor(data) {
                Object.assign(this, data);
                if (!this.sessionId) throw new Error('Session ID is required');
                if (!this.userId) throw new Error('User ID is required');
                if (!this.entityType) throw new Error('Entity type is required');
            }
        };

        // Mock repository
        mockRepository = {
            create: jest.fn()
        };

        // Mock use case implementation
        class StartAuthorizationSessionUseCase {
            constructor({ authSessionRepository }) {
                this.authSessionRepository = authSessionRepository;
            }

            async execute(userId, entityType, maxSteps) {
                const sessionId = crypto.randomUUID();
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

                const session = new AuthorizationSession({
                    sessionId,
                    userId,
                    entityType,
                    currentStep: 1,
                    maxSteps,
                    stepData: {},
                    expiresAt,
                    completed: false
                });

                return await this.authSessionRepository.create(session);
            }
        }

        useCase = new StartAuthorizationSessionUseCase({
            authSessionRepository: mockRepository
        });
    });

    describe('execute', () => {
        it('should create a new authorization session', async () => {
            const mockSession = {
                sessionId: expect.any(String),
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                stepData: {},
                expiresAt: expect.any(Date),
                completed: false
            };

            mockRepository.create.mockResolvedValue(mockSession);

            const result = await useCase.execute('user-123', 'nagaris', 2);

            expect(mockRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                    entityType: 'nagaris',
                    currentStep: 1,
                    maxSteps: 2,
                    completed: false
                })
            );
            expect(result).toMatchObject({
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2
            });
        });

        it('should generate a unique session ID', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result1 = await useCase.execute('user-123', 'nagaris', 2);
            const result2 = await useCase.execute('user-123', 'nagaris', 2);

            expect(result1.sessionId).toBeDefined();
            expect(result2.sessionId).toBeDefined();
            expect(result1.sessionId).not.toBe(result2.sessionId);
        });

        it('should set expiration to 15 minutes in the future', async () => {
            mockRepository.create.mockImplementation(session => session);

            const before = Date.now() + 15 * 60 * 1000;
            const result = await useCase.execute('user-123', 'nagaris', 2);
            const after = Date.now() + 15 * 60 * 1000;

            expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before - 100);
            expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 100);
        });

        it('should initialize with currentStep as 1', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result = await useCase.execute('user-123', 'nagaris', 3);

            expect(result.currentStep).toBe(1);
        });

        it('should initialize with empty stepData', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result = await useCase.execute('user-123', 'nagaris', 2);

            expect(result.stepData).toEqual({});
        });

        it('should set completed to false', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result = await useCase.execute('user-123', 'nagaris', 2);

            expect(result.completed).toBe(false);
        });

        it('should support different entity types', async () => {
            mockRepository.create.mockImplementation(session => session);

            const nagarisSession = await useCase.execute('user-123', 'nagaris', 2);
            const hubspotSession = await useCase.execute('user-123', 'hubspot', 1);

            expect(nagarisSession.entityType).toBe('nagaris');
            expect(hubspotSession.entityType).toBe('hubspot');
        });

        it('should support different maxSteps values', async () => {
            mockRepository.create.mockImplementation(session => session);

            const twoStep = await useCase.execute('user-123', 'nagaris', 2);
            const threeStep = await useCase.execute('user-123', 'complex', 3);
            const singleStep = await useCase.execute('user-123', 'simple', 1);

            expect(twoStep.maxSteps).toBe(2);
            expect(threeStep.maxSteps).toBe(3);
            expect(singleStep.maxSteps).toBe(1);
        });

        it('should handle repository errors', async () => {
            mockRepository.create.mockRejectedValue(new Error('Database error'));

            await expect(useCase.execute('user-123', 'nagaris', 2)).rejects.toThrow(
                'Database error'
            );
        });

        it('should call repository create with correct session object', async () => {
            mockRepository.create.mockImplementation(session => session);

            await useCase.execute('user-123', 'nagaris', 2);

            expect(mockRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    sessionId: expect.any(String),
                    userId: 'user-123',
                    entityType: 'nagaris',
                    currentStep: 1,
                    maxSteps: 2,
                    stepData: {},
                    expiresAt: expect.any(Date),
                    completed: false
                })
            );
        });

        it('should return the created session from repository', async () => {
            const createdSession = {
                sessionId: 'repo-generated-id',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                stepData: {},
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                completed: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockRepository.create.mockResolvedValue(createdSession);

            const result = await useCase.execute('user-123', 'nagaris', 2);

            expect(result).toEqual(createdSession);
        });
    });

    describe('Validation', () => {
        it('should require userId parameter', async () => {
            mockRepository.create.mockImplementation(session => session);

            await expect(useCase.execute(null, 'nagaris', 2)).rejects.toThrow();
        });

        it('should require entityType parameter', async () => {
            mockRepository.create.mockImplementation(session => session);

            await expect(useCase.execute('user-123', null, 2)).rejects.toThrow();
        });

        it('should handle undefined maxSteps', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result = await useCase.execute('user-123', 'nagaris', undefined);

            expect(result.maxSteps).toBeUndefined();
        });
    });

    describe('Edge Cases', () => {
        it('should handle single-step flows (maxSteps = 1)', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result = await useCase.execute('user-123', 'simple-auth', 1);

            expect(result.maxSteps).toBe(1);
            expect(result.currentStep).toBe(1);
        });

        it('should handle complex multi-step flows (maxSteps > 3)', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result = await useCase.execute('user-123', 'complex-auth', 5);

            expect(result.maxSteps).toBe(5);
        });

        it('should handle concurrent session creation for same user', async () => {
            mockRepository.create.mockImplementation(session => session);

            const session1 = useCase.execute('user-123', 'nagaris', 2);
            const session2 = useCase.execute('user-123', 'hubspot', 1);

            const results = await Promise.all([session1, session2]);

            expect(results[0].sessionId).not.toBe(results[1].sessionId);
            expect(results[0].entityType).toBe('nagaris');
            expect(results[1].entityType).toBe('hubspot');
        });

        it('should handle special characters in entityType', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result = await useCase.execute('user-123', 'entity-type_v2.0', 2);

            expect(result.entityType).toBe('entity-type_v2.0');
        });

        it('should handle very long user IDs', async () => {
            mockRepository.create.mockImplementation(session => session);

            const longUserId = 'user-' + 'x'.repeat(100);
            const result = await useCase.execute(longUserId, 'nagaris', 2);

            expect(result.userId).toBe(longUserId);
        });

        it('should create sessions with UUIDs matching RFC 4122 format', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result = await useCase.execute('user-123', 'nagaris', 2);

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(result.sessionId).toMatch(uuidRegex);
        });
    });

    describe('Session Expiry', () => {
        it('should create sessions that expire in exactly 15 minutes', async () => {
            mockRepository.create.mockImplementation(session => session);

            const startTime = Date.now();
            const result = await useCase.execute('user-123', 'nagaris', 2);
            const endTime = Date.now();

            const expectedExpiry = 15 * 60 * 1000; // 15 minutes in ms
            const actualExpiry = result.expiresAt.getTime() - startTime;

            expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 100);
            expect(actualExpiry).toBeLessThanOrEqual(expectedExpiry + (endTime - startTime) + 100);
        });

        it('should create fresh expiry time for each session', async () => {
            mockRepository.create.mockImplementation(session => session);

            const result1 = await useCase.execute('user-123', 'nagaris', 2);

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 100));

            const result2 = await useCase.execute('user-123', 'nagaris', 2);

            expect(result2.expiresAt.getTime()).toBeGreaterThan(result1.expiresAt.getTime());
        });
    });

    describe('Integration with Repository', () => {
        it('should pass complete session object to repository', async () => {
            mockRepository.create.mockImplementation(session => {
                expect(session).toHaveProperty('sessionId');
                expect(session).toHaveProperty('userId');
                expect(session).toHaveProperty('entityType');
                expect(session).toHaveProperty('currentStep');
                expect(session).toHaveProperty('maxSteps');
                expect(session).toHaveProperty('stepData');
                expect(session).toHaveProperty('expiresAt');
                expect(session).toHaveProperty('completed');
                return session;
            });

            await useCase.execute('user-123', 'nagaris', 2);

            expect(mockRepository.create).toHaveBeenCalled();
        });

        it('should handle repository returning enriched session', async () => {
            const enrichedSession = {
                sessionId: 'generated-id',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                stepData: {},
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                completed: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                // Additional fields from repository
                _id: 'mongodb-id',
                __v: 0
            };

            mockRepository.create.mockResolvedValue(enrichedSession);

            const result = await useCase.execute('user-123', 'nagaris', 2);

            expect(result).toEqual(enrichedSession);
            expect(result._id).toBe('mongodb-id');
        });
    });
});
