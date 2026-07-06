const {
    validateScriptInput,
    validateParams,
    validateType,
} = require('../validate-script-input');
const { ScriptFactory } = require('../script-factory');
const { AdminScriptBase } = require('../admin-script-base');

describe('validateScriptInput', () => {
    let scriptFactory;

    class TestScript extends AdminScriptBase {
        static Definition = {
            name: 'test-script',
            version: '1.0.0',
            description: 'Test script',
            config: {
                requireIntegrationInstance: false,
            },
        };

        async execute(params) {
            return { success: true, params };
        }
    }

    class SchemaScript extends AdminScriptBase {
        static Definition = {
            name: 'schema-script',
            version: '1.0.0',
            description: 'Script with schema',
            inputSchema: {
                type: 'object',
                required: ['requiredParam'],
                properties: {
                    requiredParam: { type: 'string' },
                    optionalParam: { type: 'number' },
                },
            },
        };

        async execute() {
            return {};
        }
    }

    class TypedScript extends AdminScriptBase {
        static Definition = {
            name: 'typed-script',
            version: '1.0.0',
            description: 'Script with typed params',
            inputSchema: {
                type: 'object',
                properties: {
                    count: { type: 'integer' },
                    name: { type: 'string' },
                    enabled: { type: 'boolean' },
                },
            },
        };

        async execute() {
            return {};
        }
    }

    beforeEach(() => {
        scriptFactory = new ScriptFactory([
            TestScript,
            SchemaScript,
            TypedScript,
        ]);
    });

    describe('validateScriptInput()', () => {
        it('should return VALID for script without schema', () => {
            const result = validateScriptInput(scriptFactory, 'test-script', {
                foo: 'bar',
            });

            expect(result.status).toBe('VALID');
            expect(result.scriptName).toBe('test-script');
            expect(result.preview.script.name).toBe('test-script');
            expect(result.preview.script.version).toBe('1.0.0');
            expect(result.preview.input).toEqual({ foo: 'bar' });
            expect(result.message).toContain('Validation passed');
        });

        it('should return INVALID when required parameters are missing', () => {
            const result = validateScriptInput(
                scriptFactory,
                'schema-script',
                {}
            );

            expect(result.status).toBe('INVALID');
            expect(result.preview.validation.valid).toBe(false);
            expect(result.preview.validation.errors).toContain(
                'Missing required parameter: requiredParam'
            );
        });

        it('should return INVALID for wrong parameter types', () => {
            const result = validateScriptInput(scriptFactory, 'typed-script', {
                count: 'not-a-number',
                name: 123,
                enabled: 'true',
            });

            expect(result.status).toBe('INVALID');
            expect(result.preview.validation.errors).toHaveLength(3);
        });

        it('should return VALID with correct parameters', () => {
            const result = validateScriptInput(scriptFactory, 'schema-script', {
                requiredParam: 'hello',
                optionalParam: 42,
            });

            expect(result.status).toBe('VALID');
            expect(result.preview.validation.valid).toBe(true);
            expect(result.preview.validation.errors).toHaveLength(0);
        });

        it('should include inputSchema in preview', () => {
            const result = validateScriptInput(scriptFactory, 'schema-script', {
                requiredParam: 'test',
            });

            expect(result.preview.inputSchema).toEqual({
                type: 'object',
                required: ['requiredParam'],
                properties: {
                    requiredParam: { type: 'string' },
                    optionalParam: { type: 'number' },
                },
            });
        });

        it('should return null inputSchema when script has no schema', () => {
            const result = validateScriptInput(
                scriptFactory,
                'test-script',
                {}
            );

            expect(result.preview.inputSchema).toBeNull();
        });
    });

    describe('validateParams()', () => {
        it('should return valid when no schema defined', () => {
            const result = validateParams(
                { name: 'test' },
                { anything: 'goes' }
            );

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should check required fields', () => {
            const definition = {
                inputSchema: {
                    type: 'object',
                    required: ['a', 'b'],
                    properties: {
                        a: { type: 'string' },
                        b: { type: 'string' },
                    },
                },
            };

            const result = validateParams(definition, { a: 'yes' });

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Missing required parameter: b');
        });
    });

    describe('validateType()', () => {
        it('should validate integer type', () => {
            expect(validateType('x', 42, { type: 'integer' })).toBeNull();
            expect(validateType('x', 3.14, { type: 'integer' })).toContain(
                'must be an integer'
            );
            expect(validateType('x', 'foo', { type: 'integer' })).toContain(
                'must be an integer'
            );
        });

        it('should validate number type', () => {
            expect(validateType('x', 3.14, { type: 'number' })).toBeNull();
            expect(validateType('x', 42, { type: 'number' })).toBeNull();
            expect(validateType('x', 'foo', { type: 'number' })).toContain(
                'must be a number'
            );
        });

        it('should validate string type', () => {
            expect(validateType('x', 'hello', { type: 'string' })).toBeNull();
            expect(validateType('x', 123, { type: 'string' })).toContain(
                'must be a string'
            );
        });

        it('should validate boolean type', () => {
            expect(validateType('x', true, { type: 'boolean' })).toBeNull();
            expect(validateType('x', 'true', { type: 'boolean' })).toContain(
                'must be a boolean'
            );
        });

        it('should validate array type', () => {
            expect(validateType('x', [1, 2], { type: 'array' })).toBeNull();
            expect(validateType('x', 'not-array', { type: 'array' })).toContain(
                'must be an array'
            );
        });

        it('should validate object type', () => {
            expect(validateType('x', { a: 1 }, { type: 'object' })).toBeNull();
            expect(validateType('x', [1, 2], { type: 'object' })).toContain(
                'must be an object'
            );
            expect(validateType('x', 'string', { type: 'object' })).toContain(
                'must be an object'
            );
        });

        it('should return null when no type specified', () => {
            expect(validateType('x', 'anything', {})).toBeNull();
        });
    });
});
