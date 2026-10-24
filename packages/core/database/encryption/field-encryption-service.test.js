const { FieldEncryptionService } = require('./field-encryption-service');

const MOCK_KEY_ID = Buffer.from('mock-key-id').toString('base64');
const MOCK_IV = 'aabbccddeeff00112233445566778899';
const MOCK_ENC_KEY = Buffer.from('mock-encrypted-data-key').toString('base64');
const enc = (plaintext) =>
    `${MOCK_KEY_ID}:${MOCK_IV}:${Buffer.from(plaintext).toString(
        'base64'
    )}:${MOCK_ENC_KEY}`;
// Values are JSON-encoded before encryption, strings included.
const encValue = (value) => enc(JSON.stringify(value));

describe('FieldEncryptionService', () => {
    let mockCryptor;
    let mockSchema;
    let service;

    beforeEach(() => {
        // Mock Cryptor emitting the real envelope shape
        // (keyId:iv:ciphertext:encryptedKey) with the plaintext as base64
        // ciphertext; only such envelopes are treated as encrypted.
        mockCryptor = {
            encrypt: jest.fn().mockImplementation((value) => enc(value)),
            decrypt: jest.fn().mockImplementation((value) => {
                const parts = value.split(':');
                if (parts.length !== 4 || parts[0] !== MOCK_KEY_ID) {
                    throw new Error('Invalid encrypted format');
                }
                return Buffer.from(parts[2], 'base64').toString();
            }),
        };

        // Mock Schema Registry
        mockSchema = {
            getEncryptedFields: jest.fn().mockImplementation((modelName) => {
                const schemas = {
                    Credential: ['data.access_token', 'data.refresh_token'],
                    User: ['hashword'],
                    IntegrationMapping: ['mapping'],
                    EmptyModel: [],
                };
                return schemas[modelName] || [];
            }),
        };

        service = new FieldEncryptionService({
            cryptor: mockCryptor,
            schema: mockSchema,
        });
    });

    describe('constructor', () => {
        it('should throw if cryptor not provided', () => {
            expect(() => {
                new FieldEncryptionService({ schema: mockSchema });
            }).toThrow('Cryptor instance required');
        });

        it('should throw if schema not provided', () => {
            expect(() => {
                new FieldEncryptionService({ cryptor: mockCryptor });
            }).toThrow('Schema with getEncryptedFields method required');
        });

        it('should throw if schema missing getEncryptedFields', () => {
            expect(() => {
                new FieldEncryptionService({
                    cryptor: mockCryptor,
                    schema: {},
                });
            }).toThrow('Schema with getEncryptedFields method required');
        });

        it('should create instance with valid params', () => {
            expect(service).toBeInstanceOf(FieldEncryptionService);
            expect(service.cryptor).toBe(mockCryptor);
            expect(service.schema).toBe(mockSchema);
        });
    });

    describe('encryptFields', () => {
        it('should encrypt nested JSON fields', async () => {
            const document = {
                id: '123',
                data: {
                    access_token: 'secret123',
                    refresh_token: 'refresh456',
                    other: 'public',
                },
            };

            const result = await service.encryptFields('Credential', document);

            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('secret123'));
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('refresh456'));
            expect(result.data.access_token).toBe(
                encValue('secret123')
            );
            expect(result.data.refresh_token).toBe(
                encValue('refresh456')
            );
            expect(result.data.other).toBe('public'); // Not encrypted
        });

        it('should encrypt top-level fields', async () => {
            const document = {
                id: '123',
                hashword: 'password_hash',
            };

            const result = await service.encryptFields('User', document);

            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('password_hash'));
            expect(result.hashword).toBe(
                encValue('password_hash')
            );
            expect(result.id).toBe('123'); // Not encrypted
        });

        it('should handle models without encrypted fields', async () => {
            const document = { id: '123', state: 'some_state' };

            const result = await service.encryptFields('EmptyModel', document);

            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
            expect(result).toEqual(document);
        });

        it('should skip null values', async () => {
            const document = {
                data: {
                    access_token: null,
                    refresh_token: 'valid',
                },
            };

            await service.encryptFields('Credential', document);

            expect(mockCryptor.encrypt).toHaveBeenCalledTimes(1);
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('valid'));
        });

        it('should skip undefined values', async () => {
            const document = {
                data: {
                    access_token: undefined,
                    refresh_token: 'valid',
                },
            };

            await service.encryptFields('Credential', document);

            expect(mockCryptor.encrypt).toHaveBeenCalledTimes(1);
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('valid'));
        });

        it('should skip empty strings', async () => {
            const document = {
                data: {
                    access_token: '',
                    refresh_token: 'valid',
                },
            };

            await service.encryptFields('Credential', document);

            expect(mockCryptor.encrypt).toHaveBeenCalledTimes(1);
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('valid'));
        });

        it('should skip already encrypted values', async () => {
            const document = {
                data: {
                    access_token: enc('already'),
                    refresh_token: 'plain',
                },
            };

            await service.encryptFields('Credential', document);

            expect(mockCryptor.encrypt).toHaveBeenCalledTimes(1);
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify('plain'));
        });

        it('should not mutate original document', async () => {
            const document = {
                data: { access_token: 'secret' },
            };
            const original = JSON.parse(JSON.stringify(document));

            await service.encryptFields('Credential', document);

            expect(document).toEqual(original);
        });

        it('should properly encrypt object/JSON values (IntegrationMapping.mapping)', async () => {
            // This test demonstrates the bug: objects are converted to "[object Object]"
            // Expected behavior: object should be JSON.stringify'd before encryption
            const mappingObject = {
                action: 'upload',
                formData: {
                    container: 'project_123',
                    folderId: '456',
                    attachments: ['att-1', 'att-2'],
                },
                taskId: 'task-789',
                status: 'pending',
            };

            const document = {
                id: 1,
                integrationId: 1,
                sourceId: 'task-789',
                mapping: mappingObject,
            };

            const encrypted = await service.encryptFields('IntegrationMapping', document);

            // The cryptor should receive JSON string, not "[object Object]"
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(
                JSON.stringify(mappingObject)
            );

            // The encrypted value should be the JSON string encrypted
            expect(encrypted.mapping).toBe(
                encValue(mappingObject)
            );

            // Now decrypt and verify object is restored
            const decrypted = await service.decryptFields('IntegrationMapping', encrypted);

            // After decryption, the object should be fully restored
            expect(decrypted.mapping).toEqual(mappingObject);
            expect(decrypted.mapping.action).toBe('upload');
            expect(decrypted.mapping.formData.attachments).toEqual(['att-1', 'att-2']);
        });

        it('should throw on encryption errors', async () => {
            mockCryptor.encrypt.mockRejectedValueOnce(
                new Error('Encryption failed')
            );

            const document = {
                data: {
                    access_token: 'secret',
                    refresh_token: 'valid',
                },
            };

            await expect(
                service.encryptFields('Credential', document)
            ).rejects.toThrow('Encryption failed');
        });

        it('should return non-object values as-is', async () => {
            expect(await service.encryptFields('Credential', null)).toBeNull();
            expect(
                await service.encryptFields('Credential', undefined)
            ).toBeUndefined();
            expect(await service.encryptFields('Credential', 'string')).toBe(
                'string'
            );
            expect(await service.encryptFields('Credential', 123)).toBe(123);
        });
    });

    describe('decryptFields', () => {
        it('should decrypt nested JSON fields', async () => {
            const document = {
                id: '123',
                data: {
                    access_token: enc('secret123'),
                    refresh_token: enc('refresh456'),
                    other: 'public',
                },
            };

            const result = await service.decryptFields('Credential', document);

            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                enc('secret123')
            );
            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                enc('refresh456')
            );
            expect(result.data.access_token).toBe('secret123');
            expect(result.data.refresh_token).toBe('refresh456');
            expect(result.data.other).toBe('public'); // Not decrypted
        });

        it('should decrypt top-level fields', async () => {
            const document = {
                id: '123',
                hashword: enc('password_hash'),
            };

            const result = await service.decryptFields('User', document);

            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                enc('password_hash')
            );
            expect(result.hashword).toBe('password_hash');
        });

        it('should skip non-encrypted values', async () => {
            const document = {
                data: {
                    access_token: 'plaintext', // Not encrypted format
                    refresh_token: enc('encrypted'),
                },
            };

            await service.decryptFields('Credential', document);

            expect(mockCryptor.decrypt).toHaveBeenCalledTimes(1);
            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                enc('encrypted')
            );
        });

        it('should not mutate original document', async () => {
            const document = {
                data: { access_token: enc('secret') },
            };
            const original = JSON.parse(JSON.stringify(document));

            await service.decryptFields('Credential', document);

            expect(document).toEqual(original);
        });

        it('should throw on decryption errors', async () => {
            mockCryptor.decrypt.mockRejectedValueOnce(
                new Error('Decryption failed')
            );

            const document = {
                data: {
                    access_token: enc('secret'),
                    refresh_token: enc('valid'),
                },
            };

            await expect(
                service.decryptFields('Credential', document)
            ).rejects.toThrow('Decryption failed');
        });
    });

    describe('encryptFieldsInBulk', () => {
        it('should encrypt multiple documents', async () => {
            const documents = [
                { data: { access_token: 'secret1' } },
                { data: { access_token: 'secret2' } },
            ];

            const result = await service.encryptFieldsInBulk(
                'Credential',
                documents
            );

            expect(result).toHaveLength(2);
            expect(result[0].data.access_token).toBe(
                encValue('secret1')
            );
            expect(result[1].data.access_token).toBe(
                encValue('secret2')
            );
        });

        it('should handle empty array', async () => {
            const result = await service.encryptFieldsInBulk('Credential', []);
            expect(result).toEqual([]);
        });

        it('should return non-array values as-is', async () => {
            expect(
                await service.encryptFieldsInBulk('Credential', null)
            ).toBeNull();
            expect(
                await service.encryptFieldsInBulk('Credential', { data: {} })
            ).toEqual({ data: {} });
        });
    });

    describe('decryptFieldsInBulk', () => {
        it('should decrypt multiple documents', async () => {
            const documents = [
                { data: { access_token: enc('secret1') } },
                { data: { access_token: enc('secret2') } },
            ];

            const result = await service.decryptFieldsInBulk(
                'Credential',
                documents
            );

            expect(result).toHaveLength(2);
            expect(result[0].data.access_token).toBe('secret1');
            expect(result[1].data.access_token).toBe('secret2');
        });
    });

    describe('_isEncrypted', () => {
        it('should detect the Cryptor envelope format', () => {
            expect(service._isEncrypted(enc('data'))).toBe(true);
        });

        it('should reject non-encrypted formats', () => {
            expect(service._isEncrypted('plaintext')).toBe(false);
            expect(service._isEncrypted('one:two:three')).toBe(false);
            expect(service._isEncrypted('one:two')).toBe(false);
            // Plaintext with 3+ colons is not ciphertext
            expect(service._isEncrypted('a:b:c:d')).toBe(false);
            expect(
                service._isEncrypted('https://user:pass@example.com:8443/x')
            ).toBe(false);
            expect(
                service._isEncrypted('keyId:longer:data:with:colons:enckey')
            ).toBe(false);
            expect(service._isEncrypted(null)).toBe(false);
            expect(service._isEncrypted(undefined)).toBe(false);
            expect(service._isEncrypted(123)).toBe(false);
        });
    });

    describe('_getNestedValue', () => {
        it('should get top-level value', () => {
            const obj = { name: 'test' };
            expect(service._getNestedValue(obj, 'name')).toBe('test');
        });

        it('should get nested value', () => {
            const obj = { data: { token: 'abc' } };
            expect(service._getNestedValue(obj, 'data.token')).toBe('abc');
        });

        it('should get deeply nested value', () => {
            const obj = { level1: { level2: { level3: 'deep' } } };
            expect(service._getNestedValue(obj, 'level1.level2.level3')).toBe(
                'deep'
            );
        });

        it('should return undefined for missing path', () => {
            const obj = { data: { token: 'abc' } };
            expect(service._getNestedValue(obj, 'data.missing')).toBeUndefined();
        });

        it('should handle null/undefined gracefully', () => {
            expect(service._getNestedValue(null, 'path')).toBeUndefined();
            expect(service._getNestedValue({}, null)).toBeUndefined();
        });
    });

    describe('_setNestedValue', () => {
        it('should set top-level value', () => {
            const obj = {};
            service._setNestedValue(obj, 'name', 'test');
            expect(obj.name).toBe('test');
        });

        it('should set nested value', () => {
            const obj = {};
            service._setNestedValue(obj, 'data.token', 'abc');
            expect(obj.data.token).toBe('abc');
        });

        it('should set deeply nested value', () => {
            const obj = {};
            service._setNestedValue(obj, 'level1.level2.level3', 'deep');
            expect(obj.level1.level2.level3).toBe('deep');
        });

        it('should create intermediate objects', () => {
            const obj = { data: {} };
            service._setNestedValue(obj, 'data.nested.value', 'test');
            expect(obj.data.nested.value).toBe('test');
        });

        it('should handle null/undefined gracefully', () => {
            service._setNestedValue(null, 'path', 'value'); // Should not throw
            service._setNestedValue({}, null, 'value'); // Should not throw
        });
    });

    describe('_deepClone', () => {
        it('should clone objects', () => {
            const obj = { a: 1, b: { c: 2 } };
            const clone = service._deepClone(obj);

            expect(clone).toEqual(obj);
            expect(clone).not.toBe(obj);
            expect(clone.b).not.toBe(obj.b);
        });

        it('should clone arrays', () => {
            const arr = [1, 2, { a: 3 }];
            const clone = service._deepClone(arr);

            expect(clone).toEqual(arr);
            expect(clone).not.toBe(arr);
            expect(clone[2]).not.toBe(arr[2]);
        });

        it('should clone dates', () => {
            const date = new Date('2024-01-01');
            const clone = service._deepClone(date);

            expect(clone).toEqual(date);
            expect(clone).not.toBe(date);
        });

        it('should handle primitives', () => {
            expect(service._deepClone(null)).toBeNull();
            expect(service._deepClone(undefined)).toBeUndefined();
            expect(service._deepClone(123)).toBe(123);
            expect(service._deepClone('string')).toBe('string');
            expect(service._deepClone(true)).toBe(true);
        });
    });

    describe('write vs read field split (opt-out support)', () => {
        // Simulates a schema where IntegrationMapping has been opted out
        // of write-side encryption but is still on the decrypt-on-read list.
        const splitSchema = {
            getEncryptedFields: jest.fn().mockImplementation((modelName) => {
                if (modelName === 'IntegrationMapping') return ['mapping'];
                return [];
            }),
            getFieldsToEncryptOnWrite: jest
                .fn()
                .mockImplementation((modelName) => {
                    // Opted out — nothing to encrypt on write
                    if (modelName === 'IntegrationMapping') return [];
                    return [];
                }),
            getFieldsToDecryptOnRead: jest
                .fn()
                .mockImplementation((modelName) => {
                    // Still tries to decrypt — for legacy data
                    if (modelName === 'IntegrationMapping') return ['mapping'];
                    return [];
                }),
        };

        let splitService;

        beforeEach(() => {
            splitService = new FieldEncryptionService({
                cryptor: mockCryptor,
                schema: splitSchema,
            });
        });

        it('should NOT encrypt opted-out fields on write', async () => {
            const document = {
                id: '123',
                mapping: { crmId: 'abc', lastStatus: 'failed' },
            };

            const result = await splitService.encryptFields(
                'IntegrationMapping',
                document
            );

            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
            expect(result.mapping).toEqual({
                crmId: 'abc',
                lastStatus: 'failed',
            });
        });

        it('should still decrypt opted-out fields on read (legacy data)', async () => {
            const encryptedBlob = enc('{"crmId":"abc"}');
            const document = {
                id: '123',
                mapping: encryptedBlob,
            };

            const result = await splitService.decryptFields(
                'IntegrationMapping',
                document
            );

            expect(mockCryptor.decrypt).toHaveBeenCalledWith(encryptedBlob);
            expect(result.mapping).toEqual({ crmId: 'abc' });
        });

        it('should pass through plain JSON on read without invoking cryptor', async () => {
            const document = {
                id: '123',
                mapping: { crmId: 'abc', lastStatus: 'created' },
            };

            const result = await splitService.decryptFields(
                'IntegrationMapping',
                document
            );

            // Plain object → _isEncrypted returns false → cryptor not called
            expect(mockCryptor.decrypt).not.toHaveBeenCalled();
            expect(result.mapping).toEqual({
                crmId: 'abc',
                lastStatus: 'created',
            });
        });

        it('should fall back to getEncryptedFields when split methods missing', async () => {
            const legacySchema = {
                getEncryptedFields: jest.fn().mockReturnValue(['mapping']),
            };
            const legacyService = new FieldEncryptionService({
                cryptor: mockCryptor,
                schema: legacySchema,
            });

            const document = { mapping: { foo: 'bar' } };
            await legacyService.encryptFields('IntegrationMapping', document);

            // Backwards-compat: encrypted via getEncryptedFields
            expect(mockCryptor.encrypt).toHaveBeenCalled();
        });
    });
});
