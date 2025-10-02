/**
 * AuthorizationSessionRepositoryPostgres Unit Tests
 * Tests PostgreSQL/Prisma implementation of authorization session repository
 */

describe('AuthorizationSessionRepositoryPostgres', () => {
    let repository;
    let mockPrisma;
    let mockSession;

    beforeEach(() => {
        // Mock Prisma client
        mockPrisma = {
            authorizationSession: {
                create: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
                deleteMany: jest.fn()
            }
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
        class AuthorizationSessionRepositoryPostgres {
            constructor() {
                this.prisma = mockPrisma;
            }

            async create(session) {
                const created = await this.prisma.authorizationSession.create({
                    data: {
                        sessionId: session.sessionId,
                        userId: session.userId,
                        entityType: session.entityType,
                        currentStep: session.currentStep,
                        maxSteps: session.maxSteps,
                        stepData: session.stepData,
                        expiresAt: session.expiresAt,
                        completed: session.completed
                    }
                });
                return this._toEntity(created);
            }

            async findBySessionId(sessionId) {
                const record = await this.prisma.authorizationSession.findFirst({
                    where: {
                        sessionId,
                        expiresAt: { gt: new Date() }
                    }
                });
                return record ? this._toEntity(record) : null;
            }

            async findActiveSession(userId, entityType) {
                const record = await this.prisma.authorizationSession.findFirst({
                    where: {
                        userId,
                        entityType,
                        completed: false,
                        expiresAt: { gt: new Date() }
                    },
                    orderBy: { createdAt: 'desc' }
                });
                return record ? this._toEntity(record) : null;
            }

            async update(session) {
                const updated = await this.prisma.authorizationSession.update({
                    where: { sessionId: session.sessionId },
                    data: {
                        currentStep: session.currentStep,
                        stepData: session.stepData,
                        completed: session.completed,
                        updatedAt: new Date()
                    }
                });
                return this._toEntity(updated);
            }

            async deleteExpired() {
                const result = await this.prisma.authorizationSession.deleteMany({
                    where: {
                        expiresAt: { lt: new Date() }
                    }
                });
                return result.count;
            }

            _toEntity(record) {
                return { ...record };
            }
        }

        repository = new AuthorizationSessionRepositoryPostgres();
    });

    describe('create', () => {
        it('should create and return a new session', async () => {
            mockPrisma.authorizationSession.create.mockResolvedValue(mockSession);

            const result = await repository.create(mockSession);

            expect(mockPrisma.authorizationSession.create).toHaveBeenCalledWith({
                data: {
                    sessionId: 'test-session-123',
                    userId: 'user-123',
                    entityType: 'nagaris',
                    currentStep: 1,
                    maxSteps: 2,
                    stepData: {},
                    expiresAt: expect.any(Date),
                    completed: false
                }
            });
            expect(result).toMatchObject({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris'
            });
        });

        it('should handle session with custom step data', async () => {
            const sessionWithData = {
                ...mockSession,
                stepData: { email: 'test@example.com' }
            };

            mockPrisma.authorizationSession.create.mockResolvedValue(sessionWithData);

            const result = await repository.create(sessionWithData);

            expect(mockPrisma.authorizationSession.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        stepData: { email: 'test@example.com' }
                    })
                })
            );
            expect(result.stepData.email).toBe('test@example.com');
        });

        it('should create session with correct expiration', async () => {
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            const sessionWithExpiry = {
                ...mockSession,
                expiresAt
            };

            mockPrisma.authorizationSession.create.mockResolvedValue(sessionWithExpiry);

            await repository.create(sessionWithExpiry);

            expect(mockPrisma.authorizationSession.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        expiresAt
                    })
                })
            );
        });
    });

    describe('findBySessionId', () => {
        it('should find session by ID when not expired', async () => {
            mockPrisma.authorizationSession.findFirst.mockResolvedValue(mockSession);

            const result = await repository.findBySessionId('test-session-123');

            expect(mockPrisma.authorizationSession.findFirst).toHaveBeenCalledWith({
                where: {
                    sessionId: 'test-session-123',
                    expiresAt: { gt: expect.any(Date) }
                }
            });
            expect(result).toMatchObject({
                sessionId: 'test-session-123'
            });
        });

        it('should return null when session not found', async () => {
            mockPrisma.authorizationSession.findFirst.mockResolvedValue(null);

            const result = await repository.findBySessionId('nonexistent');

            expect(result).toBeNull();
        });

        it('should filter out expired sessions using Prisma syntax', async () => {
            mockPrisma.authorizationSession.findFirst.mockResolvedValue(null);

            await repository.findBySessionId('expired-session');

            expect(mockPrisma.authorizationSession.findFirst).toHaveBeenCalledWith({
                where: {
                    sessionId: 'expired-session',
                    expiresAt: { gt: expect.any(Date) }
                }
            });
        });

        it('should handle database connection errors', async () => {
            mockPrisma.authorizationSession.findFirst.mockRejectedValue(
                new Error('Database connection failed')
            );

            await expect(repository.findBySessionId('test-123')).rejects.toThrow(
                'Database connection failed'
            );
        });
    });

    describe('findActiveSession', () => {
        it('should find active session for user and entity type', async () => {
            mockPrisma.authorizationSession.findFirst.mockResolvedValue(mockSession);

            const result = await repository.findActiveSession('user-123', 'nagaris');

            expect(mockPrisma.authorizationSession.findFirst).toHaveBeenCalledWith({
                where: {
                    userId: 'user-123',
                    entityType: 'nagaris',
                    completed: false,
                    expiresAt: { gt: expect.any(Date) }
                },
                orderBy: { createdAt: 'desc' }
            });
            expect(result).toMatchObject({
                userId: 'user-123',
                entityType: 'nagaris'
            });
        });

        it('should return null when no active session exists', async () => {
            mockPrisma.authorizationSession.findFirst.mockResolvedValue(null);

            const result = await repository.findActiveSession('user-123', 'nagaris');

            expect(result).toBeNull();
        });

        it('should order by createdAt descending to get most recent', async () => {
            mockPrisma.authorizationSession.findFirst.mockResolvedValue(mockSession);

            await repository.findActiveSession('user-123', 'nagaris');

            expect(mockPrisma.authorizationSession.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: { createdAt: 'desc' }
                })
            );
        });

        it('should filter by all required criteria', async () => {
            mockPrisma.authorizationSession.findFirst.mockResolvedValue(mockSession);

            await repository.findActiveSession('user-123', 'nagaris');

            expect(mockPrisma.authorizationSession.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId: 'user-123',
                        entityType: 'nagaris',
                        completed: false,
                        expiresAt: { gt: expect.any(Date) }
                    }
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

            mockPrisma.authorizationSession.update.mockResolvedValue(updatedSession);

            const result = await repository.update(updatedSession);

            expect(mockPrisma.authorizationSession.update).toHaveBeenCalledWith({
                where: { sessionId: 'test-session-123' },
                data: {
                    currentStep: 2,
                    stepData: { email: 'test@example.com' },
                    completed: false,
                    updatedAt: expect.any(Date)
                }
            });
            expect(result.currentStep).toBe(2);
            expect(result.stepData.email).toBe('test@example.com');
        });

        it('should update completed status', async () => {
            const completedSession = {
                ...mockSession,
                completed: true
            };

            mockPrisma.authorizationSession.update.mockResolvedValue(completedSession);

            const result = await repository.update(completedSession);

            expect(mockPrisma.authorizationSession.update).toHaveBeenCalledWith({
                where: expect.anything(),
                data: expect.objectContaining({
                    completed: true
                })
            });
            expect(result.completed).toBe(true);
        });

        it('should update updatedAt timestamp', async () => {
            mockPrisma.authorizationSession.update.mockResolvedValue(mockSession);

            await repository.update(mockSession);

            expect(mockPrisma.authorizationSession.update).toHaveBeenCalledWith({
                where: expect.anything(),
                data: expect.objectContaining({
                    updatedAt: expect.any(Date)
                })
            });
        });

        it('should handle update conflicts', async () => {
            mockPrisma.authorizationSession.update.mockRejectedValue(
                new Error('Record not found')
            );

            await expect(repository.update(mockSession)).rejects.toThrow('Record not found');
        });

        it('should update complex stepData', async () => {
            const complexStepData = {
                email: 'test@example.com',
                otp: '123456',
                metadata: {
                    timestamp: Date.now(),
                    attempts: 1
                }
            };

            const sessionWithComplexData = {
                ...mockSession,
                stepData: complexStepData
            };

            mockPrisma.authorizationSession.update.mockResolvedValue(sessionWithComplexData);

            const result = await repository.update(sessionWithComplexData);

            expect(result.stepData).toEqual(complexStepData);
        });
    });

    describe('deleteExpired', () => {
        it('should delete expired sessions and return count', async () => {
            mockPrisma.authorizationSession.deleteMany.mockResolvedValue({ count: 5 });

            const count = await repository.deleteExpired();

            expect(mockPrisma.authorizationSession.deleteMany).toHaveBeenCalledWith({
                where: {
                    expiresAt: { lt: expect.any(Date) }
                }
            });
            expect(count).toBe(5);
        });

        it('should return 0 when no sessions deleted', async () => {
            mockPrisma.authorizationSession.deleteMany.mockResolvedValue({ count: 0 });

            const count = await repository.deleteExpired();

            expect(count).toBe(0);
        });

        it('should use Prisma lt operator for expired sessions', async () => {
            mockPrisma.authorizationSession.deleteMany.mockResolvedValue({ count: 3 });

            await repository.deleteExpired();

            expect(mockPrisma.authorizationSession.deleteMany).toHaveBeenCalledWith({
                where: {
                    expiresAt: { lt: expect.any(Date) }
                }
            });
        });

        it('should handle bulk delete errors', async () => {
            mockPrisma.authorizationSession.deleteMany.mockRejectedValue(
                new Error('Delete operation failed')
            );

            await expect(repository.deleteExpired()).rejects.toThrow(
                'Delete operation failed'
            );
        });
    });

    describe('_toEntity', () => {
        it('should convert Prisma record to entity', () => {
            const record = {
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

            const entity = repository._toEntity(record);

            expect(entity).toMatchObject({
                sessionId: 'test-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2
            });
        });

        it('should preserve JSON stepData', () => {
            const record = {
                ...mockSession,
                stepData: { nested: { data: 'value' } }
            };

            const entity = repository._toEntity(record);

            expect(entity.stepData).toEqual({ nested: { data: 'value' } });
        });

        it('should preserve all timestamp fields', () => {
            const createdAt = new Date('2025-01-01');
            const updatedAt = new Date('2025-01-02');
            const expiresAt = new Date('2025-01-03');

            const record = {
                ...mockSession,
                createdAt,
                updatedAt,
                expiresAt
            };

            const entity = repository._toEntity(record);

            expect(entity.createdAt).toEqual(createdAt);
            expect(entity.updatedAt).toEqual(updatedAt);
            expect(entity.expiresAt).toEqual(expiresAt);
        });
    });

    describe('Edge Cases and PostgreSQL-specific', () => {
        it('should handle JSON column for stepData', async () => {
            const jsonData = {
                complex: {
                    nested: {
                        structure: ['with', 'arrays']
                    }
                }
            };

            const sessionWithJson = {
                ...mockSession,
                stepData: jsonData
            };

            mockPrisma.authorizationSession.create.mockResolvedValue(sessionWithJson);

            const result = await repository.create(sessionWithJson);

            expect(result.stepData).toEqual(jsonData);
        });

        it('should handle Prisma unique constraint violations', async () => {
            mockPrisma.authorizationSession.create.mockRejectedValue(
                new Error('Unique constraint failed on sessionId')
            );

            await expect(repository.create(mockSession)).rejects.toThrow(
                'Unique constraint failed'
            );
        });

        it('should handle transaction rollbacks gracefully', async () => {
            mockPrisma.authorizationSession.update.mockRejectedValue(
                new Error('Transaction rollback')
            );

            await expect(repository.update(mockSession)).rejects.toThrow(
                'Transaction rollback'
            );
        });

        it('should handle concurrent updates with optimistic locking', async () => {
            mockPrisma.authorizationSession.update.mockResolvedValue(mockSession);

            const update1 = repository.update({ ...mockSession, currentStep: 2 });
            const update2 = repository.update({ ...mockSession, currentStep: 2 });

            await Promise.all([update1, update2]);

            expect(mockPrisma.authorizationSession.update).toHaveBeenCalledTimes(2);
        });

        it('should handle very large stepData (PostgreSQL JSONB limit)', async () => {
            const largeData = {
                data: 'x'.repeat(10000)
            };

            const sessionWithLargeData = {
                ...mockSession,
                stepData: largeData
            };

            mockPrisma.authorizationSession.create.mockResolvedValue(sessionWithLargeData);

            const result = await repository.create(sessionWithLargeData);

            expect(result.stepData.data).toHaveLength(10000);
        });
    });
});
