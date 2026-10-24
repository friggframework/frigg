const { createEncryptionExtension } = require('./prisma-encryption-extension');

const MOCK_KEY_ID = Buffer.from('mock-key-id').toString('base64');
const MOCK_IV = 'aabbccddeeff00112233445566778899';
const MOCK_ENC_KEY = Buffer.from('mock-encrypted-data-key').toString('base64');
const enc = (plaintext) =>
    `${MOCK_KEY_ID}:${MOCK_IV}:${Buffer.from(plaintext).toString(
        'base64'
    )}:${MOCK_ENC_KEY}`;
// Values are JSON-encoded before encryption, strings included.
const encValue = (value) => enc(JSON.stringify(value));

describe('Prisma Encryption Extension', () => {
    let mockCryptor;
    let mockQuery;

    beforeEach(() => {
        // Mock Cryptor emitting the real envelope shape
        // (keyId:iv:ciphertext:encryptedKey), plaintext as base64 ciphertext.
        mockCryptor = {
            encrypt: jest.fn().mockImplementation((value) => enc(value)),
            decrypt: jest.fn().mockImplementation((value) => {
                const parts = value.split(':');
                return Buffer.from(parts[2], 'base64').toString();
            }),
        };

        // Mock Prisma query function
        mockQuery = jest.fn().mockImplementation((args) => args.mockResult);
    });

    describe('createEncryptionExtension', () => {
        it('should create extension with valid config', () => {
            const extension = createEncryptionExtension({
                cryptor: mockCryptor,
                enabled: true,
            });

            expect(extension).toBeDefined();
            expect(extension.name).toBe('frigg-field-encryption');
            expect(extension.query).toBeDefined();
            expect(extension.query.$allModels).toBeDefined();
        });

        it('should return no-op extension when disabled', () => {
            const extension = createEncryptionExtension({
                cryptor: mockCryptor,
                enabled: false,
            });

            // No-op extension is a function that returns its input
            const mockClient = { $extends: jest.fn() };
            const result = extension(mockClient);

            expect(result).toBe(mockClient);
        });

        it('should throw if cryptor not provided when enabled', () => {
            expect(() => {
                createEncryptionExtension({ enabled: true });
            }).toThrow('Cryptor instance required');
        });

        it('should not throw if cryptor not provided when disabled', () => {
            expect(() => {
                createEncryptionExtension({ enabled: false });
            }).not.toThrow();
        });
    });

    describe('Query Interceptors', () => {
        let extension;
        let handlers;

        beforeEach(() => {
            extension = createEncryptionExtension({
                cryptor: mockCryptor,
                enabled: true,
            });
            handlers = extension.query.$allModels;
        });

        describe('create', () => {
            it('should encrypt data before create', async () => {
                const args = {
                    data: {
                        data: { access_token: 'secret123' },
                    },
                    mockResult: {
                        id: '1',
                        data: { access_token: encValue('secret123') },
                    },
                };

                await handlers.create({
                    model: 'Credential',
                    operation: 'create',
                    args,
                    query: mockQuery,
                });

                expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('secret123'));
                expect(args.data.data.access_token).toBe(
                    encValue('secret123')
                );
            });

            it('should decrypt result after create', async () => {
                const args = {
                    data: { data: { access_token: 'secret123' } },
                    mockResult: {
                        id: '1',
                        data: { access_token: encValue('secret123') },
                    },
                };

                const result = await handlers.create({
                    model: 'Credential',
                    operation: 'create',
                    args,
                    query: mockQuery,
                });

                expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                    encValue('secret123')
                );
                expect(result.data.access_token).toBe('secret123');
            });

            it('should handle null result', async () => {
                const args = {
                    data: { data: { access_token: 'secret123' } },
                    mockResult: null,
                };

                const result = await handlers.create({
                    model: 'Credential',
                    operation: 'create',
                    args,
                    query: mockQuery,
                });

                expect(result).toBeNull();
            });
        });

        describe('createMany', () => {
            it('should encrypt array of data', async () => {
                const args = {
                    data: [
                        { data: { access_token: 'secret1' } },
                        { data: { access_token: 'secret2' } },
                    ],
                    mockResult: { count: 2 },
                };

                await handlers.createMany({
                    model: 'Credential',
                    operation: 'createMany',
                    args,
                    query: mockQuery,
                });

                expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('secret1'));
                expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('secret2'));
                expect(args.data[0].data.access_token).toBe(
                    encValue('secret1')
                );
                expect(args.data[1].data.access_token).toBe(
                    encValue('secret2')
                );
            });

            it('should handle single object in createMany', async () => {
                const args = {
                    data: { data: { access_token: 'secret' } },
                    mockResult: { count: 1 },
                };

                await handlers.createMany({
                    model: 'Credential',
                    operation: 'createMany',
                    args,
                    query: mockQuery,
                });

                expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('secret'));
            });
        });

        describe('update', () => {
            it('should encrypt update data', async () => {
                const args = {
                    data: { data: { access_token: 'newsecret' } },
                    mockResult: {
                        id: '1',
                        data: { access_token: encValue('newsecret') },
                    },
                };

                await handlers.update({
                    model: 'Credential',
                    operation: 'update',
                    args,
                    query: mockQuery,
                });

                expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('newsecret'));
            });

            it('should decrypt result after update', async () => {
                const args = {
                    data: { data: { access_token: 'newsecret' } },
                    mockResult: {
                        id: '1',
                        data: { access_token: encValue('newsecret') },
                    },
                };

                const result = await handlers.update({
                    model: 'Credential',
                    operation: 'update',
                    args,
                    query: mockQuery,
                });

                expect(result.data.access_token).toBe('newsecret');
            });
        });

        describe('upsert', () => {
            it('should encrypt both create and update data', async () => {
                const args = {
                    create: { data: { access_token: 'createsecret' } },
                    update: { data: { access_token: 'updatesecret' } },
                    mockResult: {
                        id: '1',
                        data: { access_token: encValue('createsecret') },
                    },
                };

                await handlers.upsert({
                    model: 'Credential',
                    operation: 'upsert',
                    args,
                    query: mockQuery,
                });

                expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('createsecret'));
                expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('updatesecret'));
            });
        });

        describe('findUnique', () => {
            it('should decrypt result', async () => {
                const args = {
                    where: { id: '1' },
                    mockResult: {
                        id: '1',
                        data: { access_token: encValue('secret') },
                    },
                };

                const result = await handlers.findUnique({
                    model: 'Credential',
                    operation: 'findUnique',
                    args,
                    query: mockQuery,
                });

                expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                    encValue('secret')
                );
                expect(result.data.access_token).toBe('secret');
            });

            it('should handle null result', async () => {
                const args = {
                    where: { id: '999' },
                    mockResult: null,
                };

                const result = await handlers.findUnique({
                    model: 'Credential',
                    operation: 'findUnique',
                    args,
                    query: mockQuery,
                });

                expect(result).toBeNull();
                expect(mockCryptor.decrypt).not.toHaveBeenCalled();
            });
        });

        describe('findMany', () => {
            it('should decrypt array of results', async () => {
                const args = {
                    mockResult: [
                        {
                            id: '1',
                            data: { access_token: encValue('secret1') },
                        },
                        {
                            id: '2',
                            data: { access_token: encValue('secret2') },
                        },
                    ],
                };

                const results = await handlers.findMany({
                    model: 'Credential',
                    operation: 'findMany',
                    args,
                    query: mockQuery,
                });

                expect(results).toHaveLength(2);
                expect(results[0].data.access_token).toBe('secret1');
                expect(results[1].data.access_token).toBe('secret2');
            });

            it('should handle empty array', async () => {
                const args = {
                    mockResult: [],
                };

                const results = await handlers.findMany({
                    model: 'Credential',
                    operation: 'findMany',
                    args,
                    query: mockQuery,
                });

                expect(results).toEqual([]);
            });
        });

        describe('delete', () => {
            it('should decrypt deleted record', async () => {
                const args = {
                    where: { id: '1' },
                    mockResult: {
                        id: '1',
                        data: { access_token: encValue('secret') },
                    },
                };

                const result = await handlers.delete({
                    model: 'Credential',
                    operation: 'delete',
                    args,
                    query: mockQuery,
                });

                expect(result.data.access_token).toBe('secret');
            });
        });

        describe('count', () => {
            it('should pass through without encryption', async () => {
                const args = {
                    mockResult: { count: 5 },
                };

                const result = await handlers.count({
                    model: 'Credential',
                    operation: 'count',
                    args,
                    query: mockQuery,
                });

                expect(result).toEqual({ count: 5 });
                expect(mockCryptor.encrypt).not.toHaveBeenCalled();
                expect(mockCryptor.decrypt).not.toHaveBeenCalled();
            });
        });

        describe('Model without encrypted fields', () => {
            it('should pass through State model without encryption', async () => {
                const args = {
                    data: { state: { some: 'data' } },
                    mockResult: { id: '1', state: { some: 'data' } },
                };

                const result = await handlers.create({
                    model: 'State',
                    operation: 'create',
                    args,
                    query: mockQuery,
                });

                expect(result.state).toEqual({ some: 'data' });
                expect(mockCryptor.encrypt).not.toHaveBeenCalled();
                expect(mockCryptor.decrypt).not.toHaveBeenCalled();
            });
        });
    });

    describe('Integration with FieldEncryptionService', () => {
        it('should handle nested JSON paths correctly', async () => {
            const extension = createEncryptionExtension({
                cryptor: mockCryptor,
                enabled: true,
            });
            const handlers = extension.query.$allModels;

            const args = {
                data: {
                    id: '123',
                    data: {
                        access_token: 'secret',
                        refresh_token: 'refresh',
                        other: 'public',
                    },
                },
                mockResult: {
                    id: '123',
                    data: {
                        access_token: encValue('secret'),
                        refresh_token: encValue('refresh'),
                        other: 'public',
                    },
                },
            };

            const result = await handlers.create({
                model: 'Credential',
                operation: 'create',
                args,
                query: mockQuery,
            });

            // Verify encryption was called for encrypted fields
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('secret'));
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('refresh'));
            // 'other' should not be encrypted

            // Verify decryption in result
            expect(result.data.access_token).toBe('secret');
            expect(result.data.refresh_token).toBe('refresh');
            expect(result.data.other).toBe('public');
        });
    });
});
