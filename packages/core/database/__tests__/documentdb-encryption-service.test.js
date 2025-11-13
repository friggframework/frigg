// Mock dependencies BEFORE importing DocumentDBEncryptionService
jest.mock('../../encrypt/Cryptor');
jest.mock('../encryption/encryption-schema-registry');

const { DocumentDBEncryptionService } = require('../documentdb-encryption-service');
const { Cryptor } = require('../../encrypt/Cryptor');
const { getEncryptedFields } = require('../encryption/encryption-schema-registry');

describe('DocumentDBEncryptionService', () => {
    let service;
    let mockCryptor;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset environment
        delete process.env.STAGE;
        delete process.env.NODE_ENV;
        delete process.env.KMS_KEY_ARN;
        delete process.env.AES_KEY_ID;
        delete process.env.AES_KEY;

        // Create mock cryptor
        mockCryptor = {
            encrypt: jest.fn().mockImplementation(async (plaintext) => {
                // Mock encrypted format: keyId:iv:cipher:encKey
                const base64 = Buffer.from(plaintext).toString('base64');
                return `YWVzLWtleS0x:${base64}:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5`;
            }),
            decrypt: jest.fn().mockImplementation(async (ciphertext) => {
                // Extract the base64 part and decode
                const parts = ciphertext.split(':');
                return Buffer.from(parts[1], 'base64').toString();
            })
        };

        Cryptor.mockImplementation(() => mockCryptor);
    });

    afterEach(() => {
        delete process.env.STAGE;
        delete process.env.NODE_ENV;
        delete process.env.KMS_KEY_ARN;
        delete process.env.AES_KEY_ID;
        delete process.env.AES_KEY;
    });

    describe('Initialization', () => {
        it('bypasses encryption in dev stage', () => {
            process.env.STAGE = 'dev';

            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(false);
            expect(service.cryptor).toBeNull();
            expect(Cryptor).not.toHaveBeenCalled();
        });

        it('bypasses encryption in test stage', () => {
            process.env.STAGE = 'test';

            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(false);
            expect(service.cryptor).toBeNull();
        });

        it('bypasses encryption in local stage', () => {
            process.env.STAGE = 'local';

            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(false);
            expect(service.cryptor).toBeNull();
        });

        it('enables KMS encryption in production with KMS_KEY_ARN', () => {
            process.env.STAGE = 'production';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123456789012:key/abc123';

            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(true);
            expect(service.cryptor).toBeTruthy();
            expect(Cryptor).toHaveBeenCalledWith({ shouldUseAws: true });
        });

        it('enables AES encryption in production with AES_KEY_ID', () => {
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'local-key';
            process.env.AES_KEY = '01234567890123456789012345678901';

            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(true);
            expect(service.cryptor).toBeTruthy();
            expect(Cryptor).toHaveBeenCalledWith({ shouldUseAws: false });
        });

        it('disables encryption in production without keys', () => {
            process.env.STAGE = 'production';

            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(false);
            expect(service.cryptor).toBeNull();
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[DocumentDBEncryptionService] No encryption keys configured. Encryption disabled.'
            );

            consoleWarnSpy.mockRestore();
        });

        it('prioritizes KMS over AES when both available', () => {
            process.env.STAGE = 'production';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123456789012:key/abc123';
            process.env.AES_KEY_ID = 'local-key';

            service = new DocumentDBEncryptionService();

            expect(Cryptor).toHaveBeenCalledWith({ shouldUseAws: true });
        });

        it('uses NODE_ENV if STAGE not set', () => {
            process.env.NODE_ENV = 'development';

            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(false);
        });

        it('defaults to development if neither STAGE nor NODE_ENV set', () => {
            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(false);
        });

        it('accepts injected Cryptor for testing (dependency injection)', () => {
            const customCryptor = {
                encrypt: jest.fn(),
                decrypt: jest.fn()
            };

            service = new DocumentDBEncryptionService({ cryptor: customCryptor });

            expect(service.cryptor).toBe(customCryptor);
            expect(service.enabled).toBe(true);
            // Should not call Cryptor constructor when injected
            expect(Cryptor).not.toHaveBeenCalled();
        });

        it('uses environment-based initialization when no cryptor injected', () => {
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'test-key';
            process.env.AES_KEY = '01234567890123456789012345678901';

            service = new DocumentDBEncryptionService();

            expect(service.enabled).toBe(true);
            expect(Cryptor).toHaveBeenCalled();
        });
    });

    describe('encryptFields()', () => {
        beforeEach(() => {
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'test-key';
            process.env.AES_KEY = '01234567890123456789012345678901';
            service = new DocumentDBEncryptionService();
        });

        it('returns unchanged when encryption disabled', async () => {
            process.env.STAGE = 'dev';
            service = new DocumentDBEncryptionService();

            const document = { field: 'value' };
            const result = await service.encryptFields('User', document);

            expect(result).toEqual(document);
            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
        });

        it('returns unchanged for null document', async () => {
            const result = await service.encryptFields('User', null);

            expect(result).toBeNull();
        });

        it('returns unchanged for non-object document', async () => {
            const result = await service.encryptFields('User', 'string');

            expect(result).toBe('string');
        });

        it('returns unchanged when no encrypted fields in registry', async () => {
            getEncryptedFields.mockReturnValue(null);

            const document = { field: 'value' };
            const result = await service.encryptFields('UnknownModel', document);

            expect(result).toEqual(document);
        });

        it('returns unchanged when encrypted fields array is empty', async () => {
            getEncryptedFields.mockReturnValue({ fields: [] });

            const document = { field: 'value' };
            const result = await service.encryptFields('UnknownModel', document);

            expect(result).toEqual(document);
        });

        it('encrypts User.hashword', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            const document = {
                username: 'test@example.com',
                hashword: '$2b$10$plain_bcrypt_hash'
            };

            const result = await service.encryptFields('User', document);

            expect(result.username).toBe('test@example.com');
            expect(result.hashword).not.toBe('$2b$10$plain_bcrypt_hash');
            expect(result.hashword).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
            expect(mockCryptor.encrypt).toHaveBeenCalledWith('$2b$10$plain_bcrypt_hash');
        });

        it('encrypts Credential.data.access_token', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['data.access_token']
            });

            const document = {
                userId: '123',
                data: {
                    access_token: 'ya29.token_here',
                    scope: 'openid profile'
                }
            };

            const result = await service.encryptFields('Credential', document);

            expect(result.data.access_token).not.toBe('ya29.token_here');
            expect(result.data.access_token).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
            expect(result.data.scope).toBe('openid profile'); // Not encrypted
            expect(mockCryptor.encrypt).toHaveBeenCalledWith('ya29.token_here');
        });

        it('encrypts multiple nested fields', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['data.access_token', 'data.refresh_token', 'data.id_token']
            });

            const document = {
                userId: '123',
                data: {
                    access_token: 'access_secret',
                    refresh_token: 'refresh_secret',
                    id_token: 'id_secret',
                    expires_in: 3600
                }
            };

            const result = await service.encryptFields('Credential', document);

            expect(result.data.access_token).not.toBe('access_secret');
            expect(result.data.refresh_token).not.toBe('refresh_secret');
            expect(result.data.id_token).not.toBe('id_secret');
            expect(result.data.expires_in).toBe(3600); // Not encrypted
            expect(mockCryptor.encrypt).toHaveBeenCalledTimes(3);
        });

        it('skips already encrypted values', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            const alreadyEncrypted = 'YWVzLWtleS0x:QWxyZWFkeUVuY3J5cHRlZA==:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5';
            const document = { hashword: alreadyEncrypted };

            const result = await service.encryptFields('User', document);

            expect(result.hashword).toBe(alreadyEncrypted);
            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
        });

        it('skips null values', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            const document = { hashword: null };

            const result = await service.encryptFields('User', document);

            expect(result.hashword).toBeNull();
            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
        });

        it('skips undefined values', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            const document = { hashword: undefined };

            const result = await service.encryptFields('User', document);

            expect(result.hashword).toBeUndefined();
            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
        });

        it('skips non-existent paths', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['data.access_token']
            });

            const document = { userId: '123' }; // No data field

            const result = await service.encryptFields('Credential', document);

            expect(result).toEqual({ userId: '123' });
            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
        });

        it('encrypts objects by JSON.stringify', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['metadata']
            });

            const document = {
                metadata: { nested: 'value', array: [1, 2, 3] }
            };

            const result = await service.encryptFields('CustomModel', document);

            expect(result.metadata).not.toEqual({ nested: 'value', array: [1, 2, 3] });
            expect(mockCryptor.encrypt).toHaveBeenCalledWith(JSON.stringify({ nested: 'value', array: [1, 2, 3] }));
        });

        it('propagates encryption errors', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            mockCryptor.encrypt.mockRejectedValue(new Error('Encryption failed'));

            const document = { hashword: 'password' };

            await expect(service.encryptFields('User', document)).rejects.toThrow('Encryption failed');
        });

        it('does not mutate original document', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            const document = {
                username: 'test',
                hashword: 'password'
            };
            const originalHashword = document.hashword;

            const result = await service.encryptFields('User', document);

            // Original unchanged
            expect(document.hashword).toBe(originalHashword);
            // Result changed
            expect(result.hashword).not.toBe(originalHashword);
        });

        it('preserves Date objects when cloning (structuredClone)', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            const createdAt = new Date('2025-01-13T10:00:00.000Z');
            const document = {
                username: 'test',
                hashword: 'password',
                createdAt: createdAt
            };

            const result = await service.encryptFields('User', document);

            // Date object preserved (not converted to string)
            // Use toString check instead of instanceof due to Jest/Babel transformation issues
            expect(Object.prototype.toString.call(result.createdAt)).toBe('[object Date]');
            expect(result.createdAt.getTime()).toBe(createdAt.getTime());
            expect(typeof result.createdAt).toBe('object');
            expect(typeof result.createdAt.getTime).toBe('function');
            // Original Date unchanged
            expect(document.createdAt).toBe(createdAt);
        });
    });

    describe('decryptFields()', () => {
        beforeEach(() => {
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'test-key';
            process.env.AES_KEY = '01234567890123456789012345678901';
            service = new DocumentDBEncryptionService();
        });

        it('returns unchanged when encryption disabled', async () => {
            process.env.STAGE = 'dev';
            service = new DocumentDBEncryptionService();

            const document = { field: 'value' };
            const result = await service.decryptFields('User', document);

            expect(result).toEqual(document);
            expect(mockCryptor.decrypt).not.toHaveBeenCalled();
        });

        it('returns unchanged for null document', async () => {
            const result = await service.decryptFields('User', null);

            expect(result).toBeNull();
        });

        it('returns unchanged for non-object document', async () => {
            const result = await service.decryptFields('User', 'string');

            expect(result).toBe('string');
        });

        it('returns unchanged when no encrypted fields in registry', async () => {
            getEncryptedFields.mockReturnValue(null);

            const document = { field: 'value' };
            const result = await service.decryptFields('UnknownModel', document);

            expect(result).toEqual(document);
        });

        it('decrypts User.hashword', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            mockCryptor.decrypt.mockResolvedValue('$2b$10$plain_bcrypt_hash');

            const document = {
                username: 'test@example.com',
                hashword: 'YWVzLWtleS0x:JDJiJDEwJHBsYWluX2JjcnlwdF9oYXNo:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5'
            };

            const result = await service.decryptFields('User', document);

            expect(result.hashword).toBe('$2b$10$plain_bcrypt_hash');
            expect(mockCryptor.decrypt).toHaveBeenCalledWith(document.hashword);
        });

        it('decrypts Credential.data.access_token', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['data.access_token']
            });

            mockCryptor.decrypt.mockResolvedValue('ya29.token_here');

            const document = {
                userId: '123',
                data: {
                    access_token: 'YWVzLWtleS0x:eWEyOS50b2tlbl9oZXJl:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5',
                    scope: 'openid profile'
                }
            };

            const result = await service.decryptFields('Credential', document);

            expect(result.data.access_token).toBe('ya29.token_here');
            expect(result.data.scope).toBe('openid profile');
        });

        it('decrypts multiple nested fields', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['data.access_token', 'data.refresh_token']
            });

            mockCryptor.decrypt
                .mockResolvedValueOnce('access_secret')
                .mockResolvedValueOnce('refresh_secret');

            const document = {
                userId: '123',
                data: {
                    access_token: 'YWVzLWtleS0x:YWNjZXNzX3NlY3JldA==:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5',
                    refresh_token: 'YWVzLWtleS0x:cmVmcmVzaF9zZWNyZXQ=:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5'
                }
            };

            const result = await service.decryptFields('Credential', document);

            expect(result.data.access_token).toBe('access_secret');
            expect(result.data.refresh_token).toBe('refresh_secret');
            expect(mockCryptor.decrypt).toHaveBeenCalledTimes(2);
        });

        it('skips plain text values', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            const document = { hashword: 'plain_text' };

            const result = await service.decryptFields('User', document);

            expect(result.hashword).toBe('plain_text');
            expect(mockCryptor.decrypt).not.toHaveBeenCalled();
        });

        it('skips null values', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            const document = { hashword: null };

            const result = await service.decryptFields('User', document);

            expect(result.hashword).toBeNull();
            expect(mockCryptor.decrypt).not.toHaveBeenCalled();
        });

        it('skips non-existent paths', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['data.access_token']
            });

            const document = { userId: '123' }; // No data field

            const result = await service.decryptFields('Credential', document);

            expect(result).toEqual({ userId: '123' });
            expect(mockCryptor.decrypt).not.toHaveBeenCalled();
        });

        it('parses JSON objects after decryption', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['metadata']
            });

            const jsonObject = { nested: 'value', array: [1, 2, 3] };
            mockCryptor.decrypt.mockResolvedValue(JSON.stringify(jsonObject));

            const document = {
                metadata: 'YWVzLWtleS0x:eyJuZXN0ZWQiOiJ2YWx1ZSIsImFycmF5IjpbMSwyLDNdfQ==:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5'
            };

            const result = await service.decryptFields('CustomModel', document);

            expect(result.metadata).toEqual(jsonObject);
        });

        it('handles non-JSON strings', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            mockCryptor.decrypt.mockResolvedValue('not_json_string');

            const document = {
                hashword: 'YWVzLWtleS0x:bm90X2pzb25fc3RyaW5n:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5'
            };

            const result = await service.decryptFields('User', document);

            expect(result.hashword).toBe('not_json_string');
        });

        it('throws error on decryption failure (fail fast)', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            mockCryptor.decrypt.mockRejectedValue(new Error('Decryption failed'));

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            const document = {
                hashword: 'YWVzLWtleS0x:Y29ycnVwdGVk:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5'
            };

            await expect(service.decryptFields('User', document))
                .rejects.toThrow('Decryption failed for User.hashword: Decryption failed');

            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });

        it('logs error context on decryption failure before throwing', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['data.access_token']
            });

            mockCryptor.decrypt.mockRejectedValue(new Error('Invalid key'));

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            const document = {
                data: {
                    access_token: 'YWVzLWtleS0x:Y29ycnVwdGVk:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5'
                }
            };

            await expect(service.decryptFields('Credential', document))
                .rejects.toThrow('Decryption failed for Credential.data.access_token: Invalid key');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to decrypt Credential.data.access_token'),
                expect.stringContaining('Invalid key')
            );

            consoleErrorSpy.mockRestore();
        });

        it('does not mutate original document', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            mockCryptor.decrypt.mockResolvedValue('decrypted_password');

            const document = {
                username: 'test',
                hashword: 'YWVzLWtleS0x:ZW5jcnlwdGVkX3Bhc3N3b3Jk:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5'
            };
            const originalHashword = document.hashword;

            const result = await service.decryptFields('User', document);

            // Original unchanged
            expect(document.hashword).toBe(originalHashword);
            // Result changed
            expect(result.hashword).toBe('decrypted_password');
        });

        it('preserves Date objects when cloning (structuredClone)', async () => {
            getEncryptedFields.mockReturnValue({
                fields: ['hashword']
            });

            mockCryptor.decrypt.mockResolvedValue('decrypted_password');

            const expiresAt = new Date('2025-12-31T23:59:59.999Z');
            const document = {
                username: 'test',
                hashword: 'YWVzLWtleS0x:ZW5jcnlwdGVkX3Bhc3N3b3Jk:Q2lwaGVyVGV4dA==:RW5jcnlwdGVkS2V5',
                expiresAt: expiresAt
            };

            const result = await service.decryptFields('User', document);

            // Date object preserved (not converted to string)
            // Use toString check instead of instanceof due to Jest/Babel transformation issues
            expect(Object.prototype.toString.call(result.expiresAt)).toBe('[object Date]');
            expect(result.expiresAt.getTime()).toBe(expiresAt.getTime());
            expect(typeof result.expiresAt).toBe('object');
            expect(typeof result.expiresAt.getTime).toBe('function');
            // Original Date unchanged
            expect(document.expiresAt).toBe(expiresAt);
        });
    });

    describe('_isEncryptedValue()', () => {
        beforeEach(() => {
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'test-key';
            service = new DocumentDBEncryptionService();
        });

        it('returns false for plain text', () => {
            expect(service._isEncryptedValue('plain_text')).toBe(false);
        });

        it('returns false for null', () => {
            expect(service._isEncryptedValue(null)).toBe(false);
        });

        it('returns false for undefined', () => {
            expect(service._isEncryptedValue(undefined)).toBe(false);
        });

        it('returns false for numbers', () => {
            expect(service._isEncryptedValue(123)).toBe(false);
        });

        it('returns false for objects', () => {
            expect(service._isEncryptedValue({ key: 'value' })).toBe(false);
        });

        it('returns false for arrays', () => {
            expect(service._isEncryptedValue([1, 2, 3])).toBe(false);
        });

        it('returns false for strings with less than 4 parts', () => {
            expect(service._isEncryptedValue('part1:part2')).toBe(false);
            expect(service._isEncryptedValue('part1:part2:part3')).toBe(false);
        });

        it('returns false for strings with more than 4 parts', () => {
            expect(service._isEncryptedValue('YWVzLWtleS0x:cGFydDI=:cGFydDM=:cGFydDQ=:cGFydDU=')).toBe(false);
        });

        it('returns false for URLs with colons', () => {
            expect(service._isEncryptedValue('http://example.com:8080:path:query')).toBe(false);
        });

        it('returns false for connection strings', () => {
            expect(service._isEncryptedValue('mongodb://user:pass:localhost:27017')).toBe(false);
        });

        it('returns false for short strings (less than 50 chars)', () => {
            expect(service._isEncryptedValue('YWVz:cGFy:dDM=:dDQ=')).toBe(false);
        });

        it('returns false when parts contain non-base64 characters', () => {
            const invalidBase64 = 'YWVzLWtleS0x:invalid!@#$:cGFydDM=:cGFydDQ=' + 'x'.repeat(50);
            expect(service._isEncryptedValue(invalidBase64)).toBe(false);
        });

        it('returns false when parts contain spaces', () => {
            const withSpaces = 'YWVzLWtleS0x:cGFy dDI=:cGFydDM=:cGFydDQ=' + 'x'.repeat(50);
            expect(service._isEncryptedValue(withSpaces)).toBe(false);
        });

        it('returns true for valid encrypted format', () => {
            const validEncrypted = 'YWVzLWtleS0x:TXlJVkhlcmU=:QWN0dWFsQ2lwaGVyVGV4dEhlcmU=:RW5jcnlwdGVkS2V5SGVyZQ==';
            expect(service._isEncryptedValue(validEncrypted)).toBe(true);
        });

        it('returns true for realistic encrypted value from Cryptor', () => {
            // Simulate actual Cryptor output
            const keyId = Buffer.from('aes-key-1').toString('base64');
            const encryptedText = Buffer.from('x'.repeat(32)).toString('base64');
            const cipher = Buffer.from('y'.repeat(32)).toString('base64');
            const encryptedKey = Buffer.from('z'.repeat(32)).toString('base64');

            const encrypted = `${keyId}:${encryptedText}:${cipher}:${encryptedKey}`;

            expect(service._isEncryptedValue(encrypted)).toBe(true);
        });

        it('accepts base64 with padding', () => {
            const withPadding = 'YWVzLWtleS0xMTEx:cGFydDI=:cGFydDMxMTExMTExMQ==:cGFydDQxMTExMTExMTExMTExMTEx';
            expect(service._isEncryptedValue(withPadding)).toBe(true);
        });

        it('accepts base64 with plus and slash characters', () => {
            const withSpecialChars = 'YWVzLWtleS8xKzEx:cGFy+DI/Mw==:cGFydDMx+TExMTExMTExMQ==:cGFydDQx/TExMTExMTExMTExMTEx';
            expect(service._isEncryptedValue(withSpecialChars)).toBe(true);
        });
    });
});
