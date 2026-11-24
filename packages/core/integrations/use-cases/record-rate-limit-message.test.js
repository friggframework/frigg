const { RecordRateLimitMessage } = require('./record-rate-limit-message');
const {
    TestIntegrationRepository,
} = require('../tests/doubles/test-integration-repository');

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const SECOND = 1_000;
const RETRY_AT = new Date('2026-09-28T13:00:00.000Z');

class HubSpotApi {
    static rateLimit = {
        userHints: {
            daily: {
                message: 'HubSpot allows a fixed number of calls each day.',
                links: [
                    { label: 'Limits', url: 'https://example.com/limits' },
                    { label: 'No url' },
                ],
            },
        },
    };
}

const moduleDefinitions = [
    { moduleName: 'hubspot', API: HubSpotApi },
    { moduleName: 'plain', API: class PlainApi {} },
];

describe('RecordRateLimitMessage', () => {
    let repository;
    let integrationId;
    let useCase;

    beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        repository = new TestIntegrationRepository();
        integrationId = (await repository.createIntegration([], 'user-1', {}))
            .id;
        useCase = new RecordRateLimitMessage({
            integrationRepository: repository,
            moduleDefinitions,
        });
    });

    afterEach(() => jest.restoreAllMocks());

    const warnings = () =>
        repository.findIntegrationMessages(integrationId, 'warnings');

    it('writes one client-safe RATE_LIMITED warning with the text and links of the module', async () => {
        await useCase.execute(integrationId, {
            module: 'hubspot',
            reason: 'daily',
            retryAt: RETRY_AT,
        });

        expect(await warnings()).toEqual([
            {
                title: 'Rate limit reached',
                message: 'HubSpot allows a fixed number of calls each day.',
                timestamp: NOW,
                code: 'RATE_LIMITED',
                module: 'hubspot',
                reason: 'daily',
                retryAt: '2026-09-28T13:00:00.000Z',
                actions: [
                    { type: 'RETRY_WHEN_READY' },
                    {
                        type: 'LINK',
                        label: 'Limits',
                        url: 'https://example.com/limits',
                    },
                ],
            },
        ]);
    });

    it('says when the integration tries again, for a module with no hint for the reason', async () => {
        await useCase.execute(integrationId, {
            module: 'plain',
            reason: 'burst',
            retryAt: new Date('2026-09-28T13:00:20.000Z'),
        });

        const [warning] = await warnings();
        expect(warning.message).toBe(
            'The plain API rate limit was reached. The integration tries again at 2026-09-28 13:01 UTC.'
        );
        expect(warning.actions).toEqual([{ type: 'RETRY_WHEN_READY' }]);
    });

    it('says that the integration stopped waiting when a cap ended the deferrals', async () => {
        await useCase.execute(integrationId, {
            module: 'plain',
            reason: 'daily',
            retryAt: RETRY_AT,
            capped: true,
        });

        const [warning] = await warnings();
        expect(warning.message).toBe(
            'The plain API rate limit was reached for longer than the integration waits. Some work may not complete.'
        );
    });

    it('names the reason unknown when the error gave none', async () => {
        await useCase.execute(integrationId, {
            module: 'plain',
            retryAt: RETRY_AT,
        });

        expect((await warnings())[0].reason).toBe('unknown');
    });

    it('writes one warning for the same module and a retryAt within 60 s', async () => {
        await useCase.execute(integrationId, {
            module: 'hubspot',
            reason: 'daily',
            retryAt: RETRY_AT,
        });
        await useCase.execute(integrationId, {
            module: 'hubspot',
            reason: 'daily',
            retryAt: new Date(RETRY_AT.getTime() + 60 * SECOND),
        });
        await useCase.execute(integrationId, {
            module: 'hubspot',
            reason: 'daily',
            retryAt: new Date(RETRY_AT.getTime() + 61 * SECOND),
        });

        expect((await warnings()).map((w) => w.retryAt)).toEqual([
            '2026-09-28T13:00:00.000Z',
            '2026-09-28T13:01:01.000Z',
        ]);
    });

    it('asks the repository to keep the newest 50 warnings', async () => {
        const append = jest.spyOn(repository, 'appendRateLimitMessage');

        await useCase.execute(integrationId, {
            module: 'hubspot',
            reason: 'daily',
            retryAt: RETRY_AT,
        });

        expect(append).toHaveBeenCalledWith(
            integrationId,
            'warnings',
            expect.objectContaining({ code: 'RATE_LIMITED' }),
            {
                retryAtFrom: '2026-09-28T12:59:00.000Z',
                retryAtTo: '2026-09-28T13:01:00.000Z',
                keepLast: 50,
            }
        );
    });

    it('writes nothing when the error names no module', async () => {
        await useCase.execute(integrationId, {
            reason: 'daily',
            retryAt: RETRY_AT,
        });

        expect(await warnings()).toEqual([]);
    });

    it('requires an integration repository', () => {
        expect(() => new RecordRateLimitMessage({})).toThrow(
            'integrationRepository is required'
        );
    });
});
