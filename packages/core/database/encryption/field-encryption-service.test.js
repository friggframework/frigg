const {
    FieldEncryptionService,
    FieldDecryptionError,
} = require('./field-encryption-service');
const { fakeCiphertext, fakePlaintext } = require('./test-support/fake-ciphertext');

describe('FieldEncryptionService', () => {
    let mockCryptor;
    let mockSchema;
    let service;

    beforeEach(() => {
        // Mock Cryptor
        mockCryptor = {
            encrypt: jest.fn().mockImplementation((value) => fakeCiphertext(value)),
            decrypt: jest.fn().mockImplementation((value) => fakePlaintext(value)),
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

            expect(mockCryptor.encrypt).toHaveBeenCalledWith('secret123');
            expect(mockCryptor.encrypt).toHaveBeenCalledWith('refresh456');
            expect(result.data.access_token).toBe(
                fakeCiphertext('secret123')
            );
            expect(result.data.refresh_token).toBe(
                fakeCiphertext('refresh456')
            );
            expect(result.data.other).toBe('public'); // Not encrypted
        });

        it('should encrypt top-level fields', async () => {
            const document = {
                id: '123',
                hashword: 'password_hash',
            };

            const result = await service.encryptFields('User', document);

            expect(mockCryptor.encrypt).toHaveBeenCalledWith('password_hash');
            expect(result.hashword).toBe(
                fakeCiphertext('password_hash')
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
            expect(mockCryptor.encrypt).toHaveBeenCalledWith('valid');
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
            expect(mockCryptor.encrypt).toHaveBeenCalledWith('valid');
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
            expect(mockCryptor.encrypt).toHaveBeenCalledWith('valid');
        });

        it('should skip already encrypted values', async () => {
            const document = {
                data: {
                    access_token: fakeCiphertext('already'),
                    refresh_token: 'plain',
                },
            };

            await service.encryptFields('Credential', document);

            expect(mockCryptor.encrypt).toHaveBeenCalledTimes(1);
            expect(mockCryptor.encrypt).toHaveBeenCalledWith('plain');
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
                fakeCiphertext(JSON.stringify(mappingObject))
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
                    access_token: fakeCiphertext('secret123'),
                    refresh_token: fakeCiphertext('refresh456'),
                    other: 'public',
                },
            };

            const result = await service.decryptFields('Credential', document);

            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                fakeCiphertext('secret123')
            );
            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                fakeCiphertext('refresh456')
            );
            expect(result.data.access_token).toBe('secret123');
            expect(result.data.refresh_token).toBe('refresh456');
            expect(result.data.other).toBe('public'); // Not decrypted
        });

        it('should decrypt top-level fields', async () => {
            const document = {
                id: '123',
                hashword: fakeCiphertext('password_hash'),
            };

            const result = await service.decryptFields('User', document);

            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                fakeCiphertext('password_hash')
            );
            expect(result.hashword).toBe('password_hash');
        });

        it('should skip non-encrypted values', async () => {
            const document = {
                data: {
                    access_token: 'plaintext', // Not encrypted format
                    refresh_token: fakeCiphertext('encrypted'),
                },
            };

            await service.decryptFields('Credential', document);

            expect(mockCryptor.decrypt).toHaveBeenCalledTimes(1);
            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                fakeCiphertext('encrypted')
            );
        });

        it('should not mutate original document', async () => {
            const document = {
                data: { access_token: fakeCiphertext('secret') },
            };
            const original = JSON.parse(JSON.stringify(document));

            await service.decryptFields('Credential', document);

            expect(document).toEqual(original);
        });

        it('returns the stored value, and warns, when a field fails to decrypt', async () => {
            jest.spyOn(console, 'warn').mockImplementation(() => {});
            mockCryptor.decrypt.mockRejectedValueOnce(
                new Error('Decryption failed')
            );

            const document = {
                data: {
                    access_token: fakeCiphertext('secret'),
                    refresh_token: fakeCiphertext('valid'),
                },
            };

            const result = await service.decryptFields('Credential', document);

            const failed = [result.data.access_token, result.data.refresh_token].filter(
                (value) => value.startsWith('a2V5SWQ=')
            );
            expect(failed).toHaveLength(1);
            expect(console.warn).toHaveBeenCalled();
            console.warn.mockRestore();
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
                fakeCiphertext('secret1')
            );
            expect(result[1].data.access_token).toBe(
                fakeCiphertext('secret2')
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
                { data: { access_token: fakeCiphertext('secret1') } },
                { data: { access_token: fakeCiphertext('secret2') } },
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
        it('detects the Cryptor output shape (keyId:iv:ciphertext:encryptedKey)', () => {
            expect(service._isEncrypted(fakeCiphertext('data'))).toBe(true);
            expect(
                service._isEncrypted(
                    'a2V5SWQ=:00112233445566778899aabbccddeeff:0a1b2c:ZW5jS2V5'
                )
            ).toBe(true);
        });

        it('rejects non-encrypted formats', () => {
            expect(service._isEncrypted('plaintext')).toBe(false);
            expect(service._isEncrypted('one:two:three')).toBe(false);
            expect(service._isEncrypted('one:two')).toBe(false);
            expect(service._isEncrypted(null)).toBe(false);
            expect(service._isEncrypted(undefined)).toBe(false);
            expect(service._isEncrypted(123)).toBe(false);
        });

        it.each([
            'https://user:pw@host:443',
            'a:b:c:d',
            'host:8080:path:x',
            'keyId:longer:data:with:colons:enckey',
            // right shape, wrong parts
            'a2V5SWQ=:tooshort:0a1b2c:ZW5jS2V5',
            'a2V5SWQ=:00112233:0a1b2c:ZW5jS2V5', // iv too short (hex, but not 16 bytes)
            'a2V5SWQ=:00112233445566778899aabbccddeeff00:0a1b2c:ZW5jS2V5', // iv too long
            'not base64!:00112233445566778899aabbccddeeff:0a1b2c:ZW5jS2V5', // keyId
            'a2V5SWQ=:00112233445566778899aabbccddeeff:0a1:ZW5jS2V5',
            'a2V5SWQ=:00112233445566778899aabbccddeeff:0a1b2c:not base64!',
            // five parts: one colon too many
            'a2V5SWQ=:00112233445566778899aabbccddeeff:0a1b2c:ZW5jS2V5:extra',
            '',
        ])('rejects plaintext that merely has colons: %p', (value) => {
            expect(service._isEncrypted(value)).toBe(false);
        });
    });

    describe('plaintext that looks a little like ciphertext (3+ colons)', () => {
        const colonPlaintext = {
            url: 'https://user:pw@host:443',
            letters: 'a:b:c:d',
            // matches the ciphertext SHAPE; only decrypt can tell it is not
            shaped: 'a2V5SWQ=:00112233445566778899aabbccddeeff:0a1b2c:ZW5jS2V5',
        };

        beforeEach(() => {
            jest.spyOn(console, 'warn').mockImplementation(() => {});
        });
        afterEach(() => console.warn.mockRestore());

        it('decryptFields returns plain values with colons untouched, without calling the cryptor', async () => {
            const document = {
                data: {
                    access_token: colonPlaintext.url,
                    refresh_token: colonPlaintext.letters,
                },
            };

            const result = await service.decryptFields('Credential', document);

            expect(result.data).toEqual(document.data);
            expect(mockCryptor.decrypt).not.toHaveBeenCalled();
        });

        it('decryptFieldsInBulk reads every row, plaintext ones included', async () => {
            const documents = [
                { data: { access_token: colonPlaintext.url } },
                { data: { access_token: fakeCiphertext('real-secret') } },
                { data: { refresh_token: colonPlaintext.letters } },
            ];

            const result = await service.decryptFieldsInBulk('Credential', documents);

            expect(result[0].data.access_token).toBe(colonPlaintext.url);
            expect(result[1].data.access_token).toBe('real-secret');
            expect(result[2].data.refresh_token).toBe(colonPlaintext.letters);
        });

        it('a value shaped like ciphertext that fails to decrypt is returned as stored, with a warning', async () => {
            mockCryptor.decrypt.mockRejectedValueOnce(new Error('bad key'));
            const document = {
                data: {
                    access_token: colonPlaintext.shaped,
                    refresh_token: fakeCiphertext('still-decrypted'),
                },
            };

            const result = await service.decryptFields('Credential', document);

            expect(result.data.access_token).toBe(colonPlaintext.shaped);
            expect(result.data.refresh_token).toBe('still-decrypted');
            expect(console.warn).toHaveBeenCalledWith(
                '[Frigg]',
                expect.stringContaining('Could not decrypt Credential.data.access_token'),
                expect.anything()
            );
        });

        it('one undecryptable row does not fail decryptFieldsInBulk', async () => {
            mockCryptor.decrypt
                .mockRejectedValueOnce(new Error('bad key'))
                .mockImplementation((value) => fakePlaintext(value));
            const documents = [
                { data: { access_token: colonPlaintext.shaped } },
                { data: { access_token: fakeCiphertext('ok') } },
            ];

            const result = await service.decryptFieldsInBulk('Credential', documents);

            expect(result[0].data.access_token).toBe(colonPlaintext.shaped);
            expect(result[1].data.access_token).toBe('ok');
        });

        it('encrypts colon plaintext on write instead of skipping it as "already encrypted"', async () => {
            const result = await service.encryptFields('Credential', {
                data: { access_token: colonPlaintext.url },
            });

            expect(mockCryptor.encrypt).toHaveBeenCalledWith(colonPlaintext.url);
            expect(result.data.access_token).toBe(fakeCiphertext(colonPlaintext.url));
        });
    });

    describe('deployed: a ciphertext-shaped value that fails to decrypt fails the read', () => {
        const ciphertext = fakeCiphertext('secret');
        let deployed;

        beforeEach(() => {
            deployed = new FieldEncryptionService({
                cryptor: mockCryptor,
                schema: mockSchema,
                failClosedOnDecryptError: () => true,
            });
        });

        it('decryptFields throws FieldDecryptionError, with the cause, instead of returning ciphertext', async () => {
            const cause = new Error('bad key');
            mockCryptor.decrypt.mockRejectedValueOnce(cause);

            const read = deployed.decryptFields('Credential', {
                data: { access_token: ciphertext },
            });

            await expect(read).rejects.toBeInstanceOf(FieldDecryptionError);
            await expect(read).rejects.toMatchObject({
                message: 'Could not decrypt Credential.data.access_token',
                cause,
            });
        });

        it('decryptFieldsInBulk fails too', async () => {
            mockCryptor.decrypt.mockRejectedValueOnce(new Error('bad key'));

            await expect(
                deployed.decryptFieldsInBulk('Credential', [
                    { data: { access_token: ciphertext } },
                ])
            ).rejects.toBeInstanceOf(FieldDecryptionError);
        });

        it('legacy plaintext is still read as stored: it never reaches the cryptor', async () => {
            const result = await deployed.decryptFields('Credential', {
                data: { access_token: 'plain-legacy-token' },
            });

            expect(result.data.access_token).toBe('plain-legacy-token');
            expect(mockCryptor.decrypt).not.toHaveBeenCalled();
        });

        it('a value that decrypts is returned decrypted', async () => {
            const result = await deployed.decryptFields('Credential', {
                data: { access_token: ciphertext },
            });

            expect(result.data.access_token).toBe('secret');
        });
    });

    describe('fail-closed default follows the runtime', () => {
        const saved = {};
        const keys = ['JEST_WORKER_ID', 'FRIGG_PROVIDER', 'NETLIFY_DEV'];

        beforeEach(() => {
            for (const key of keys) saved[key] = process.env[key];
            jest.spyOn(console, 'warn').mockImplementation(() => {});
        });
        afterEach(() => {
            for (const key of keys) {
                if (saved[key] === undefined) delete process.env[key];
                else process.env[key] = saved[key];
            }
            console.warn.mockRestore();
        });

        const readFailing = () => {
            mockCryptor.decrypt.mockRejectedValueOnce(new Error('bad key'));
            return new FieldEncryptionService({
                cryptor: mockCryptor,
                schema: mockSchema,
            }).decryptFields('Credential', {
                data: { access_token: fakeCiphertext('secret') },
            });
        };

        it('throws in a deployed Netlify function', async () => {
            delete process.env.JEST_WORKER_ID;
            delete process.env.NETLIFY_DEV;
            process.env.FRIGG_PROVIDER = 'netlify';

            await expect(readFailing()).rejects.toBeInstanceOf(FieldDecryptionError);
        });

        it('returns the stored value under `netlify dev`', async () => {
            delete process.env.JEST_WORKER_ID;
            process.env.FRIGG_PROVIDER = 'netlify';
            process.env.NETLIFY_DEV = 'true';

            const result = await readFailing();
            expect(result.data.access_token).toBe(fakeCiphertext('secret'));
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
            const encryptedBlob = fakeCiphertext('{"crmId":"abc"}');
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
