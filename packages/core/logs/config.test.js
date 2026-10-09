const { getLogger } = require('./logger');
const { createMemorySink } = require('./sinks');
const runtime = require('./logger-runtime');
const { withEnv } = require('./__fixtures__/with-env');

const LEVEL_ENV = {
    FRIGG_LOG_LEVEL: undefined,
    AWS_LAMBDA_LOG_LEVEL: undefined,
    IS_OFFLINE: undefined,
    DEBUG_VERBOSE: undefined,
    STAGE: 'dev',
};

const env = (vars) => ({ ...LEVEL_ENV, ...vars });
const level = () => runtime.getConfig().level;
const byEvent = (sink, eventName) => sink.records.filter((r) => r.eventName === eventName);

describe('logs config (FRIGG_LOG_LEVEL and friends)', () => {
    it('defaults to INFO under STAGE=dev', () => {
        withEnv(env({}), () => expect(level()).toBe('INFO'));
    });

    it('defaults to INFO with STAGE unset', () => {
        withEnv(env({ STAGE: undefined }), () => expect(level()).toBe('INFO'));
    });

    it('ignores case and trims; an empty value is unset', () => {
        withEnv(env({ FRIGG_LOG_LEVEL: '  wArN ' }), () => expect(level()).toBe('WARN'));
        withEnv(env({ FRIGG_LOG_LEVEL: '', STAGE: 'local' }), () => expect(level()).toBe('DEBUG'));
    });

    it('maps an unknown value to INFO and warns exactly once, across calls and names', () => {
        withEnv(env({ FRIGG_LOG_LEVEL: 'shouty' }), (sink) => {
            expect(level()).toBe('INFO');
            for (let i = 0; i < 50; i += 1) {
                getLogger(`integration.n${i % 5}`).info('x');
            }
            const warnings = byEvent(sink, 'frigg.logger.invalid_level');
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toMatchObject({ level: 'WARN', logger: 'frigg.logger' });
            expect(runtime.takeViolationsForTests()).toEqual([]);
        });
    });

    it('defaults to DEBUG under STAGE=local', () => {
        withEnv(env({ STAGE: 'local' }), () => expect(level()).toBe('DEBUG'));
    });

    it.each([
        ['true', 'DEBUG'],
        ['1', 'DEBUG'],
        ['false', 'INFO'],
        ['0', 'INFO'],
        ['', 'INFO'],
    ])('IS_OFFLINE=%p → %s', (value, expected) => {
        withEnv(env({ IS_OFFLINE: value }), () => expect(level()).toBe(expected));
    });

    it('lets an explicit level beat the local default', () => {
        withEnv(env({ STAGE: 'local', FRIGG_LOG_LEVEL: 'error' }), () => expect(level()).toBe('ERROR'));
    });

    it.each([
        ['INFO', 'WARN', 'WARN', 1],
        ['WARN', 'DEBUG', 'WARN', 1],
        ['DEBUG', 'DEBUG', 'DEBUG', 0],
        ['DEBUG', 'bogus', 'DEBUG', 0],
    ])('FRIGG_LOG_LEVEL=%s, AWS_LAMBDA_LOG_LEVEL=%s → %s with %i conflict warning(s)', (frigg, aws, expected, warnings) => {
        withEnv(env({ FRIGG_LOG_LEVEL: frigg, AWS_LAMBDA_LOG_LEVEL: aws }), (sink) => {
            expect(level()).toBe(expected);
            getLogger('integration.x').error('trigger');
            getLogger('integration.x').error('trigger again');
            expect(byEvent(sink, 'frigg.logger.level_conflict')).toHaveLength(warnings);
        });
    });

    it('maps DEBUG_VERBOSE=1 to DEBUG unless FRIGG_LOG_LEVEL is set', () => {
        withEnv(env({ DEBUG_VERBOSE: '1' }), () => expect(level()).toBe('DEBUG'));
        withEnv(env({ DEBUG_VERBOSE: '1', FRIGG_LOG_LEVEL: 'info' }), () => expect(level()).toBe('INFO'));
    });

    it('reads the env lazily and memoizes it until reset', () => {
        withEnv(env({ FRIGG_LOG_LEVEL: 'warn' }), () => {
            expect(level()).toBe('WARN');
            process.env.FRIGG_LOG_LEVEL = 'error';
            expect(level()).toBe('WARN');
            runtime.resetLoggerForTests({ sinks: [createMemorySink({ install: false })] });
            expect(level()).toBe('ERROR');
        });
    });

    it('reads appName and stage from FRIGG_STACK and STAGE; absent keys stay absent', () => {
        withEnv(env({ FRIGG_STACK: 'acme', STAGE: 'prod' }), (sink) => {
            getLogger('integration.x').info('x');
            expect(sink.records[0]).toMatchObject({ appName: 'acme', stage: 'prod' });
        });
        withEnv(env({ FRIGG_STACK: undefined, STAGE: undefined }), (sink) => {
            getLogger('integration.x').info('x');
            expect(sink.records[0]).not.toHaveProperty('appName');
            expect(sink.records[0]).not.toHaveProperty('stage');
        });
    });

    it('performs no env read at module load', () => {
        const realEnv = process.env;
        const throwing = new Proxy(realEnv, {
            get: (target, key) => {
                if (typeof key === 'string') throw new Error(`env read at load: ${key}`);
                return target[key];
            },
        });
        try {
            jest.isolateModules(() => {
                process.env = throwing;
                require('./levels');
                require('./context');
                require('./sinks');
                require('./logger-runtime');
                require('./record');
                require('./logger');
                require('./summarize-event');
                require('./debug-shims');
                require('./index');
            });
        } finally {
            process.env = realEnv;
        }
    });

    it('shares state across jest.resetModules', () => {
        const sink = createMemorySink({ install: false });
        runtime.resetLoggerForTests({ level: 'TRACE', sinks: [sink] });
        let fresh;
        jest.isolateModules(() => {
            fresh = require('./logger');
        });
        fresh.getLogger('integration.fresh').info('from a fresh registry');
        expect(sink.records.map((r) => r.message)).toEqual(['from a fresh registry']);
    });
});
