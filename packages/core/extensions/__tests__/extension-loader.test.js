const { loadExtensions, validateExtension } = require('../extension-loader');

describe('Extension Loader', () => {
    describe('validateExtension', () => {
        it('should accept a valid extension with all fields', () => {
            const ext = {
                name: 'test-ext',
                schema: '/path/to/schema.prisma',
                encryption: {
                    MyModel: { fields: ['secretField'] },
                },
                routes: {
                    path: '/api/admin/test',
                    handler: () => {},
                },
                bootstrap: () => {},
            };

            const { valid, errors } = validateExtension(ext, 0);
            expect(valid).toBe(true);
            expect(errors).toHaveLength(0);
        });

        it('should accept a minimal extension with only name', () => {
            const { valid } = validateExtension({ name: 'minimal' }, 0);
            expect(valid).toBe(true);
        });

        it('should reject non-object extension', () => {
            const { valid, errors } = validateExtension('not-an-object', 0);
            expect(valid).toBe(false);
            expect(errors[0]).toContain('must be an object');
        });

        it('should reject extension without name', () => {
            const { valid, errors } = validateExtension({}, 0);
            expect(valid).toBe(false);
            expect(errors[0]).toContain('name');
        });

        it('should reject schema not ending in .prisma', () => {
            const { valid, errors } = validateExtension(
                { name: 'test', schema: '/path/to/schema.sql' },
                0
            );
            expect(valid).toBe(false);
            expect(errors[0]).toContain('.prisma');
        });

        it('should reject encryption without fields array', () => {
            const { valid, errors } = validateExtension(
                {
                    name: 'test',
                    encryption: { MyModel: { fields: 'not-an-array' } },
                },
                0
            );
            expect(valid).toBe(false);
            expect(errors[0]).toContain('fields');
        });

        it('should reject routes without path', () => {
            const { valid, errors } = validateExtension(
                {
                    name: 'test',
                    routes: { handler: () => {} },
                },
                0
            );
            expect(valid).toBe(false);
            expect(errors[0]).toContain('path');
        });

        it('should reject routes without handler', () => {
            const { valid, errors } = validateExtension(
                {
                    name: 'test',
                    routes: { path: '/api/test' },
                },
                0
            );
            expect(valid).toBe(false);
            expect(errors[0]).toContain('handler');
        });

        it('should reject bootstrap that is not a function or string', () => {
            const { valid, errors } = validateExtension(
                { name: 'test', bootstrap: 42 },
                0
            );
            expect(valid).toBe(false);
            expect(errors[0]).toContain('bootstrap');
        });
    });

    describe('loadExtensions', () => {
        it('should return empty array when no appDefinition', () => {
            expect(loadExtensions(null)).toEqual([]);
            expect(loadExtensions(undefined)).toEqual([]);
        });

        it('should return empty array when no extensions property', () => {
            expect(loadExtensions({})).toEqual([]);
            expect(loadExtensions({ name: 'my-app' })).toEqual([]);
        });

        it('should return empty array for empty extensions array', () => {
            expect(loadExtensions({ extensions: [] })).toEqual([]);
        });

        it('should throw for non-array extensions', () => {
            expect(() => loadExtensions({ extensions: 'bad' })).toThrow(
                'must be an array'
            );
        });

        it('should normalize a valid extension', () => {
            const bootstrapFn = jest.fn();
            const handlerFn = jest.fn();

            const result = loadExtensions({
                extensions: [
                    {
                        name: 'db-credentials',
                        schema: '/path/to/schema.prisma',
                        encryption: {
                            OAuthAppCredential: {
                                fields: ['clientSecret'],
                            },
                        },
                        routes: {
                            path: '/api/admin/oauth-credentials',
                            handler: handlerFn,
                        },
                        bootstrap: bootstrapFn,
                    },
                ],
            });

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('db-credentials');
            expect(result[0].schema).toBe('/path/to/schema.prisma');
            expect(result[0].encryption).toEqual({
                OAuthAppCredential: { fields: ['clientSecret'] },
            });
            expect(result[0].routes.path).toBe(
                '/api/admin/oauth-credentials'
            );
            expect(result[0].routes.handler).toBe(handlerFn);
            expect(result[0].bootstrap).toBe(bootstrapFn);
        });

        it('should normalize extension with null optional fields', () => {
            const result = loadExtensions({
                extensions: [{ name: 'minimal-ext' }],
            });

            expect(result).toHaveLength(1);
            expect(result[0].schema).toBeNull();
            expect(result[0].encryption).toBeNull();
            expect(result[0].routes).toBeNull();
            expect(result[0].bootstrap).toBeNull();
        });

        it('should throw on validation errors with all errors listed', () => {
            expect(() =>
                loadExtensions({
                    extensions: [
                        {}, // missing name
                        { name: 'ok', schema: 'bad.sql' }, // bad schema
                    ],
                })
            ).toThrow('Invalid extension configuration');
        });

        it('should load multiple extensions', () => {
            const result = loadExtensions({
                extensions: [
                    { name: 'ext-a' },
                    { name: 'ext-b', schema: '/a/b.prisma' },
                ],
            });
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('ext-a');
            expect(result[1].name).toBe('ext-b');
        });
    });
});
