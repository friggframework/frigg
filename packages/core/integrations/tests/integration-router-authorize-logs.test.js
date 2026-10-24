jest.mock('../../handlers/app-definition-loader', () => ({
    loadAppDefinition: () => ({ integrations: [], userConfig: {} }),
}));
jest.mock('../repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({}),
}));
jest.mock('../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({}),
}));
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({}),
}));
jest.mock('../../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));

const { createIntegrationRouter } = require('../integration-router');
const { createApp } = require('../../handlers/app-handler-helpers');
const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
const {
    ProcessAuthorizationCallback,
} = require('../../modules/use-cases/process-authorization-callback');
const { createMemorySink } = require('../../logs');
const { SECRETS } = require('../../logs/__fixtures__/secrets');

async function postAuthorize(body) {
    const app = createApp((a) => a.use(createIntegrationRouter()));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/authorize`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

describe('POST /api/authorize logs (ADR-048 Phase 2)', () => {
    const body = {
        entityType: 'hubspot',
        data: { code: SECRETS.oauthCode, code_verifier: SECRETS.codeVerifier },
    };
    let sink;
    let consoleSpies;

    beforeEach(() => {
        sink = createMemorySink();
        consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
            jest.spyOn(console, m).mockImplementation(() => {})
        );
        jest.spyOn(AuthenticateUser.prototype, 'execute').mockResolvedValue({ getId: () => 'user-1' });
    });
    afterEach(() => {
        for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    const byEvent = (eventName) => sink.records.filter((r) => r.eventName === eventName);

    it('logs the request at DEBUG with data keys only, and success at INFO with ids as fields', async () => {
        jest.spyOn(ProcessAuthorizationCallback.prototype, 'execute').mockResolvedValue({
            credential_id: 'cred-1',
            entity_id: 'ent-1',
        });
        const res = await postAuthorize(body);

        expect(res.status).toBe(200);
        const requested = sink.records.find((r) => r.level === 'DEBUG' && r.logger === 'frigg.integrations');
        expect(requested).toMatchObject({ userId: 'user-1', entityType: 'hubspot', dataKeys: ['code', 'code_verifier'] });
        expect(byEvent('frigg.integrations.authorized')).toEqual([
            expect.objectContaining({
                level: 'INFO',
                userId: 'user-1',
                entityType: 'hubspot',
                credentialId: 'cred-1',
                entityId: 'ent-1',
            }),
        ]);
        expect(sink.records).toContainNoSecretWindow([SECRETS.oauthCode, SECRETS.codeVerifier]);
    });

    it('writes exactly one frigg.http.request_failed on failure and no other ERROR', async () => {
        jest.spyOn(ProcessAuthorizationCallback.prototype, 'execute').mockRejectedValue(
            new Error(`token exchange failed: code=${SECRETS.oauthCode}`)
        );
        const res = await postAuthorize(body);

        expect(res.status).toBe(500);
        expect(byEvent('frigg.http.request_failed')).toHaveLength(1);
        expect(sink.records.filter((r) => r.level === 'ERROR')).toHaveLength(1);
        expect(sink.records).toContainNoSecretWindow([SECRETS.oauthCode, SECRETS.codeVerifier]);
    });
});
