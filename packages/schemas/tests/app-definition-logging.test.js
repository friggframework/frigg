const { validateAppDefinition } = require('../index');
const appDefinitionSchema = require('../schemas/app-definition.schema.json');

const baseDefinition = {
    name: 'test-app',
    provider: 'aws',
    integrations: [],
};

const validate = (logging) =>
    validateAppDefinition({ ...baseDefinition, logging });

describe('app-definition schema: logging (ADR-048)', () => {
    describe('level', () => {
        it.each(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])(
            'accepts "%s" in lower and upper case',
            (level) => {
                expect(validate({ level }).valid).toBe(true);
                expect(validate({ level: level.toUpperCase() }).valid).toBe(
                    true
                );
            }
        );

        it.each(['Info', 'wARN', 'verbose', ''])('rejects "%s"', (level) => {
            expect(validate({ level }).valid).toBe(false);
        });
    });

    describe('retentionInDays', () => {
        it.each([1, 30, 1096, 3653])('accepts %p', (retentionInDays) => {
            expect(validate({ retentionInDays }).valid).toBe(true);
        });

        it.each([0, 10, 4000, 30.5, '30'])(
            'rejects %p, which CloudWatch does not accept',
            (retentionInDays) => {
                expect(validate({ retentionInDays }).valid).toBe(false);
            }
        );
    });

    describe('format', () => {
        it('accepts json', () => {
            expect(validate({ format: 'json' }).valid).toBe(true);
        });

        it.each(['text', 'combined'])('rejects "%s"', (format) => {
            expect(validate({ format }).valid).toBe(false);
        });
    });

    it('rejects unknown keys', () => {
        expect(validate({ sinks: [] }).valid).toBe(false);
    });

    it('keeps the schema example valid and uses the frigg init default', () => {
        const [example] = appDefinitionSchema.examples;

        expect(example.logging).toEqual({ level: 'info', retentionInDays: 30 });
        expect(validateAppDefinition(example).valid).toBe(true);
    });
});
