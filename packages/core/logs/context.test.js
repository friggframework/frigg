const {
    runInContext,
    getContext,
    getLoggerScope,
    hasOnlyLoggerKeys,
    LOGGER_SCOPE_KEY,
} = require('./context');

describe('logs/context', () => {
    it('returns null outside any run', () => {
        expect(getContext()).toBeNull();
        expect(getLoggerScope()).toEqual({});
    });

    it('returns the value of fn', async () => {
        await expect(runInContext({}, async () => 42)).resolves.toBe(42);
        expect(runInContext({}, () => 'sync')).toBe('sync');
    });

    it('merges runs: inner undefined keeps outer, explicit null is stored as null', () => {
        runInContext({ integrationId: 'i-1', userId: 'u-1' }, () => {
            runInContext({ integrationId: undefined, userId: null, version: '2' }, () => {
                expect(getContext()).toEqual({
                    integrationId: 'i-1',
                    userId: null,
                    version: '2',
                });
            });
            expect(getContext()).toEqual({ integrationId: 'i-1', userId: 'u-1' });
        });
    });

    it('merges the log sub-object one level', () => {
        runInContext({ log: { requestId: 'r-1', route: '/a' } }, () => {
            runInContext(
                { log: { messageId: 'm-1', route: undefined, method: null } },
                () => {
                    expect(getContext().log).toEqual({
                        requestId: 'r-1',
                        route: '/a',
                        messageId: 'm-1',
                        method: null,
                    });
                }
            );
        });
    });

    it('replaces a nested object below the log sub-object', () => {
        runInContext({ log: { invocation: { source: 'http', method: 'GET' } } }, () => {
            runInContext({ log: { invocation: { source: 'sqs' } } }, () => {
                expect(getContext().log.invocation).toEqual({ source: 'sqs' });
            });
        });
    });

    it('deep-freezes the store and does not freeze the caller objects', () => {
        const invocation = { source: 'http', headerNames: ['a'] };
        runInContext({ integrationId: 'i-1', log: { invocation } }, () => {
            const store = getContext();
            expect(Object.isFrozen(store)).toBe(true);
            expect(Object.isFrozen(store.log)).toBe(true);
            expect(Object.isFrozen(store.log.invocation)).toBe(true);
            expect(Object.isFrozen(store.log.invocation.headerNames)).toBe(true);
        });
        expect(Object.isFrozen(invocation)).toBe(false);
        invocation.source = 'changed';
        expect(invocation.source).toBe('changed');
    });

    it('treats a null or missing context as an empty merge', () => {
        runInContext({ userId: 'u-1' }, () => {
            runInContext(null, () => {
                expect(getContext()).toEqual({ userId: 'u-1' });
            });
            runInContext(undefined, () => {
                expect(getContext()).toEqual({ userId: 'u-1' });
            });
        });
    });

    it('keeps outer keys and own inner keys in parallel branches', async () => {
        const tick = () => new Promise((resolve) => setImmediate(resolve));
        await runInContext({ log: { requestId: 'r-1' } }, async () => {
            const seen = await Promise.all(
                ['m-1', 'm-2', 'm-3'].map((messageId) =>
                    runInContext({ log: { messageId } }, async () => {
                        await tick();
                        return getContext().log;
                    })
                )
            );
            expect(seen).toEqual([
                { requestId: 'r-1', messageId: 'm-1' },
                { requestId: 'r-1', messageId: 'm-2' },
                { requestId: 'r-1', messageId: 'm-3' },
            ]);
            expect(getContext().log).toEqual({ requestId: 'r-1' });
        });
    });

    it('getLoggerScope returns the four integration ids plus the log keys', () => {
        runInContext(
            {
                integrationId: 'i-1',
                integrationType: 'hubspot',
                userId: 'u-1',
                version: '1.0.0',
                url: 'https://example.com',
                log: { requestId: 'r-1', integrationEvent: 'ON_WEBHOOK' },
            },
            () => {
                expect(getLoggerScope()).toEqual({
                    integrationId: 'i-1',
                    integrationType: 'hubspot',
                    userId: 'u-1',
                    version: '1.0.0',
                    requestId: 'r-1',
                    integrationEvent: 'ON_WEBHOOK',
                });
            }
        );
    });

    it('getLoggerScope omits ids that are not set', () => {
        runInContext({ integrationId: 'i-1' }, () => {
            expect(getLoggerScope()).toEqual({ integrationId: 'i-1' });
        });
    });

    it('hasOnlyLoggerKeys is true only for a store that holds just the log key', () => {
        expect(LOGGER_SCOPE_KEY).toBe('log');
        expect(hasOnlyLoggerKeys({ log: { requestId: 'r' } })).toBe(true);
        expect(hasOnlyLoggerKeys({ log: {}, integrationId: 'i' })).toBe(false);
        expect(hasOnlyLoggerKeys({ integrationId: null })).toBe(false);
        expect(hasOnlyLoggerKeys({})).toBe(false);
        expect(hasOnlyLoggerKeys(null)).toBe(false);
        expect(hasOnlyLoggerKeys(undefined)).toBe(false);
    });

    it('shares one store across module registries', () => {
        let isolated;
        jest.isolateModules(() => {
            isolated = require('./context');
        });
        runInContext({ userId: 'u-1' }, () => {
            expect(isolated.getContext()).toEqual({ userId: 'u-1' });
        });
    });
});
