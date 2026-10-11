const { FetchError } = require('../../errors/fetch-error');
const { ClientSafeError } = require('../../errors/client-safe-error');
const { GetAuthorizationRequirements } = require('./get-authorization-requirements');
const { GetAuthorizationStep, SubmitAuthorizationStep } = require('./multi-step-authorization');
const {
    InMemoryAuthorizationSessionRepository,
} = require('../tests/doubles/in-memory-authorization-session-repository');

const user = (id = 'u1') => ({ getId: () => id });

// A two-step module: email, then a one-time code (the documented example).
function otpModule() {
    return {
        moduleName: 'otp',
        API: { requesterType: 'apiKey' },
        getAuthStepCount: () => 2,
        getAuthRequirementsForStep: async (step) => ({
            type: step === 1 ? 'email' : 'otp',
            data: { jsonSchema: { type: 'object', properties: {} } },
        }),
        processAuthorizationStep: jest.fn(async (api, step, data, stepData) => {
            if (step === 1) {
                if (!data.email) throw new Error('Valid email address is required');
                return { nextStep: 2, stepData: { email: data.email }, message: 'Code sent' };
            }
            if (data.otp !== '123456') throw new ClientSafeError('Invalid code');
            return { completed: true, authData: { email: stepData.email, token: 'issued' } };
        }),
    };
}

const singleStepModule = { moduleName: 'simple', API: { requesterType: 'oauth2' } };

function setup() {
    const definitions = [otpModule(), singleStepModule];
    const sessions = new InMemoryAuthorizationSessionRepository();
    const createModule = jest.fn(() => ({
        api: {
            kind: 'api',
            getAuthorizationRequirements: () => ({ type: 'oauth2', url: 'https://provider.example/auth' }),
        },
    }));
    const getAuthorizationRequirements = new GetAuthorizationRequirements({
        moduleDefinitions: definitions,
        createModule,
    });
    const processAuthorizationCallback = {
        execute: jest.fn(async () => ({ credential_id: 'c1', entity_id: 'e1', type: 'otp' })),
    };
    const moduleRepository = {
        findEntityById: jest.fn(async (id) => ({ id, userId: 'u1', moduleName: 'otp' })),
    };
    const credentialRepository = {
        findCredentialById: jest.fn(async (id) => ({ id, userId: 'u1', authIsValid: true, token: 'issued' })),
    };
    const deps = {
        moduleDefinitions: definitions,
        getAuthorizationRequirements,
        authorizationSessionRepository: sessions,
        processAuthorizationCallback,
        moduleRepository,
        credentialRepository,
        createModule,
    };
    return {
        ...deps,
        sessions,
        otp: definitions[0],
        getStep: new GetAuthorizationStep(deps),
        submit: new SubmitAuthorizationStep(deps),
    };
}

describe('multi-step authorization', () => {
    it('completes a single-step module at once, without a session', async () => {
        const t = setup();
        const requirements = await t.getStep.execute({ user: user(), entityType: 'simple' });
        expect(requirements).toMatchObject({ type: 'oauth2', step: 1, totalSteps: 1 });
        expect(requirements).not.toHaveProperty('sessionId');

        const result = await t.submit.execute({ user: user(), entityType: 'simple', data: { code: 'abc' } });
        expect(result.status).toBe('complete');
        expect(t.processAuthorizationCallback.execute).toHaveBeenCalledWith('u1', 'simple', { code: 'abc' });
        expect(t.sessions.rows.size).toBe(0);
    });

    it('runs email then OTP and completes through the authorization callback', async () => {
        const t = setup();
        const first = await t.getStep.execute({ user: user(), entityType: 'otp' });
        expect(first).toMatchObject({ type: 'email', step: 1, totalSteps: 2, isMultiStep: true });
        expect(first.sessionId).toEqual(expect.any(String));

        const pending = await t.submit.execute({
            user: user(), entityType: 'otp', step: 1, sessionId: first.sessionId, data: { email: 'a@example.com' },
        });
        expect(pending).toEqual({
            status: 'pending',
            step: 2,
            totalSteps: 2,
            sessionId: first.sessionId,
            requirements: expect.objectContaining({ type: 'otp', step: 2 }),
            message: 'Code sent',
        });

        const done = await t.submit.execute({
            user: user(), entityType: 'otp', step: 2, sessionId: first.sessionId, data: { otp: '123456' },
        });
        expect(done.status).toBe('complete');
        expect(done.entity).toMatchObject({ id: 'e1' });
        expect(done.credential).toMatchObject({ id: 'c1', type: 'otp', entityIds: ['e1'] });
        expect(t.processAuthorizationCallback.execute).toHaveBeenCalledWith('u1', 'otp', {
            email: 'a@example.com', token: 'issued',
        });
        expect(t.otp.processAuthorizationStep).toHaveBeenLastCalledWith(
            expect.objectContaining({ kind: 'api' }), 2, { otp: '123456' }, { email: 'a@example.com' }
        );
        // The collected data is gone once the credential exists.
        expect(t.sessions.rows.size).toBe(0);
    });

    it('starts a session on a POST of step 1 without a prior GET', async () => {
        const t = setup();
        const pending = await t.submit.execute({ user: user(), entityType: 'otp', data: { email: 'a@example.com' } });
        expect(pending.status).toBe('pending');
        expect(t.sessions.rows.has(pending.sessionId)).toBe(true);
    });

    it('requires a session after step 1', async () => {
        const t = setup();
        await expect(
            t.submit.execute({ user: user(), entityType: 'otp', step: 2, data: { otp: '1' } })
        ).rejects.toMatchObject({ output: { statusCode: 400 }, data: { code: 'SESSION_REQUIRED' } });
        await expect(
            t.getStep.execute({ user: user(), entityType: 'otp', step: 2 })
        ).rejects.toMatchObject({ data: { code: 'SESSION_REQUIRED' } });
    });

    it('refuses another user, another entity type, another credential or an unknown session with 404', async () => {
        const t = setup();
        t.moduleDefinitions.push({ ...otpModule(), moduleName: 'otp2' });
        const { sessionId } = await t.getStep.execute({ user: user(), entityType: 'otp' });
        for (const attempt of [
            { user: user('u2'), entityType: 'otp', sessionId },
            { user: user(), entityType: 'otp2', sessionId },
            { user: user(), entityType: 'otp', sessionId: 'not-a-session' },
            { user: user(), entityType: 'otp', sessionId, credentialId: 'c9' },
        ]) {
            await expect(
                t.submit.execute({ ...attempt, step: 1, data: { email: 'x@example.com' } })
            ).rejects.toMatchObject({
                output: { statusCode: 404 },
                data: { code: 'AUTHORIZATION_SESSION_NOT_FOUND' },
            });
        }
    });

    it('refuses an expired session', async () => {
        const t = setup();
        const { sessionId } = await t.getStep.execute({ user: user(), entityType: 'otp' });
        t.sessions.rows.get(sessionId).expiresAt = new Date(Date.now() - 1000);
        await expect(
            t.submit.execute({ user: user(), entityType: 'otp', step: 1, sessionId, data: { email: 'a@example.com' } })
        ).rejects.toMatchObject({ output: { statusCode: 404 } });
    });

    it('refuses to skip a step but lets step 1 restart the flow', async () => {
        const t = setup();
        const { sessionId } = await t.getStep.execute({ user: user(), entityType: 'otp' });
        await expect(
            t.submit.execute({ user: user(), entityType: 'otp', step: 2, sessionId, data: { otp: '123456' } })
        ).rejects.toMatchObject({
            output: { statusCode: 409 },
            data: { code: 'STEP_OUT_OF_ORDER', details: { expectedStep: 1 } },
        });

        await t.submit.execute({ user: user(), entityType: 'otp', step: 1, sessionId, data: { email: 'a@example.com' } });
        const restarted = await t.submit.execute({
            user: user(), entityType: 'otp', step: 1, sessionId, data: { email: 'b@example.com' },
        });
        expect(restarted.step).toBe(2);
        expect(t.sessions.rows.get(sessionId).stepData).toEqual({ email: 'b@example.com' });
    });

    it('turns module step errors into 400 with the module message', async () => {
        const t = setup();
        const { sessionId } = await t.getStep.execute({ user: user(), entityType: 'otp' });
        await expect(
            t.submit.execute({ user: user(), entityType: 'otp', step: 1, sessionId, data: {} })
        ).rejects.toMatchObject({
            output: { statusCode: 400, payload: { message: 'Valid email address is required' } },
            data: { code: 'AUTHORIZATION_FAILED' },
        });
        await t.submit.execute({ user: user(), entityType: 'otp', step: 1, sessionId, data: { email: 'a@example.com' } });
        await expect(
            t.submit.execute({ user: user(), entityType: 'otp', step: 2, sessionId, data: { otp: '000000' } })
        ).rejects.toMatchObject({ output: { statusCode: 400, payload: { message: 'Invalid code' } } });
        // A wrong code does not burn the session.
        expect(t.sessions.rows.get(sessionId).currentStep).toBe(2);
    });

    it('maps a provider HTTP failure to 502 and a failed auth test to 400', async () => {
        const t = setup();
        t.processAuthorizationCallback.execute.mockRejectedValueOnce(
            new FetchError({ resource: 'https://provider.example/token', init: { method: 'POST' }, response: { status: 503 } })
        );
        await expect(
            t.submit.execute({ user: user(), entityType: 'simple', data: { code: 'x' } })
        ).rejects.toMatchObject({ output: { statusCode: 502 }, data: { code: 'UPSTREAM_ERROR', details: { upstreamStatus: 503 } } });

        t.processAuthorizationCallback.execute.mockRejectedValueOnce(new Error('Authorization failed'));
        await expect(
            t.submit.execute({ user: user(), entityType: 'simple', data: { code: 'x' } })
        ).rejects.toMatchObject({ output: { statusCode: 400 }, data: { code: 'AUTHORIZATION_FAILED' } });

        t.processAuthorizationCallback.execute.mockRejectedValueOnce(new Error('connection refused to db'));
        await expect(
            t.submit.execute({ user: user(), entityType: 'simple', data: { code: 'x' } })
        ).rejects.toThrow('connection refused to db');
    });

    it('validates data and step for single-step modules', async () => {
        const t = setup();
        await expect(t.submit.execute({ user: user(), entityType: 'simple', data: 'x' })).rejects.toMatchObject({
            data: { code: 'VALIDATION_ERROR' },
        });
        await expect(
            t.submit.execute({ user: user(), entityType: 'simple', step: 2, data: {} })
        ).rejects.toMatchObject({ data: { code: 'INVALID_STEP' } });
    });

    it('binds a re-authorization session to its credential and reports a replaced credential', async () => {
        const t = setup();
        const { sessionId } = await t.getStep.execute({ user: user(), entityType: 'otp', credentialId: 'c7' });
        expect(t.sessions.rows.get(sessionId).credentialId).toBe('c7');
        await t.submit.execute({ user: user(), entityType: 'otp', step: 1, sessionId, credentialId: 'c7', data: { email: 'a@example.com' } });
        const done = await t.submit.execute({ user: user(), entityType: 'otp', step: 2, sessionId, credentialId: 'c7', data: { otp: '123456' } });
        expect(done.previousCredentialId).toBe('c7');
    });
});
