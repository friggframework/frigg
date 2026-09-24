const { getLogger, Logger } = require('./logger');
const { createMemorySink } = require('./sinks');
const { resetLoggerForTests, takeViolationsForTests } = require('./logger-runtime');
const { LEVEL_NAMES, LEVELS } = require('./levels');
const { runInContext } = require('./context');

describe('logs/logger', () => {
    let sink;

    const useLevel = (level) => {
        sink = createMemorySink({ install: false });
        resetLoggerForTests({ level, sinks: [sink] });
    };

    beforeEach(() => useLevel('TRACE'));

    describe('threshold', () => {
        const table = LEVEL_NAMES.flatMap((threshold) =>
            LEVEL_NAMES.map((call) => [threshold, call, LEVELS[call] >= LEVELS[threshold]])
        );

        it.each(table)('threshold %s, call %s → written: %p', (threshold, call, written) => {
            useLevel(threshold);
            const log = getLogger('integration.test');
            log[call.toLowerCase()]('hello');
            expect(sink.records).toHaveLength(written ? 1 : 0);
            expect(log.isLevelEnabled(call)).toBe(written);
            if (written) expect(sink.records[0].level).toBe(call);
        });
    });

    it('isLevelEnabled accepts any case and returns false for unknown levels', () => {
        useLevel('INFO');
        const log = getLogger('integration.test');
        expect(log.isLevelEnabled('warn')).toBe(true);
        expect(log.isLevelEnabled('Info')).toBe(true);
        expect(log.isLevelEnabled('debug')).toBe(false);
        expect(log.isLevelEnabled('verbose')).toBe(false);
        expect(log.isLevelEnabled(undefined)).toBe(false);
    });

    it('never touches the fields of a disabled level', () => {
        useLevel('INFO');
        const getter = jest.fn(() => 'x');
        const fields = {};
        Object.defineProperty(fields, 'expensive', { get: getter, enumerable: true });
        getLogger('integration.test').debug('skipped', fields);
        expect(getter).not.toHaveBeenCalled();
        expect(sink.records).toHaveLength(0);
    });

    it('exposes the six level methods, child, isLevelEnabled and name', () => {
        const log = getLogger('frigg.area');
        for (const method of ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'child', 'isLevelEnabled']) {
            expect(typeof log[method]).toBe('function');
        }
        expect(log.name).toBe('frigg.area');
        expect(log).toBeInstanceOf(Logger);
    });

    it('memoizes loggers per name and defaults the name', () => {
        expect(getLogger('frigg.a')).toBe(getLogger('frigg.a'));
        expect(getLogger().name).toBe('frigg.unknown');
        expect(getLogger('').name).toBe('frigg.unknown');
    });

    it('a module-scope logger writes to the sink installed after a reset', () => {
        const log = getLogger('integration.early');
        const later = createMemorySink({ install: false });
        resetLoggerForTests({ level: 'TRACE', sinks: [later] });
        log.info('after reset');
        expect(later.records).toHaveLength(1);
        expect(sink.records).toHaveLength(0);
    });

    it('never throws, even with a throwing sink, a hostile message or hostile fields', () => {
        const bad = { name: 'bad', write: () => { throw new Error('boom'); } };
        resetLoggerForTests({ level: 'TRACE', sinks: [bad, sink] });
        const hostile = new Proxy({}, { ownKeys: () => { throw new Error('keys'); } });
        const log = getLogger('integration.test');
        expect(() => log.info('ok', hostile)).not.toThrow();
        expect(() => log.info(hostile)).not.toThrow();
        expect(() => log.info(Symbol('s'))).not.toThrow();
        expect(sink.records.length).toBeGreaterThanOrEqual(1);
    });

    it('drops a record that a sink writes back through the logger', () => {
        const reentrant = {
            name: 'reentrant',
            write: jest.fn(() => getLogger('integration.inner').info('nested')),
        };
        resetLoggerForTests({ level: 'TRACE', sinks: [reentrant, sink] });
        getLogger('integration.outer').info('outer');
        expect(reentrant.write).toHaveBeenCalledTimes(1);
        expect(sink.records.map((r) => r.message)).toEqual(['outer']);
    });

    describe('child', () => {
        it('copies static bindings at child() time', () => {
            const bindings = { processId: 'p-1' };
            const log = getLogger('integration.test').child(bindings);
            bindings.processId = 'p-2';
            log.info('x');
            expect(sink.records[0].processId).toBe('p-1');
        });

        it('evaluates function bindings per record', () => {
            let id = 'a';
            const log = getLogger('integration.test').child(() => ({ integrationId: id }));
            log.info('one');
            id = 'b';
            log.info('two');
            expect(sink.records.map((r) => r.integrationId)).toEqual(['a', 'b']);
        });

        it('drops only the bindings when a binding function throws', () => {
            const log = getLogger('integration.test').child(() => {
                throw new Error('binding');
            });
            log.info('still written', { externalId: '901' });
            expect(sink.records).toHaveLength(1);
            expect(sink.records[0].externalId).toBe('901');
        });

        it('lets grandchild bindings beat child and parent bindings', () => {
            const log = getLogger('integration.test')
                .child({ a: 'parent', b: 'parent', c: 'parent' })
                .child({ b: 'child', c: 'child' })
                .child(() => ({ c: 'grandchild' }));
            log.info('x');
            expect(sink.records[0]).toMatchObject({ a: 'parent', b: 'child', c: 'grandchild' });
            expect(sink.records[0].droppedKeys).toBeUndefined();
        });

        it('keeps the logger name and drops a logger binding', () => {
            const log = getLogger('integration.test').child({ logger: 'other' });
            expect(log.name).toBe('integration.test');
            log.info('x');
            expect(sink.records[0].logger).toBe('integration.test');
            expect(sink.records[0].droppedKeys).toEqual(['logger']);
        });
    });

    describe('scope', () => {
        it('adds the ambient scope and lets it beat bindings and call-site fields', () => {
            runInContext({ integrationId: 'i-scope', log: { requestId: 'r-scope' } }, () => {
                getLogger('integration.test')
                    .child({ integrationId: 'i-child' })
                    .info('x', { requestId: 'r-call' });
            });
            expect(sink.records[0]).toMatchObject({
                integrationId: 'i-scope',
                requestId: 'r-scope',
            });
            expect(sink.records[0].droppedKeys).toEqual(['integrationId', 'requestId']);
        });
    });

    describe('violations', () => {
        it('records a frigg.* WARN+ without eventName and still writes it', () => {
            getLogger('frigg.area').warn('no event name');
            getLogger('frigg.area').error('named', { eventName: 'frigg.area.failed' });
            expect(sink.records).toHaveLength(2);
            expect(takeViolationsForTests()).toEqual([
                { logger: 'frigg.area', level: 'WARN', message: 'no event name' },
            ]);
            expect(takeViolationsForTests()).toEqual([]);
        });

        it('does not record integration.* or frigg.* INFO', () => {
            getLogger('integration.hubspot').error('fine');
            getLogger('frigg.area').info('fine');
            expect(takeViolationsForTests()).toEqual([]);
        });

        it('accepts an eventName that comes from a binding', () => {
            getLogger('frigg.area').child({ eventName: 'frigg.area.x' }).warn('bound');
            expect(takeViolationsForTests()).toEqual([]);
        });
    });
});
