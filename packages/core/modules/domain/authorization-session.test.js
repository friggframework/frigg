const { AuthorizationSession } = require('./authorization-session');

const base = {
    sessionId: 's1',
    userId: 'u1',
    entityType: 'acme',
    maxSteps: 2,
    expiresAt: new Date(Date.now() + 60_000),
};

describe('AuthorizationSession', () => {
    afterEach(() => {
        delete process.env.AUTH_SESSION_EXPIRY_MINUTES;
    });

    it('starts at step 1 with an unguessable id and a 15 minute expiry', () => {
        const now = new Date('2026-10-03T12:00:00Z');
        const session = AuthorizationSession.start({ userId: 7, entityType: 'acme', maxSteps: 2, now });
        expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
        expect(session.userId).toBe('7');
        expect(session.currentStep).toBe(1);
        expect(session.expiresAt.toISOString()).toBe('2026-10-03T12:15:00.000Z');
        expect(session.credentialId).toBeNull();
    });

    it('honours AUTH_SESSION_EXPIRY_MINUTES', () => {
        process.env.AUTH_SESSION_EXPIRY_MINUTES = '5';
        const now = new Date('2026-10-03T12:00:00Z');
        const session = AuthorizationSession.start({ userId: 'u', entityType: 'acme', maxSteps: 2, now });
        expect(session.expiresAt.toISOString()).toBe('2026-10-03T12:05:00.000Z');
    });

    it.each([
        [{ sessionId: '' }, 'sessionId'],
        [{ userId: null }, 'userId'],
        [{ entityType: '' }, 'entityType'],
        [{ maxSteps: 0 }, 'maxSteps'],
        [{ currentStep: 3 }, 'currentStep'],
        [{ expiresAt: 'nope' }, 'expiresAt'],
    ])('rejects %j', (override, message) => {
        expect(() => new AuthorizationSession({ ...base, ...override })).toThrow(message);
    });

    it('loads an expired session without throwing, and reports it expired', () => {
        const session = new AuthorizationSession({ ...base, expiresAt: new Date(Date.now() - 1) });
        expect(session.isExpired()).toBe(true);
    });

    it('advances one step at a time and merges collected data', () => {
        const session = new AuthorizationSession({ ...base, stepData: { a: 1 } });
        session.advanceTo(2, { email: 'x@example.com' });
        expect(session.currentStep).toBe(2);
        expect(session.stepData).toEqual({ a: 1, email: 'x@example.com' });
        expect(() => session.advanceTo(3)).toThrow('Cannot move');
    });

    it('cannot skip steps or advance once complete', () => {
        const session = new AuthorizationSession({ ...base, maxSteps: 3 });
        expect(() => session.advanceTo(3)).toThrow('Cannot move');
        session.markComplete();
        expect(() => session.advanceTo(2)).toThrow('completed');
    });

    it('restarts at step 1 and forgets collected data', () => {
        const session = new AuthorizationSession({ ...base, currentStep: 2, stepData: { otpSentTo: 'x' } });
        session.restart();
        expect(session.currentStep).toBe(1);
        expect(session.stepData).toEqual({});
    });

    it('is bound to its user, entity type and credential', () => {
        const session = new AuthorizationSession({ ...base, credentialId: 9 });
        expect(session.belongsTo({ userId: 'u1', entityType: 'acme', credentialId: '9' })).toBe(true);
        expect(session.belongsTo({ userId: 'u2', entityType: 'acme', credentialId: '9' })).toBe(false);
        expect(session.belongsTo({ userId: 'u1', entityType: 'other', credentialId: '9' })).toBe(false);
        expect(session.belongsTo({ userId: 'u1', entityType: 'acme' })).toBe(false);
    });
});
