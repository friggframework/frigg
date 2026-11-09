function loadLogger(level) {
    const previous = process.env.FRIGG_LOG_LEVEL;
    if (level === undefined) delete process.env.FRIGG_LOG_LEVEL;
    else process.env.FRIGG_LOG_LEVEL = level;
    let logger;
    jest.isolateModules(() => {
        ({ logger } = require('./logger'));
    });
    if (previous === undefined) delete process.env.FRIGG_LOG_LEVEL;
    else process.env.FRIGG_LOG_LEVEL = previous;
    return logger;
}

function writes(logger) {
    const spies = {
        log: jest.spyOn(console, 'log').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        error: jest.spyOn(console, 'error').mockImplementation(),
    };
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    const out = {
        debug: spies.log.mock.calls.some(([tag]) => tag === '[Frigg Debug]'),
        info: spies.log.mock.calls.some(([tag]) => tag === '[Frigg]'),
        warn: spies.warn.mock.calls.length > 0,
        error: spies.error.mock.calls.length > 0,
    };
    Object.values(spies).forEach((spy) => spy.mockRestore());
    return out;
}

describe('EncryptionLogger FRIGG_LOG_LEVEL', () => {
    it.each(['TRACE', 'trace', ' Trace '])('%s shows debug output', (level) => {
        expect(writes(loadLogger(level))).toEqual({
            debug: true,
            info: true,
            warn: true,
            error: true,
        });
    });

    it.each(['FATAL', 'fatal'])('%s shows only errors', (level) => {
        expect(writes(loadLogger(level))).toEqual({
            debug: false,
            info: false,
            warn: false,
            error: true,
        });
    });

    it('keeps INFO as the default and for unknown values', () => {
        const expected = { debug: false, info: true, warn: true, error: true };
        expect(writes(loadLogger(undefined))).toEqual(expected);
        expect(writes(loadLogger('LOUD'))).toEqual(expected);
    });

    it('still honours DEBUG and WARN', () => {
        expect(writes(loadLogger('debug')).debug).toBe(true);
        expect(writes(loadLogger('WARN'))).toEqual({
            debug: false,
            info: false,
            warn: true,
            error: true,
        });
    });
});
