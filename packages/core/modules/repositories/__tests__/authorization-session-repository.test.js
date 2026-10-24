jest.mock('../../../database/prisma', () => ({
    prisma: { authorizationSession: {}, $runCommandRaw: jest.fn() },
}));
jest.mock('../../../database/documentdb-encryption-service');
jest.mock('../../../database/config', () => ({ DB_TYPE: 'postgresql' }));

const { prisma } = require('../../../database/prisma');
const config = require('../../../database/config');
const {
    DocumentDBEncryptionService,
} = require('../../../database/documentdb-encryption-service');
const { AuthorizationSession } = require('../../domain/authorization-session');
const {
    createAuthorizationSessionRepository,
    AuthorizationSessionRepositoryPrisma,
    AuthorizationSessionRepositoryDocumentDB,
} = require('../authorization-session-repository-factory');
const {
    AuthorizationSessionRepositoryInterface,
} = require('../authorization-session-repository-interface');

const expiresAt = new Date(Date.now() + 10 * 60_000);
const session = () =>
    new AuthorizationSession({
        sessionId: 'sess-1',
        userId: 'u1',
        entityType: 'acme',
        credentialId: null,
        currentStep: 1,
        maxSteps: 2,
        stepData: { email: 'a@example.com' },
        expiresAt,
    });
const row = (overrides = {}) => ({
    id: 1,
    sessionId: 'sess-1',
    userId: 'u1',
    entityType: 'acme',
    credentialId: null,
    currentStep: 1,
    maxSteps: 2,
    stepData: { email: 'a@example.com' },
    expiresAt,
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

describe('AuthorizationSession repositories', () => {
    beforeEach(() => jest.clearAllMocks());

    it('declares the port', async () => {
        const port = new AuthorizationSessionRepositoryInterface();
        for (const method of ['create', 'findBySessionId', 'update', 'deleteBySessionId', 'deleteExpired']) {
            await expect(port[method]()).rejects.toThrow('must be implemented');
        }
    });

    it('picks the adapter from DB_TYPE', () => {
        for (const [dbType, Adapter] of [
            ['postgresql', AuthorizationSessionRepositoryPrisma],
            ['mongodb', AuthorizationSessionRepositoryPrisma],
            ['documentdb', AuthorizationSessionRepositoryDocumentDB],
        ]) {
            config.DB_TYPE = dbType;
            expect(createAuthorizationSessionRepository()).toBeInstanceOf(Adapter);
        }
        config.DB_TYPE = 'sqlite';
        expect(() => createAuthorizationSessionRepository()).toThrow('Unsupported');
        config.DB_TYPE = 'postgresql';
    });

    describe('Prisma (PostgreSQL and MongoDB)', () => {
        let client;
        let repo;

        beforeEach(() => {
            client = {
                authorizationSession: {
                    create: jest.fn(async ({ data }) => row(data)),
                    findFirst: jest.fn(async () => row()),
                    update: jest.fn(async ({ data }) => row(data)),
                    deleteMany: jest.fn(async () => ({ count: 2 })),
                },
            };
            repo = new AuthorizationSessionRepositoryPrisma(client);
        });

        it('creates a session and returns the domain object', async () => {
            const created = await repo.create(session());
            expect(client.authorizationSession.create).toHaveBeenCalledWith({
                data: {
                    sessionId: 'sess-1',
                    userId: 'u1',
                    entityType: 'acme',
                    credentialId: null,
                    currentStep: 1,
                    maxSteps: 2,
                    stepData: { email: 'a@example.com' },
                    expiresAt,
                    completed: false,
                },
            });
            expect(created).toBeInstanceOf(AuthorizationSession);
        });

        it('only finds unexpired sessions', async () => {
            await repo.findBySessionId('sess-1');
            const { where } = client.authorizationSession.findFirst.mock.calls[0][0];
            expect(where.sessionId).toBe('sess-1');
            expect(where.expiresAt.gt).toBeInstanceOf(Date);

            client.authorizationSession.findFirst.mockResolvedValueOnce(null);
            expect(await repo.findBySessionId('sess-2')).toBeNull();
            expect(await repo.findBySessionId(undefined)).toBeNull();
            expect(await repo.findBySessionId({ $ne: null })).toBeNull();
        });

        it('updates only the mutable fields', async () => {
            const s = session();
            s.advanceTo(2, { otpSent: true });
            await repo.update(s);
            expect(client.authorizationSession.update).toHaveBeenCalledWith({
                where: { sessionId: 'sess-1' },
                data: {
                    currentStep: 2,
                    stepData: { email: 'a@example.com', otpSent: true },
                    completed: false,
                },
            });
        });

        it('deletes one session and expired sessions', async () => {
            expect(await repo.deleteBySessionId('sess-1')).toBe(2);
            const now = new Date();
            await repo.deleteExpired(now);
            expect(client.authorizationSession.deleteMany).toHaveBeenLastCalledWith({
                where: { expiresAt: { lte: now } },
            });
        });
    });

    describe('DocumentDB', () => {
        let encryptionService;
        let repo;

        beforeEach(() => {
            encryptionService = {
                encryptFields: jest.fn(async (_model, doc) => ({
                    ...doc,
                    ...(doc.stepData !== undefined && { stepData: 'ciphertext' }),
                })),
                decryptFields: jest.fn(async (_model, doc) => ({
                    ...doc,
                    stepData: { email: 'a@example.com' },
                })),
            };
            DocumentDBEncryptionService.mockImplementation(() => encryptionService);
            repo = new AuthorizationSessionRepositoryDocumentDB();
        });

        it('encrypts stepData before insert', async () => {
            prisma.$runCommandRaw.mockResolvedValueOnce({ ok: 1, n: 1 });
            const created = await repo.create(session());
            const command = prisma.$runCommandRaw.mock.calls[0][0];
            expect(command.insert).toBe('AuthorizationSession');
            expect(command.documents[0].stepData).toBe('ciphertext');
            expect(created.stepData).toEqual({ email: 'a@example.com' });
        });

        it('finds unexpired sessions and decrypts them', async () => {
            prisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: { firstBatch: [{ ...row(), stepData: 'ciphertext' }] },
            });
            const found = await repo.findBySessionId('sess-1');
            const command = prisma.$runCommandRaw.mock.calls[0][0];
            expect(command.find).toBe('AuthorizationSession');
            expect(command.filter.sessionId).toBe('sess-1');
            expect(command.filter.expiresAt.$gt).toBeInstanceOf(Date);
            expect(found.stepData).toEqual({ email: 'a@example.com' });
        });

        it('re-encrypts stepData on update', async () => {
            prisma.$runCommandRaw.mockResolvedValueOnce({ ok: 1, nModified: 1 });
            await repo.update(session());
            const command = prisma.$runCommandRaw.mock.calls[0][0];
            expect(command.update).toBe('AuthorizationSession');
            expect(command.updates[0].u.$set.stepData).toBe('ciphertext');
        });

        it('deletes expired sessions', async () => {
            prisma.$runCommandRaw.mockResolvedValueOnce({ ok: 1, n: 3 });
            expect(await repo.deleteExpired(new Date())).toBe(3);
            expect(prisma.$runCommandRaw.mock.calls[0][0].delete).toBe('AuthorizationSession');
        });
    });
});
