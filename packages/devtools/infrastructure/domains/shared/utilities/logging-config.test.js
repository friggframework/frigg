const { buildLoggingProviderConfig } = require('./logging-config');

describe('buildLoggingProviderConfig (ADR-048)', () => {
    it('emits no Lambda LoggingConfig and no osls floor by default, until the Phase 0 spike passes', () => {
        const result = buildLoggingProviderConfig({ level: 'warn' });

        expect(result.provider).toBeUndefined();
        expect(result.frameworkVersion).toBeUndefined();
    });

    it('still validates the level when the LoggingConfig is off', () => {
        expect(() => buildLoggingProviderConfig({ level: 'verbose' })).toThrow(
            /logging\.level/
        );
    });

    describe('with lambdaJson', () => {
        const build = (logging) =>
            buildLoggingProviderConfig(logging, { lambdaJson: true });

        it('maps level to provider.logs.lambda and sets frameworkVersion >=3.58.0', () => {
            expect(build({ level: 'warn' })).toEqual({
                frameworkVersion: '>=3.58.0',
                provider: {
                    logs: {
                        lambda: {
                            logFormat: 'JSON',
                            applicationLogLevel: 'WARN',
                            systemLogLevel: 'INFO',
                        },
                    },
                },
            });
        });

        it.each(['info', 'INFO', 'Info', 'fatal', 'TRACE'])(
            'accepts level "%s" in any case',
            (level) => {
                expect(
                    build({ level }).provider.logs.lambda.applicationLogLevel
                ).toBe(level.toUpperCase());
            }
        );

        it('sets both level and retention together', () => {
            const result = build({ level: 'debug', retentionInDays: 14 });

            expect(result.provider.logs.lambda.applicationLogLevel).toBe('DEBUG');
            expect(result.provider.logRetentionInDays).toBe(14);
        });
    });
});
