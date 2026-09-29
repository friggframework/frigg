const { RecordRateLimitMessage } = require('./record-rate-limit-message');
const {
    TestIntegrationRepository,
} = require('../tests/doubles/test-integration-repository');

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const RETRY_AT = new Date('2026-09-28T14:30:15.000Z');
const LIMITS_LINK = {
    label: 'API usage limits',
    url: 'https://developers.example.com/limits',
};

const payload = (overrides = {}) => ({
    moduleName: 'hubspot',
    reason: 'daily',
    retryAt: RETRY_AT,
    policy: 'DAILY',
    statusCode: 429,
    links: [LIMITS_LINK],
    ...overrides,
});

describe('RecordRateLimitMessage Use-Case', () => {
    let integrationRepository;
    let useCase;
    let integrationId;

    const storedWarnings = () =>
        integrationRepository.findIntegrationMessages(
            integrationId,
            'warnings'
        );
    const storeWarning = (item) =>
        integrationRepository.updateIntegrationMessages(
            integrationId,
            'warnings',
            item,
            { keepLast: 50 }
        );
    const writes = () =>
        integrationRepository
            .getOperationHistory()
            .filter((op) => op.operation === 'updateMessages');

    beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        integrationRepository = new TestIntegrationRepository();
        useCase = new RecordRateLimitMessage({ integrationRepository });
        ({ id: integrationId } = await integrationRepository.createIntegration(
            ['e1'],
            'user-1',
            { type: 'dummy' }
        ));
    });

    afterEach(() => jest.restoreAllMocks());

    describe('the message', () => {
        it('is one warning with the code, the module, the reason, the reset time and the actions', async () => {
            await useCase.execute(integrationId, payload());

            expect(await storedWarnings()).toEqual([
                {
                    title: 'Rate limit reached',
                    message:
                        'The hubspot API rate limit was reached and resets at 2026-09-28 14:31 UTC.',
                    timestamp: NOW,
                    code: 'RATE_LIMITED',
                    module: 'hubspot',
                    reason: 'daily',
                    retryAt: '2026-09-28T14:30:15.000Z',
                    actions: [
                        { type: 'RETRY_WHEN_READY' },
                        { type: 'LINK', ...LIMITS_LINK },
                    ],
                },
            ]);
        });

        it('says the reset time in UTC, rounded up to the minute', async () => {
            await useCase.execute(
                integrationId,
                payload({ retryAt: new Date('2026-09-28T23:59:01.000Z') })
            );
            await useCase.execute(
                integrationId,
                payload({
                    moduleName: 'salesforce',
                    retryAt: new Date('2026-09-28T09:05:00.000Z'),
                })
            );

            const [first, second] = await storedWarnings();
            expect(first.message).toContain('resets at 2026-09-29 00:00 UTC.');
            expect(second.message).toContain('resets at 2026-09-28 09:05 UTC.');
        });

        it('has the retry action only when the module declares no links', async () => {
            await useCase.execute(integrationId, payload({ links: [] }));
            await useCase.execute(
                integrationId,
                payload({ moduleName: 'salesforce', links: undefined })
            );

            const [first, second] = await storedWarnings();
            expect(first.actions).toEqual([{ type: 'RETRY_WHEN_READY' }]);
            expect(second.actions).toEqual([{ type: 'RETRY_WHEN_READY' }]);
        });

        it('has a link action for each link, with its label and url only', async () => {
            const other = {
                label: 'Status page',
                url: 'https://status.example.com',
            };

            await useCase.execute(
                integrationId,
                payload({ links: [{ ...LIMITS_LINK, token: 'x' }, other] })
            );

            const [warning] = await storedWarnings();
            expect(warning.actions).toEqual([
                { type: 'RETRY_WHEN_READY' },
                { type: 'LINK', ...LIMITS_LINK },
                { type: 'LINK', ...other },
            ]);
        });

        it.each([
            [null],
            ['https://developers.example.com'],
            [{ label: 'No url' }],
            [{ url: 'https://developers.example.com' }],
            [{ label: 1, url: 2 }],
        ])('leaves out a link that is %p', async (badLink) => {
            await useCase.execute(
                integrationId,
                payload({ links: [badLink, LIMITS_LINK] })
            );

            const [warning] = await storedWarnings();
            expect(warning.actions).toEqual([
                { type: 'RETRY_WHEN_READY' },
                { type: 'LINK', ...LIMITS_LINK },
            ]);
        });

        it('holds nothing but fixed text and the fields of the payload it names', async () => {
            await useCase.execute(
                integrationId,
                payload({
                    message:
                        'GET https://api.example.com/v1?api_key=secret-key',
                    url: 'https://api.example.com/v1?api_key=secret-key',
                    body: '{"secret":"secret-body"}',
                    headers: { Authorization: 'Bearer secret-token' },
                })
            );

            const [warning] = await storedWarnings();
            expect(JSON.stringify(warning)).not.toMatch(/secret/);
            expect(Object.keys(warning).sort()).toEqual([
                'actions',
                'code',
                'message',
                'module',
                'reason',
                'retryAt',
                'timestamp',
                'title',
            ]);
        });
    });

    describe('one message for one limit', () => {
        it('writes one warning the first time', async () => {
            await useCase.execute(integrationId, payload());

            expect(writes()).toEqual([
                expect.objectContaining({ type: 'warnings', success: true }),
            ]);
        });

        it('skips a second report for the same module and the same reset time', async () => {
            await useCase.execute(integrationId, payload());

            await useCase.execute(integrationId, payload());

            expect(writes()).toHaveLength(1);
            expect(await storedWarnings()).toHaveLength(1);
        });

        it.each([[-60_000], [-1], [1], [60_000]])(
            'skips a report whose reset time is %d ms from the stored one',
            async (offsetMs) => {
                await useCase.execute(integrationId, payload());

                await useCase.execute(
                    integrationId,
                    payload({
                        retryAt: new Date(RETRY_AT.getTime() + offsetMs),
                    })
                );

                expect(await storedWarnings()).toHaveLength(1);
            }
        );

        it.each([[-60_001], [60_001], [3_600_000]])(
            'writes a report whose reset time is %d ms from the stored one',
            async (offsetMs) => {
                await useCase.execute(integrationId, payload());

                await useCase.execute(
                    integrationId,
                    payload({
                        retryAt: new Date(RETRY_AT.getTime() + offsetMs),
                    })
                );

                expect(await storedWarnings()).toHaveLength(2);
            }
        );

        it('writes for another module at the same reset time', async () => {
            await useCase.execute(integrationId, payload());

            await useCase.execute(
                integrationId,
                payload({ moduleName: 'salesforce' })
            );

            expect(
                (await storedWarnings()).map((warning) => warning.module)
            ).toEqual(['hubspot', 'salesforce']);
        });

        it('is not fooled by other warnings', async () => {
            await storeWarning({
                title: 'Something else',
                message: 'Not a rate limit',
                timestamp: 1,
            });
            await storeWarning({
                title: 'Other code',
                message: 'Same module and time',
                timestamp: 2,
                code: 'SOMETHING_ELSE',
                module: 'hubspot',
                retryAt: RETRY_AT.toISOString(),
            });

            await useCase.execute(integrationId, payload());

            expect(await storedWarnings()).toHaveLength(3);
        });

        it('is not fooled by a stored warning that has no valid reset time', async () => {
            await storeWarning({
                title: 'Rate limit reached',
                message: 'Broken',
                timestamp: 1,
                code: 'RATE_LIMITED',
                module: 'hubspot',
            });

            await useCase.execute(integrationId, payload());

            expect(await storedWarnings()).toHaveLength(2);
        });

        it('reads the stored warnings, not the messages of an instance', async () => {
            const other = new RecordRateLimitMessage({ integrationRepository });

            await useCase.execute(integrationId, payload());
            await other.execute(integrationId, payload());

            expect(await storedWarnings()).toHaveLength(1);
        });
    });

    describe('the newest 50 warnings', () => {
        it('drops the oldest warning of the integration when it adds its own', async () => {
            for (let n = 1; n <= 50; n++) {
                await storeWarning({
                    title: `W${n}`,
                    message: 'b',
                    timestamp: n,
                });
            }

            await useCase.execute(integrationId, payload());

            const warnings = await storedWarnings();
            expect(warnings).toHaveLength(50);
            expect(warnings[0].timestamp).toBe(2);
            expect(warnings[49]).toMatchObject({ code: 'RATE_LIMITED' });
        });
    });

    describe('the payload', () => {
        it.each([
            ['no module name', { moduleName: undefined }],
            ['an empty module name', { moduleName: '' }],
            ['a module name that is not a string', { moduleName: 42 }],
            ['no reset time', { retryAt: undefined }],
            ['a null reset time', { retryAt: null }],
            ['a reset time that is not a date', { retryAt: 'soon' }],
        ])(
            'reads and writes nothing for a payload with %s',
            async (_, overrides) => {
                integrationRepository.clearHistory();

                await expect(
                    useCase.execute(integrationId, payload(overrides))
                ).resolves.toBeUndefined();

                expect(integrationRepository.getOperationHistory()).toEqual([]);
            }
        );

        it('reads and writes nothing for no payload', async () => {
            integrationRepository.clearHistory();

            await expect(
                useCase.execute(integrationId, null)
            ).resolves.toBeUndefined();

            expect(integrationRepository.getOperationHistory()).toEqual([]);
        });

        it.each([
            ['an ISO string', RETRY_AT.toISOString()],
            ['epoch milliseconds', RETRY_AT.getTime()],
        ])('takes a reset time given as %s', async (_, retryAt) => {
            await useCase.execute(integrationId, payload({ retryAt }));

            const [warning] = await storedWarnings();
            expect(warning.retryAt).toBe('2026-09-28T14:30:15.000Z');
        });
    });

    describe('failures', () => {
        it('rejects and writes nothing when the read fails', async () => {
            jest.spyOn(
                integrationRepository,
                'findIntegrationMessages'
            ).mockRejectedValue(new Error('db down'));
            integrationRepository.clearHistory();

            await expect(
                useCase.execute(integrationId, payload())
            ).rejects.toThrow('db down');

            expect(
                integrationRepository
                    .getOperationHistory()
                    .filter((op) => op.operation === 'updateMessages')
            ).toEqual([]);
        });

        it('rejects when the write fails', async () => {
            jest.spyOn(
                integrationRepository,
                'updateIntegrationMessages'
            ).mockRejectedValue(new Error('db down'));

            await expect(
                useCase.execute(integrationId, payload())
            ).rejects.toThrow('db down');
        });

        it('rejects when the integration does not exist', async () => {
            await expect(
                useCase.execute('missing-id', payload())
            ).rejects.toThrow('Integration missing-id not found');
        });
    });
});
