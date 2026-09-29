jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { IntegrationBase } = require('../integration-base');
const {
    RecordRateLimitMessage,
} = require('../use-cases/record-rate-limit-message');
const { Module } = require('../../modules/module');
const { Requester } = require('../../modules/requester/requester');
const { RateLimitError } = require('../../errors');
const {
    TestIntegrationRepository,
} = require('./doubles/test-integration-repository');

const LIMITS_LINK = {
    label: 'API usage limits',
    url: 'https://developers.example.com/limits',
};

class LimitedApi extends Requester {
    static rateLimit = { userHints: { unknown: { links: [LIMITS_LINK] } } };

    async addAuthHeaders(headers) {
        return headers;
    }
}

const throttled = () => ({
    status: 429,
    bodyUsed: false,
    headers: new Map([
        ['Content-Type', 'application/json'],
        ['Retry-After', '3600'],
    ]),
    json: async () => ({}),
    text: async () => '{}',
});

describe('a rate limit from the Requester reaches the integration', () => {
    let integrationRepository;
    let integration;
    let module;
    let record;

    beforeEach(async () => {
        integrationRepository = new TestIntegrationRepository();
        record = await integrationRepository.createIntegration(
            ['entity-1'],
            'user-1',
            { type: 'test' }
        );
        module = new Module({
            definition: {
                moduleName: 'hubspot',
                modelName: 'Hubspot',
                API: LimitedApi,
                env: {
                    fetch: jest.fn(async () => throttled()),
                    requestTimeoutMs: 0,
                },
                requiredAuthMethods: {
                    getToken: jest.fn(),
                    getEntityDetails: jest.fn(),
                    getCredentialDetails: jest.fn(),
                    apiPropertiesToPersist: { credential: [], entity: [] },
                    testAuthRequest: jest.fn(),
                },
            },
            userId: 'user-1',
            entity: { id: 'entity-1', credential: { id: 'cred-1' } },
        });
        integration = new IntegrationBase({
            id: record.id,
            userId: 'user-1',
            entities: ['entity-1'],
            config: { type: 'test' },
            status: 'ENABLED',
            version: '0.0.0',
            messages: {},
            modules: [module],
        });
        integration.recordRateLimitMessage = new RecordRateLimitMessage({
            integrationRepository,
        });
        integration.updateIntegrationStatus = { execute: jest.fn() };
    });

    const storedWarnings = () =>
        integrationRepository.findIntegrationMessages(record.id, 'warnings');

    it('stores one warning with the reset time and the links of the module, and still throws', async () => {
        const before = Date.now();

        const error = await module.api
            ._get({ url: 'https://api.example.com/items' })
            .catch((e) => e);

        expect(error).toBeInstanceOf(RateLimitError);
        const [warning] = await storedWarnings();
        expect(await storedWarnings()).toHaveLength(1);
        expect(warning).toMatchObject({
            title: 'Rate limit reached',
            code: 'RATE_LIMITED',
            module: 'hubspot',
            reason: 'unknown',
            retryAt: error.retryAt.toISOString(),
            actions: [
                { type: 'RETRY_WHEN_READY' },
                { type: 'LINK', ...LIMITS_LINK },
            ],
        });
        expect(error.retryAt.getTime()).toBeGreaterThanOrEqual(
            before + 3_600_000
        );
    });

    it('does not put the request into the warning', async () => {
        await module.api
            ._get({ url: 'https://api.example.com/items?api_key=secret-key' })
            .catch(() => {});

        const [warning] = await storedWarnings();
        expect(JSON.stringify(warning)).not.toMatch(
            /secret-key|api\.example\.com/
        );
    });

    it('stores one warning for two requests that hit the same limit', async () => {
        await module.api
            ._get({ url: 'https://api.example.com/a' })
            .catch(() => {});
        await module.api
            ._get({ url: 'https://api.example.com/b' })
            .catch(() => {});

        expect(await storedWarnings()).toHaveLength(1);
    });

    it('leaves the status of the integration alone', async () => {
        await module.api
            ._get({ url: 'https://api.example.com/items' })
            .catch(() => {});

        expect(
            integration.updateIntegrationStatus.execute
        ).not.toHaveBeenCalled();
        expect(integration.status).toBe('ENABLED');
    });

    it('still throws the RateLimitError when the message cannot be stored', async () => {
        jest.spyOn(
            integrationRepository,
            'findIntegrationMessages'
        ).mockRejectedValue(new Error('db down'));

        const error = await module.api
            ._get({ url: 'https://api.example.com/items' })
            .catch((e) => e);

        expect(error).toBeInstanceOf(RateLimitError);
        const stored = await integrationRepository.findIntegrationById(
            record.id
        );
        expect(stored.messages.warnings).toBeUndefined();
    });
});
