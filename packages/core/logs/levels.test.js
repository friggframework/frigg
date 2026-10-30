const { LEVELS, LEVEL_NAMES, parseLevel, resolveLevel } = require('./levels');

describe('logs/levels', () => {
    it('ranks TRACE < DEBUG < INFO < WARN < ERROR < FATAL', () => {
        expect(LEVEL_NAMES).toEqual(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);
        const values = LEVEL_NAMES.map((name) => LEVELS[name]);
        expect([...values].sort((a, b) => a - b)).toEqual(values);
        expect(new Set(values).size).toBe(6);
        expect(Object.isFrozen(LEVELS)).toBe(true);
    });

    it.each([
        ['info', 'INFO'],
        ['  Warn ', 'WARN'],
        ['FATAL', 'FATAL'],
        ['', null],
        ['   ', null],
        ['verbose', null],
        [undefined, null],
        [null, null],
        [30, null],
    ])('parseLevel(%p) → %p', (input, expected) => {
        expect(parseLevel(input)).toBe(expected);
    });

    describe('resolveLevel', () => {
        const eventNames = (result) => result.warnings.map((w) => w.eventName);

        it('defaults to INFO', () => {
            expect(resolveLevel({})).toEqual({ level: 'INFO', warnings: [] });
            expect(resolveLevel({ STAGE: 'dev' }).level).toBe('INFO');
        });

        it('ignores case and whitespace; an empty value counts as unset', () => {
            expect(resolveLevel({ FRIGG_LOG_LEVEL: ' debug ' }).level).toBe('DEBUG');
            expect(resolveLevel({ FRIGG_LOG_LEVEL: '', STAGE: 'local' }).level).toBe('DEBUG');
            expect(resolveLevel({ FRIGG_LOG_LEVEL: '' }).warnings).toEqual([]);
        });

        it('maps an unknown value to INFO with one invalid_level warning', () => {
            const result = resolveLevel({ FRIGG_LOG_LEVEL: 'loud', STAGE: 'local' });
            expect(result.level).toBe('INFO');
            expect(eventNames(result)).toEqual(['frigg.logger.invalid_level']);
        });

        it('defaults to DEBUG under STAGE=local', () => {
            expect(resolveLevel({ STAGE: 'local' }).level).toBe('DEBUG');
        });

        it.each([
            ['true', 'DEBUG'],
            ['1', 'DEBUG'],
            ['TRUE', 'DEBUG'],
            ['false', 'INFO'],
            ['0', 'INFO'],
            ['', 'INFO'],
        ])('IS_OFFLINE=%p → %p', (value, expected) => {
            expect(resolveLevel({ STAGE: 'dev', IS_OFFLINE: value }).level).toBe(expected);
        });

        it('lets an explicit level beat the local default', () => {
            expect(resolveLevel({ STAGE: 'local', FRIGG_LOG_LEVEL: 'warn' }).level).toBe('WARN');
            expect(resolveLevel({ IS_OFFLINE: 'true', FRIGG_LOG_LEVEL: 'error' }).level).toBe('ERROR');
        });

        it.each([
            ['INFO', 'WARN', 'WARN', true],
            ['WARN', 'INFO', 'WARN', true],
            ['DEBUG', 'DEBUG', 'DEBUG', false],
            ['ERROR', 'trace', 'ERROR', true],
            [undefined, 'ERROR', 'ERROR', true],
            ['DEBUG', 'nonsense', 'DEBUG', false],
            ['DEBUG', '', 'DEBUG', false],
        ])(
            'FRIGG_LOG_LEVEL=%p with AWS_LAMBDA_LOG_LEVEL=%p → %p (conflict warning: %p)',
            (frigg, aws, expected, warns) => {
                const env = { AWS_LAMBDA_LOG_LEVEL: aws };
                if (frigg !== undefined) env.FRIGG_LOG_LEVEL = frigg;
                const result = resolveLevel(env);
                expect(result.level).toBe(expected);
                expect(eventNames(result)).toEqual(
                    warns ? ['frigg.logger.level_conflict'] : []
                );
            }
        );

        it('maps DEBUG_VERBOSE=1 to DEBUG unless FRIGG_LOG_LEVEL is set', () => {
            expect(resolveLevel({ DEBUG_VERBOSE: '1' }).level).toBe('DEBUG');
            expect(resolveLevel({ DEBUG_VERBOSE: '0' }).level).toBe('INFO');
            expect(resolveLevel({ DEBUG_VERBOSE: '1', FRIGG_LOG_LEVEL: 'warn' }).level).toBe('WARN');
        });

        it('puts no env value other than the level names into a warning', () => {
            const result = resolveLevel({ FRIGG_LOG_LEVEL: 'x'.repeat(500) });
            expect(JSON.stringify(result.warnings).length).toBeLessThan(400);
        });
    });
});
