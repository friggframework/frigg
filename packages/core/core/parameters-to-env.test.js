/**
 * Tests for parametersToEnv - SSM Parameter Store runtime loader
 *
 * Uses aws-sdk-client-mock to stub the SSM client.
 */

const { mockClient } = require('aws-sdk-client-mock');
const { SSMClient, GetParametersCommand } = require('@aws-sdk/client-ssm');
const { parametersToEnv, _resetCache } = require('./parameters-to-env');

describe('parametersToEnv - SSM Parameter Store loader', () => {
    let ssmMock;
    let clock;
    const originalEnv = process.env;

    // Builds a callsFake responder from a { paramName: {value, version} } store.
    const setParamStore = (store) => {
        ssmMock.on(GetParametersCommand).callsFake((input) => {
            const Parameters = [];
            const InvalidParameters = [];
            for (const name of input.Names) {
                const entry = store[name];
                if (entry) {
                    Parameters.push({
                        Name: name,
                        Value: entry.value,
                        Version: entry.version ?? 1,
                        Type: 'SecureString',
                    });
                } else {
                    InvalidParameters.push(name);
                }
            }
            return { Parameters, InvalidParameters };
        });
    };

    beforeEach(() => {
        ssmMock = mockClient(SSMClient);
        process.env = { ...originalEnv };
        delete process.env.SSM_PARAMETER_PREFIX;
        delete process.env.FRIGG_SSM_OFFLOADED_KEYS;
        delete process.env.FRIGG_SSM_CACHE_TTL;
        process.env.AWS_REGION = 'us-east-1';
        _resetCache();

        clock = 1_000_000;
        jest.spyOn(Date, 'now').mockImplementation(() => clock);
    });

    afterEach(() => {
        ssmMock.reset();
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    describe('no-op guard', () => {
        it('returns without any API call when neither env var is set', async () => {
            await parametersToEnv();
            expect(ssmMock.calls()).toHaveLength(0);
        });

        it('returns without any API call when only the prefix is set', async () => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            await parametersToEnv();
            expect(ssmMock.calls()).toHaveLength(0);
        });

        it('returns without any API call when only the key list is set', async () => {
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'A,B';
            await parametersToEnv();
            expect(ssmMock.calls()).toHaveLength(0);
        });

        it('returns without any API call when the key list is empty', async () => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = '  , ,';
            await parametersToEnv();
            expect(ssmMock.calls()).toHaveLength(0);
        });

        it('does not log on the no-op path', async () => {
            const logSpy = jest
                .spyOn(console, 'log')
                .mockImplementation(() => {});
            await parametersToEnv();
            expect(logSpy).not.toHaveBeenCalled();
        });
    });

    describe('fetch and assignment', () => {
        beforeEach(() => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'DATABASE_URL,API_TOKEN';
        });

        it('fetches declared keys and sets them as env vars', async () => {
            setParamStore({
                '/frigg/app/DATABASE_URL': { value: 'postgres://x' },
                '/frigg/app/API_TOKEN': { value: 'tok_123' },
            });

            await parametersToEnv();

            expect(process.env.DATABASE_URL).toBe('postgres://x');
            expect(process.env.API_TOKEN).toBe('tok_123');
        });

        it('builds parameter names as prefix/key and requests decryption', async () => {
            setParamStore({
                '/frigg/app/DATABASE_URL': { value: 'postgres://x' },
                '/frigg/app/API_TOKEN': { value: 'tok_123' },
            });

            await parametersToEnv();

            const call = ssmMock.commandCalls(GetParametersCommand)[0];
            expect(call.args[0].input.Names).toEqual([
                '/frigg/app/DATABASE_URL',
                '/frigg/app/API_TOKEN',
            ]);
            expect(call.args[0].input.WithDecryption).toBe(true);
        });
    });

    describe('batching', () => {
        it('splits more than 10 keys into multiple GetParameters calls', async () => {
            const keys = Array.from({ length: 12 }, (_, i) => `K${i}`);
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = keys.join(',');

            const store = {};
            keys.forEach((k) => {
                store[`/frigg/app/${k}`] = { value: `v-${k}` };
            });
            setParamStore(store);

            await parametersToEnv();

            const calls = ssmMock.commandCalls(GetParametersCommand);
            expect(calls).toHaveLength(2);
            expect(calls[0].args[0].input.Names).toHaveLength(10);
            expect(calls[1].args[0].input.Names).toHaveLength(2);
            keys.forEach((k) => {
                expect(process.env[k]).toBe(`v-${k}`);
            });
        });
    });

    describe('precedence (real env wins)', () => {
        it('never fetches or overwrites a key already present in process.env', async () => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'REAL_KEY,OWNED_KEY';
            process.env.REAL_KEY = 'from-real-env';

            setParamStore({
                '/frigg/app/REAL_KEY': { value: 'from-ssm' },
                '/frigg/app/OWNED_KEY': { value: 'ssm-owned' },
            });

            await parametersToEnv();

            expect(process.env.REAL_KEY).toBe('from-real-env');
            expect(process.env.OWNED_KEY).toBe('ssm-owned');

            const call = ssmMock.commandCalls(GetParametersCommand)[0];
            expect(call.args[0].input.Names).toEqual(['/frigg/app/OWNED_KEY']);
        });
    });

    describe('TTL cache', () => {
        beforeEach(() => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'OWNED_KEY';
        });

        it('does not refetch within the TTL window', async () => {
            process.env.FRIGG_SSM_CACHE_TTL = '300';
            setParamStore({ '/frigg/app/OWNED_KEY': { value: 'v1' } });

            await parametersToEnv();
            clock += 299 * 1000;
            await parametersToEnv();

            expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(1);
        });

        it('caches forever when TTL is 0', async () => {
            process.env.FRIGG_SSM_CACHE_TTL = '0';
            setParamStore({ '/frigg/app/OWNED_KEY': { value: 'v1' } });

            await parametersToEnv();
            clock += 10 * 365 * 24 * 60 * 60 * 1000;
            await parametersToEnv();

            expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(1);
        });

        it('refetches after the TTL expires and updates loader-owned keys only', async () => {
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'REAL_KEY,OWNED_KEY';
            process.env.REAL_KEY = 'from-real-env';
            process.env.FRIGG_SSM_CACHE_TTL = '60';

            setParamStore({
                '/frigg/app/OWNED_KEY': { value: 'v1', version: 1 },
            });
            await parametersToEnv();
            expect(process.env.OWNED_KEY).toBe('v1');

            setParamStore({
                '/frigg/app/OWNED_KEY': { value: 'v2', version: 2 },
            });
            clock += 61 * 1000;
            await parametersToEnv();

            expect(process.env.OWNED_KEY).toBe('v2');
            expect(process.env.REAL_KEY).toBe('from-real-env');

            const calls = ssmMock.commandCalls(GetParametersCommand);
            expect(calls).toHaveLength(2);
            // refresh only fetches the loader-owned key, never the real-env key
            expect(calls[1].args[0].input.Names).toEqual([
                '/frigg/app/OWNED_KEY',
            ]);
        });

        it('keeps stale values and does not throw when a TTL refresh fails', async () => {
            process.env.FRIGG_SSM_CACHE_TTL = '60';
            setParamStore({ '/frigg/app/OWNED_KEY': { value: 'v1' } });
            await parametersToEnv();
            expect(process.env.OWNED_KEY).toBe('v1');

            clock += 61 * 1000;
            ssmMock
                .on(GetParametersCommand)
                .rejects(new Error('ssm outage'));
            const warnSpy = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => {});

            await expect(parametersToEnv()).resolves.toBeUndefined();
            expect(process.env.OWNED_KEY).toBe('v1');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('refresh failed')
            );

            // backs off instead of re-attempting on every invocation
            const callsAfterFailure = ssmMock.commandCalls(
                GetParametersCommand
            ).length;
            clock += 1000;
            await parametersToEnv();
            expect(
                ssmMock.commandCalls(GetParametersCommand)
            ).toHaveLength(callsAfterFailure);
        });

        it('still fails the initial load when SSM is unavailable', async () => {
            ssmMock
                .on(GetParametersCommand)
                .rejects(new Error('ssm outage'));

            await expect(parametersToEnv()).rejects.toThrow('ssm outage');
        });

        it('defaults the TTL to 300 seconds when unset', async () => {
            setParamStore({ '/frigg/app/OWNED_KEY': { value: 'v1' } });

            await parametersToEnv();
            clock += 299 * 1000;
            await parametersToEnv();
            expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(1);

            clock += 2 * 1000;
            await parametersToEnv();
            expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(2);
        });
    });

    describe('concurrency', () => {
        it('shares a single in-flight promise across concurrent callers', async () => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'OWNED_KEY';
            setParamStore({ '/frigg/app/OWNED_KEY': { value: 'v1' } });

            await Promise.all([parametersToEnv(), parametersToEnv()]);

            expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(1);
        });
    });

    describe('fail-fast on missing parameters', () => {
        it('throws listing every missing parameter name and the prefix', async () => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS =
                'PRESENT,MISSING_ONE,MISSING_TWO';
            setParamStore({ '/frigg/app/PRESENT': { value: 'ok' } });

            await expect(parametersToEnv()).rejects.toThrow(
                /\/frigg\/app\/MISSING_ONE/
            );

            _resetCache();
            setParamStore({ '/frigg/app/PRESENT': { value: 'ok' } });
            let error;
            try {
                await parametersToEnv();
            } catch (err) {
                error = err;
            }
            expect(error.message).toContain('/frigg/app/MISSING_ONE');
            expect(error.message).toContain('/frigg/app/MISSING_TWO');
            expect(error.message).toContain('/frigg/app');
        });

        it('does not fail for a key already satisfied by real env even if absent in SSM', async () => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'REAL_KEY,OWNED_KEY';
            process.env.REAL_KEY = 'from-real-env';
            setParamStore({ '/frigg/app/OWNED_KEY': { value: 'ssm-owned' } });

            await expect(parametersToEnv()).resolves.not.toThrow();
            expect(process.env.OWNED_KEY).toBe('ssm-owned');
        });
    });

    describe('failure is not cached', () => {
        it('retries on the next invocation after a failed fetch', async () => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'OWNED_KEY';

            ssmMock
                .on(GetParametersCommand)
                .rejectsOnce(new Error('transient network error'))
                .callsFake(() => ({
                    Parameters: [
                        {
                            Name: '/frigg/app/OWNED_KEY',
                            Value: 'recovered',
                            Version: 1,
                        },
                    ],
                    InvalidParameters: [],
                }));

            await expect(parametersToEnv()).rejects.toThrow(
                'transient network error'
            );

            await parametersToEnv();
            expect(process.env.OWNED_KEY).toBe('recovered');
            expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(2);
        });
    });

    describe('throttling', () => {
        beforeEach(() => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'OWNED_KEY';
        });

        it('retries a throttled batch and eventually succeeds', async () => {
            const throttle = Object.assign(new Error('Rate exceeded'), {
                name: 'ThrottlingException',
            });
            ssmMock
                .on(GetParametersCommand)
                .rejectsOnce(throttle)
                .rejectsOnce(throttle)
                .callsFake(() => ({
                    Parameters: [
                        {
                            Name: '/frigg/app/OWNED_KEY',
                            Value: 'v1',
                            Version: 1,
                        },
                    ],
                    InvalidParameters: [],
                }));

            await parametersToEnv();

            expect(process.env.OWNED_KEY).toBe('v1');
            expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(3);
        });

        it('propagates non-throttling errors immediately without retry', async () => {
            ssmMock.on(GetParametersCommand).rejects(new Error('AccessDenied'));

            await expect(parametersToEnv()).rejects.toThrow('AccessDenied');
            expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(1);
        });
    });

    describe('logging', () => {
        it('logs parameter names and versions on success, never values', async () => {
            process.env.SSM_PARAMETER_PREFIX = '/frigg/app';
            process.env.FRIGG_SSM_OFFLOADED_KEYS = 'OWNED_KEY';
            setParamStore({
                '/frigg/app/OWNED_KEY': {
                    value: 'super-secret-value',
                    version: 7,
                },
            });

            const logSpy = jest
                .spyOn(console, 'log')
                .mockImplementation(() => {});

            await parametersToEnv();

            expect(logSpy).toHaveBeenCalledWith(
                'parametersToEnv: loaded',
                expect.arrayContaining([
                    expect.stringContaining('/frigg/app/OWNED_KEY'),
                ])
            );
            const logged = JSON.stringify(logSpy.mock.calls);
            expect(logged).toContain('7');
            expect(logged).not.toContain('super-secret-value');
        });
    });

    describe('fetchOffloadedParameters (shared with the INIT preload)', () => {
        const { fetchOffloadedParameters } = require('./parameters-to-env');

        it('returns a { key: value } map for the requested keys', async () => {
            setParamStore({
                '/frigg/app/A': { value: 'va' },
                '/frigg/app/B': { value: 'vb' },
            });

            const values = await fetchOffloadedParameters('/frigg/app', [
                'A',
                'B',
            ]);
            expect(values).toEqual({ A: 'va', B: 'vb' });
        });

        it('batches more than 10 keys into multiple GetParameters calls', async () => {
            const keys = Array.from({ length: 23 }, (_, i) => `K${i}`);
            const store = {};
            for (const k of keys) store[`/frigg/app/${k}`] = { value: k };
            setParamStore(store);

            const values = await fetchOffloadedParameters('/frigg/app', keys);
            expect(Object.keys(values)).toHaveLength(23);
            expect(
                ssmMock.commandCalls(GetParametersCommand)
            ).toHaveLength(3);
        });

        it('throws listing every missing parameter name', async () => {
            setParamStore({ '/frigg/app/A': { value: 'va' } });

            await expect(
                fetchOffloadedParameters('/frigg/app', ['A', 'B', 'C'])
            ).rejects.toThrow(/\/frigg\/app\/B.*\/frigg\/app\/C/s);
        });

        it('does not mutate process.env (fetch-only)', async () => {
            setParamStore({ '/frigg/app/A': { value: 'va' } });
            delete process.env.A;

            await fetchOffloadedParameters('/frigg/app', ['A']);
            expect(process.env.A).toBeUndefined();
        });
    });
});
