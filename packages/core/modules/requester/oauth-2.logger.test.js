const { OAuth2Requester } = require('./oauth-2');
const { Requester } = require('./requester');
const { createMemorySink, resetLoggerForTests } = require('../../logs');
const { SECRETS } = require('../../logs/__fixtures__/secrets');

let sink;
let consoleSpies;

beforeEach(() => {
    sink = createMemorySink();
    consoleSpies = ['log', 'warn', 'error'].map((method) =>
        jest.spyOn(console, method).mockImplementation()
    );
});

afterEach(() => consoleSpies.forEach((spy) => spy.mockRestore()));

const expectNoConsole = () =>
    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());

const byEvent = (eventName) =>
    sink.records.filter((r) => r.eventName === eventName);

function tokenResponse({ status, body }) {
    return {
        status,
        bodyUsed: false,
        headers: {
            get: () => 'application/json',
            [Symbol.iterator]: function* () {
                yield ['content-type', 'application/json'];
            },
        },
        json: async () => JSON.parse(body),
        text: async () => body,
    };
}

function makeOAuth(fetch, params = {}) {
    return new OAuth2Requester({
        delegate: { name: 'hubspot', receiveNotification: jest.fn() },
        grant_type: 'authorization_code',
        client_id: 'client-id',
        client_secret: SECRETS.clientSecret,
        access_token: SECRETS.accessToken,
        refresh_token: SECRETS.refreshToken,
        tokenUri: 'https://auth.example.com/oauth/token',
        requestTimeoutMs: 0,
        backOff: [],
        credentialReloadBackoffMs: [],
        fetch,
        ...params,
    });
}

describe('OAuth2Requester logs (ADR-048 Phase 2)', () => {
    it('a refresh 401 whose body holds access_token leaks nothing', async () => {
        const body = `{"error":"invalid_client","access_token":"${SECRETS.idToken}"}`;
        const requester = makeOAuth(
            jest.fn(async () => tokenResponse({ status: 401, body }))
        );

        await expect(requester.refreshAuth()).resolves.toBe(false);

        const [failed] = byEvent('module.hubspot.token_refresh_failed');
        expect(failed.level).toBe('DEBUG');
        expect(failed.statusCode).toBe(401);
        expect(failed.reason).toBe(
            'POST https://auth.example.com/oauth/token 401'
        );
        expect(failed).not.toHaveProperty('error');
        expect(failed).not.toHaveProperty('response_data');
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });

    it('a successful refresh writes INFO token_refreshed and DEBUG steps only', async () => {
        const body = JSON.stringify({
            access_token: SECRETS.accessToken,
            expires_in: 3600,
        });
        const requester = makeOAuth(
            jest.fn(async () => tokenResponse({ status: 200, body }))
        );

        await expect(requester.refreshAuth()).resolves.toBe(true);

        expect(byEvent('module.hubspot.token_refreshed')[0].level).toBe('INFO');
        expect(byEvent('module.hubspot.token_refresh_started')[0]).toMatchObject({
            level: 'DEBUG',
            grantType: 'authorization_code',
            refreshTokenPresent: true,
            clientSecretPresent: true,
        });
        expect(byEvent('module.hubspot.refresh_token_preserved')).toHaveLength(1);
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });

    it('a failed request writes DEBUG request_failed with method, redacted url and header names', async () => {
        class TestRequester extends Requester {
            async addAuthHeaders(headers) {
                return { ...headers, Authorization: `Bearer ${SECRETS.bearer}` };
            }
        }
        const requester = new TestRequester({
            fetch: jest.fn(async () =>
                tokenResponse({ status: 404, body: '{"message":"nope"}' })
            ),
            requestTimeoutMs: 0,
            backOff: [],
            delegate: { name: 'hubspot' },
        });

        await expect(
            requester._get({
                url: `https://api.example.com/x?api_key=${SECRETS.apiKeyQuery}`,
            })
        ).rejects.toMatchObject({ statusCode: 404 });

        const [record] = byEvent('module.hubspot.request_failed');
        expect(record).toMatchObject({
            level: 'DEBUG',
            method: 'GET',
            url: 'https://api.example.com/x?api_key=REDACTED',
            statusCode: 404,
            headerNames: ['Authorization'],
        });
        expect(sink.records).toContainNoSecretWindow(SECRETS);
    });

    it('at INFO writes no DEBUG record and never lists the request headers', async () => {
        resetLoggerForTests({ level: 'INFO', sinks: [] });
        sink = createMemorySink();
        const ownKeys = jest.fn((target) => Reflect.ownKeys(target));
        class TestRequester extends Requester {
            async addAuthHeaders(headers) {
                return new Proxy({ ...headers }, { ownKeys });
            }
        }
        const requester = new TestRequester({
            fetch: jest.fn(async () =>
                tokenResponse({ status: 404, body: '{}' })
            ),
            requestTimeoutMs: 0,
            backOff: [],
        });

        await expect(requester._get({ url: 'https://h.example/p' })).rejects.toThrow();

        expect(sink.records.filter((r) => r.level === 'DEBUG')).toEqual([]);
        expect(ownKeys).not.toHaveBeenCalled();
    });
});
