/**
 * Tests for Cryptor - Provider-Agnostic Encryption
 *
 * Tests encryption/decryption using mock and real key providers.
 * No AWS SDK dependency — key providers are injected via constructor.
 */

const { Cryptor } = require('./Cryptor');

describe('Cryptor', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('Constructor validation', () => {
        it('should throw if shouldUseAws=true without keyProvider', () => {
            expect(() => new Cryptor({ shouldUseAws: true })).toThrow(
                'Cryptor with shouldUseAws=true requires an explicit keyProvider'
            );
        });

        it('should accept explicit keyProvider with shouldUseAws=true', () => {
            const mockProvider = {
                generateDataKey: jest.fn(),
                decryptDataKey: jest.fn(),
            };

            expect(
                () =>
                    new Cryptor({
                        shouldUseAws: true,
                        keyProvider: mockProvider,
                    })
            ).not.toThrow();
        });

        it('should default to AES mode when shouldUseAws is false', () => {
            process.env.AES_KEY = 'test-aes-key-exactly-32-bytes!!!';
            process.env.AES_KEY_ID = 'local-key-id';

            expect(() => new Cryptor({ shouldUseAws: false })).not.toThrow();
        });

        it('should default to AES mode when no options provided', () => {
            process.env.AES_KEY = 'test-aes-key-exactly-32-bytes!!!';
            process.env.AES_KEY_ID = 'local-key-id';

            expect(() => new Cryptor()).not.toThrow();
        });
    });

    describe('With mock keyProvider (simulating KMS)', () => {
        let mockProvider;
        let cryptor;

        beforeEach(() => {
            const mockDataKey = Buffer.from(
                'mock-data-key-32-bytes-exactly!!'
            );
            const mockEncryptedKey = Buffer.from('mock-encrypted-key');

            mockProvider = {
                generateDataKey: jest.fn().mockResolvedValue({
                    keyId: Buffer.from('test-key-id').toString('base64'),
                    encryptedKey:
                        Buffer.from(mockEncryptedKey).toString('base64'),
                    plaintext: mockDataKey,
                }),
                decryptDataKey: jest.fn().mockResolvedValue(mockDataKey),
            };

            cryptor = new Cryptor({
                shouldUseAws: true,
                keyProvider: mockProvider,
            });
        });

        it('should encrypt text using injected key provider', async () => {
            const result = await cryptor.encrypt('sensitive-data');

            expect(result).toBeDefined();
            // Format: "keyId:iv:ciphertext:encryptedKey"
            expect(result.split(':').length).toBe(4);
            expect(mockProvider.generateDataKey).toHaveBeenCalledTimes(1);
        });

        it('should decrypt text using injected key provider', async () => {
            const encrypted = await cryptor.encrypt('test-data');
            const decrypted = await cryptor.decrypt(encrypted);

            expect(decrypted).toBe('test-data');
            expect(mockProvider.decryptDataKey).toHaveBeenCalledTimes(1);
        });

        it('should handle key provider errors during encryption', async () => {
            mockProvider.generateDataKey.mockRejectedValue(
                new Error('KMS unavailable')
            );

            await expect(cryptor.encrypt('sensitive-data')).rejects.toThrow(
                'KMS unavailable'
            );
        });

        it('should handle key provider errors during decryption', async () => {
            const encrypted = await cryptor.encrypt('test-data');

            mockProvider.decryptDataKey.mockRejectedValue(
                new Error('Invalid ciphertext')
            );

            await expect(cryptor.decrypt(encrypted)).rejects.toThrow(
                'Invalid ciphertext'
            );
        });
    });

    describe('AES Mode (shouldUseAws: false)', () => {
        beforeEach(() => {
            // AES-256-CTR requires exactly 32-byte key
            process.env.AES_KEY = 'test-aes-key-exactly-32-bytes!!!';
            process.env.AES_KEY_ID = 'local-key-id';
        });

        it('should encrypt using local AES key', async () => {
            const cryptor = new Cryptor({ shouldUseAws: false });
            const result = await cryptor.encrypt('sensitive-data');

            expect(result).toBeDefined();
            expect(result.split(':').length).toBe(4);
        });

        it('should decrypt using local AES key', async () => {
            const cryptor = new Cryptor({ shouldUseAws: false });

            const encrypted = await cryptor.encrypt('test-data');
            const decrypted = await cryptor.decrypt(encrypted);

            expect(decrypted).toBe('test-data');
        });

        it('should handle round-trip with special characters', async () => {
            const cryptor = new Cryptor({ shouldUseAws: false });

            const testData =
                'Hello, World! 🌍 Special chars: <>&"\' 日本語テスト';
            const encrypted = await cryptor.encrypt(testData);
            const decrypted = await cryptor.decrypt(encrypted);

            expect(decrypted).toBe(testData);
        });

        it('should throw error if encryption key not found during decrypt', async () => {
            const cryptor = new Cryptor({ shouldUseAws: false });

            // Encrypt with current key
            const encrypted = await cryptor.encrypt('test-data');

            // Remove the key from env
            delete process.env.AES_KEY;
            delete process.env.AES_KEY_ID;

            // Create a new Cryptor that won't find the key
            const cryptor2 = new Cryptor({ shouldUseAws: false });

            await expect(cryptor2.decrypt(encrypted)).rejects.toThrow(
                'Encryption key not found'
            );
        });
    });
});
