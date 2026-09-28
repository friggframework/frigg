jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { Module } = require('../module');
const { Requester } = require('../requester/requester');
const { RateLimitError } = require('../../errors');
const { createMemorySink } = require('../../logs');

const DAILY_LINKS = [
    { label: 'API usage limits', url: 'https://developers.example.com/limits' },
];

class LimitedApi extends Requester {
    static rateLimit = { userHints: { daily: { links: DAILY_LINKS } } };

    async addAuthHeaders(headers) {
        return headers;
    }
}

class UnhintedApi extends Requester {
    async addAuthHeaders(headers) {
        return headers;
    }
}

function makeModule(API = LimitedApi) {
    return new Module({
        definition: {
            moduleName: 'hubspot',
            modelName: 'Hubspot',
            API,
            requiredAuthMethods: {
                getToken: jest.fn(),
                getEntityDetails: jest.fn(),
                getCredentialDetails: jest.fn(),
                apiPropertiesToPersist: { credential: [], entity: [] },
                testAuthRequest: jest.fn(),
            },
        },
        userId: 'user-1',
        entity: {
            id: 'entity-1',
            userId: 'user-1',
            credential: { id: 'cred-1' },
        },
    });
}

function rateLimitError(hint = {}) {
    return new RateLimitError({
        hint: { reason: 'daily', policy: 'DAILY', source: 'header', ...hint },
        waitMs: 3_600_000,
        resource: 'https://api.example.com/v1/items?api_key=secret-key-value',
        init: { headers: { Authorization: 'Bearer secret-token-value' } },
        response: { status: 429 },
        responseBody: '{"message":"secret-body-value"}',
        module: 'hubspot',
    });
}

describe('Module RATE_LIMITED delegate propagation', () => {
    let delegate;
    let module;
    let sink;

    beforeEach(() => {
        sink = createMemorySink();
        delegate = {
            receiveNotification: jest.fn().mockResolvedValue(undefined),
        };
        module = makeModule();
        module.delegate = delegate;
    });

    it('declares the delegate type', () => {
        expect(module.DLGT_RATE_LIMITED).toBe('RATE_LIMITED');
        expect(module.delegateTypes).toContain('RATE_LIMITED');
    });

    it('forwards the notification of its api upward with the reset time and the links for the reason', async () => {
        const error = rateLimitError();

        await module.api.notify(module.api.DLGT_RATE_LIMITED, error);

        expect(delegate.receiveNotification).toHaveBeenCalledTimes(1);
        expect(delegate.receiveNotification).toHaveBeenCalledWith(
            module,
            'RATE_LIMITED',
            {
                moduleName: 'hubspot',
                reason: 'daily',
                retryAt: error.retryAt,
                policy: 'DAILY',
                statusCode: 429,
                links: DAILY_LINKS,
            }
        );
    });

    it('forwards no message, url, body or header of the error', async () => {
        await module.api.notify(module.api.DLGT_RATE_LIMITED, rateLimitError());

        const [, , payload] = delegate.receiveNotification.mock.calls[0];
        expect(Object.keys(payload).sort()).toEqual([
            'links',
            'moduleName',
            'policy',
            'reason',
            'retryAt',
            'statusCode',
        ]);
        expect(JSON.stringify(payload)).not.toMatch(/secret-/);
    });

    it('forwards no links when the module declares no hints', async () => {
        module = makeModule(UnhintedApi);
        module.delegate = delegate;

        await module.api.notify(module.api.DLGT_RATE_LIMITED, rateLimitError());

        const [, , payload] = delegate.receiveNotification.mock.calls[0];
        expect(payload.links).toEqual([]);
    });

    it('forwards no links when the hints do not cover the reason', async () => {
        await module.api.notify(
            module.api.DLGT_RATE_LIMITED,
            rateLimitError({ reason: 'burst' })
        );

        const [, , payload] = delegate.receiveNotification.mock.calls[0];
        expect(payload.links).toEqual([]);
    });

    it('completes silently when no delegate is wired', async () => {
        module.delegate = null;

        await expect(
            module.api.notify(module.api.DLGT_RATE_LIMITED, rateLimitError())
        ).resolves.toBeUndefined();
        expect(sink.records).toEqual([]);
    });

    it('does not throw and writes one ERROR when the delegate fails', async () => {
        delegate.receiveNotification.mockRejectedValue(new Error('db down'));

        await expect(
            module.api.notify(module.api.DLGT_RATE_LIMITED, rateLimitError())
        ).resolves.toBeUndefined();

        expect(
            sink.records.filter(
                (record) =>
                    record.eventName ===
                    'module.hubspot.rate_limited_propagation_failed'
            )
        ).toEqual([
            expect.objectContaining({
                level: 'ERROR',
                error: expect.objectContaining({ message: 'db down' }),
            }),
        ]);
    });
});
