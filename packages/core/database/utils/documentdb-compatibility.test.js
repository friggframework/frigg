const { removeUndefinedValues, isDocumentDB } = require('./documentdb-compatibility');

describe('DocumentDB Compatibility Utils', () => {
    describe('removeUndefinedValues', () => {
        it('should remove undefined values from flat object', () => {
            const input = {
                field1: 'value1',
                field2: undefined,
                field3: 'value3',
            };

            const result = removeUndefinedValues(input);

            expect(result).toEqual({
                field1: 'value1',
                field3: 'value3',
            });
            expect(result.field2).toBeUndefined();
        });

        it('should remove undefined values from nested objects', () => {
            const input = {
                data: {
                    access_token: 'token123',
                    refresh_token: undefined,
                    domain: 'example.com',
                },
            };

            const result = removeUndefinedValues(input);

            expect(result).toEqual({
                data: {
                    access_token: 'token123',
                    domain: 'example.com',
                },
            });
        });

        it('should keep null values', () => {
            const input = {
                field1: 'value',
                field2: null,
                field3: undefined,
            };

            const result = removeUndefinedValues(input);

            expect(result).toEqual({
                field1: 'value',
                field2: null,
            });
        });

        it('should keep empty strings', () => {
            const input = {
                field1: '',
                field2: undefined,
            };

            const result = removeUndefinedValues(input);

            expect(result).toEqual({
                field1: '',
            });
        });

        it('should handle arrays without modification', () => {
            const input = {
                tags: ['tag1', 'tag2'],
                field: undefined,
            };

            const result = removeUndefinedValues(input);

            expect(result).toEqual({
                tags: ['tag1', 'tag2'],
            });
        });

        it('should handle deeply nested objects', () => {
            const input = {
                level1: {
                    level2: {
                        level3: {
                            value: 'deep',
                            undefined: undefined,
                        },
                        also_undefined: undefined,
                    },
                },
            };

            const result = removeUndefinedValues(input);

            expect(result).toEqual({
                level1: {
                    level2: {
                        level3: {
                            value: 'deep',
                        },
                    },
                },
            });
        });

        it('should return non-objects unchanged', () => {
            expect(removeUndefinedValues('string')).toBe('string');
            expect(removeUndefinedValues(123)).toBe(123);
            expect(removeUndefinedValues(null)).toBe(null);
            expect(removeUndefinedValues(undefined)).toBe(undefined);
        });
    });

    describe('isDocumentDB', () => {
        let originalEnv;

        beforeEach(() => {
            originalEnv = { ...process.env };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('should detect DocumentDB from DATABASE_URL', () => {
            process.env.DATABASE_URL = 'mongodb://host.docdb.amazonaws.com:27017/db';
            delete process.env.MONGO_URI;

            expect(isDocumentDB()).toBe(true);
        });

        it('should detect DocumentDB from MONGO_URI', () => {
            delete process.env.DATABASE_URL;
            process.env.MONGO_URI = 'mongodb://host.cluster-xxx.eu-central-1.docdb.amazonaws.com:27017/db';

            expect(isDocumentDB()).toBe(true);
        });

        it('should detect regular MongoDB', () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/db';
            delete process.env.MONGO_URI;

            expect(isDocumentDB()).toBe(false);
        });

        it('should detect MongoDB Atlas', () => {
            process.env.DATABASE_URL = 'mongodb+srv://cluster.mongodb.net/db';
            delete process.env.MONGO_URI;

            expect(isDocumentDB()).toBe(false);
        });

        it('should handle missing env vars', () => {
            delete process.env.DATABASE_URL;
            delete process.env.MONGO_URI;

            expect(isDocumentDB()).toBe(false);
        });
    });
});

