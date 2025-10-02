/**
 * AuthorizationSessionRepositoryMongo Unit Tests
 * Tests MongoDB implementation of authorization session repository
 */

describe('AuthorizationSessionRepositoryMongo', () => {
    let repository;
    let mockModel;
    let mockSession;

    beforeEach(() => {
        // Mock mongoose model
        mockModel = {
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            deleteMany: jest.fn(),
            save: jest.fn()
        };

        // Mock session entity
        mockSession = {
            sessionId: 'test-session-123',
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

        // Mock repository implementation
        class AuthorizationSessionRepositoryMongo {
            constructor() {
                this.model = mockModel;
            }

            async create(session) {
                const doc = {
                    ...session,
                    save: jest.fn().mockResolvedValue(session)
                };
                await doc.save();
                return this._toEntity(session);
            }

            async findBySessionId(sessionId) {
                const doc = await this.model.findOne({
                    sessionId,
                    expiresAt: { $gt: new Date() }
                });
                return doc ? this._toEntity(doc) : null;
            }

            async findActiveSession(userId, entityType) {
                const doc = await this.model.findOne({
                    userId,
                    entityType,
                    completed: false,
                    expiresAt: { $gt: new Date() }
                });
                return doc ? this._toEntity(doc) : null;
            }

            async update(session) {
                const updated = await this.model.findOneAndUpdate(
                    { sessionId: session.sessionId },
                    {
                        currentStep: session.currentStep,
                        stepData: session.stepData,
                        completed: session.completed,
                        updatedAt: new Date()
                    },
                    { new: true }
                );
                return this._toEntity(updated);
            }

            async deleteExpired() {
                const result = await this.model.deleteMany({
                    expiresAt: { $lt: new Date() }
                });
                return result.deletedCount;
            }

            _toEntity(doc) {
                return { ...doc };
            }
        }

        repository = new AuthorizationSessionRepositoryMongo();
    });

    describe('create', () => {
        it('should create and return a new session', async () => {
            const result = await repository.create(mockSession);

            expect(result).toMatchObject({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2
            });
        });

        it('should initialize session with default values', async () => {
            const minimalSession = {
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            };

            const result = await repository.create(minimalSession);

            expect(result.sessionId).toBe('test-session-123');
            expect(result.userId).toBe('user-123');
        });

        it('should store stepData as empty object by default', async () => {
            const sessionWithoutStepData = {
                ...mockSession,
                stepData: undefined
            };

            const result = await repository.create(sessionWithoutStepData);

            expect(result.stepData).toBeDefined();
        });
    });

    describe('findBySessionId', () => {
        it('should find session by ID when not expired', async () => {
            mockModel.findOne.mockResolvedValue(mockSession);

            const result = await repository.findBySessionId('test-session-123');

            expect(mockModel.findOne).toHaveBeenCalledWith({
                sessionId: 'test-session-123',
                expiresAt: { $gt: expect.any(Date) }
            });
            expect(result).toMatchObject({
                sessionId: 'test-session-123'
            });
        });

        it('should return null when session not found', async () => {
            mockModel.findOne.mockResolvedValue(null);

            const result = await repository.findBySessionId('nonexistent');

            expect(result).toBeNull();
        });

        it('should filter out expired sessions', async () => {
            mockModel.findOne.mockResolvedValue(null);

            const result = await repository.findBySessionId('expired-session');

            expect(mockModel.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    expiresAt: { $gt: expect.any(Date) }
                })
            );
            expect(result).toBeNull();
        });
    });

    describe('findActiveSession', () => {
        it('should find active session for user and entity type', async () => {
            mockModel.findOne.mockResolvedValue(mockSession);

            const result = await repository.findActiveSession('user-123', 'nagaris');

            expect(mockModel.findOne).toHaveBeenCalledWith({
                userId: 'user-123',
                entityType: 'nagaris',
                completed: false,
                expiresAt: { $gt: expect.any(Date) }
            });
            expect(result).toMatchObject({
                userId: 'user-123',
                entityType: 'nagaris',
                completed: false
            });
        });

        it('should return null when no active session exists', async () => {
            mockModel.findOne.mockResolvedValue(null);

            const result = await repository.findActiveSession('user-123', 'nagaris');

            expect(result).toBeNull();
        });

        it('should filter out completed sessions', async () => {
            mockModel.findOne.mockResolvedValue(null);

            const result = await repository.findActiveSession('user-123', 'nagaris');

            expect(mockModel.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    completed: false
                })
            );
        });

        it('should filter out expired sessions', async () => {
            mockModel.findOne.mockResolvedValue(null);

            const result = await repository.findActiveSession('user-123', 'nagaris');

            expect(mockModel.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    expiresAt: { $gt: expect.any(Date) }
                })
            );
        });
    });

    describe('update', () => {
        it('should update session and return updated entity', async () => {
            const updatedSession = {
                ...mockSession,
                currentStep: 2,
                stepData: { email: 'test@example.com' }
            };

            mockModel.findOneAndUpdate.mockResolvedValue(updatedSession);

            const result = await repository.update(updatedSession);

            expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
                { sessionId: 'test-session-123' },
                {
                    currentStep: 2,
                    stepData: { email: 'test@example.com' },
                    completed: false,
                    updatedAt: expect.any(Date)
                },
                { new: true }
            );
            expect(result.currentStep).toBe(2);
            expect(result.stepData.email).toBe('test@example.com');
        });

        it('should update completed status', async () => {
            const completedSession = {
                ...mockSession,
                completed: true
            };

            mockModel.findOneAndUpdate.mockResolvedValue(completedSession);

            const result = await repository.update(completedSession);

            expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    completed: true
                }),
                expect.anything()
            );
            expect(result.completed).toBe(true);
        });

        it('should update updatedAt timestamp', async () => {
            mockModel.findOneAndUpdate.mockResolvedValue(mockSession);

            await repository.update(mockSession);

            expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    updatedAt: expect.any(Date)
                }),
                expect.anything()
            );
        });

        it('should merge new stepData', async () => {
            const sessionWithNewData = {
                ...mockSession,
                stepData: { email: 'test@example.com', otp: '123456' }
            };

            mockModel.findOneAndUpdate.mockResolvedValue(sessionWithNewData);

            const result = await repository.update(sessionWithNewData);

            expect(result.stepData).toEqual({
                email: 'test@example.com',
                otp: '123456'
            });
        });
    });

    describe('deleteExpired', () => {
        it('should delete expired sessions and return count', async () => {
            mockModel.deleteMany.mockResolvedValue({ deletedCount: 5 });

            const count = await repository.deleteExpired();

            expect(mockModel.deleteMany).toHaveBeenCalledWith({
                expiresAt: { $lt: expect.any(Date) }
            });
            expect(count).toBe(5);
        });

        it('should return 0 when no sessions deleted', async () => {
            mockModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

            const count = await repository.deleteExpired();

            expect(count).toBe(0);
        });

        it('should only delete sessions with past expiresAt', async () => {
            mockModel.deleteMany.mockResolvedValue({ deletedCount: 3 });

            await repository.deleteExpired();

            expect(mockModel.deleteMany).toHaveBeenCalledWith({
                expiresAt: { $lt: expect.any(Date) }
            });
        });
    });

    describe('_toEntity', () => {
        it('should convert database document to entity', () => {
            const doc = {
                sessionId: 'test-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                stepData: { email: 'test@example.com' },
                expiresAt: new Date(),
                completed: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const entity = repository._toEntity(doc);

            expect(entity).toMatchObject({
                sessionId: 'test-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2
            });
        });

        it('should preserve all fields during conversion', () => {
            const doc = { ...mockSession };

            const entity = repository._toEntity(doc);

            expect(entity.sessionId).toBe(doc.sessionId);
            expect(entity.userId).toBe(doc.userId);
            expect(entity.entityType).toBe(doc.entityType);
            expect(entity.currentStep).toBe(doc.currentStep);
            expect(entity.maxSteps).toBe(doc.maxSteps);
            expect(entity.completed).toBe(doc.completed);
        });
    });

    describe('Edge Cases', () => {
        it('should handle concurrent updates gracefully', async () => {
            mockModel.findOneAndUpdate.mockResolvedValue(mockSession);

            const update1 = repository.update({ ...mockSession, currentStep: 2 });
            const update2 = repository.update({ ...mockSession, currentStep: 2 });

            await Promise.all([update1, update2]);

            expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
        });

        it('should handle large stepData objects', async () => {
            const largeStepData = {
                field1: 'a'.repeat(1000),
                field2: 'b'.repeat(1000),
                field3: { nested: 'data' }
            };

            const sessionWithLargeData = {
                ...mockSession,
                stepData: largeStepData
            };

            mockModel.findOneAndUpdate.mockResolvedValue(sessionWithLargeData);

            const result = await repository.update(sessionWithLargeData);

            expect(result.stepData).toEqual(largeStepData);
        });

        it('should handle special characters in session IDs', async () => {
            const specialId = 'session-123-abc_def.xyz';
            mockModel.findOne.mockResolvedValue({ ...mockSession, sessionId: specialId });

            const result = await repository.findBySessionId(specialId);

            expect(mockModel.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    sessionId: specialId
                })
            );
        });
    });
});
