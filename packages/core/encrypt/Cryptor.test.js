/**
 * Tests for Cryptor - AWS SDK v3 Migration
 * 
 * Tests KMS encryption/decryption operations using aws-sdk-client-mock
 */

const { mockClient } = require('aws-sdk-client-mock');
const { KMSClient, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { Cryptor } = require('./Cryptor');

/**
 * @group unit
 * @group infrastructure
 */
describe('Cryptor - AWS SDK v3', () => {
    let kmsMock;
    const originalEnv = process.env;

    beforeEach(() => {
        kmsMock = mockClient(KMSClient);
        jest.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        kmsMock.reset();
        process.env = originalEnv;
    });

    describe('KMS Mode (shouldUseAws: true)', () => {
        beforeEach(() => {
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123456789:key/test-key-id';
        });

        describe('encrypt()', () => {
            it('should encrypt text using KMS data key', async () => {
                const mockPlaintext = Buffer.from('mock-plaintext-key-32-bytes-long');
                const mockCiphertextBlob = Buffer.from('mock-encrypted-key');

                kmsMock.on(GenerateDataKeyCommand).resolves({
                    KeyId: 'test-key-id',
                    Plaintext: mockPlaintext,
                    CiphertextBlob: mockCiphertextBlob,
                });

                const cryptor = new Cryptor({ shouldUseAws: true });
                const result = await cryptor.encrypt('sensitive-data');

                // Result should be in format: "keyId:encryptedText:encryptedKey"
                expect(result).toBeDefined();
                expect(result.split(':').length).toBe(4);  // keyId:iv:ciphertext:encryptedKey format from aes

                expect(kmsMock.calls()).toHaveLength(1);
                const call = kmsMock.call(0);
                expect(call.args[0].input).toMatchObject({
                    KeyId: process.env.KMS_KEY_ARN,
                    KeySpec: 'AES_256',
                });
            });

            it('should handle KMS errors during encryption', async () => {
                kmsMock.on(GenerateDataKeyCommand).rejects(new Error('KMS unavailable'));

                const cryptor = new Cryptor({ shouldUseAws: true });

                await expect(cryptor.encrypt('sensitive-data')).rejects.toThrow('KMS unavailable');
            });
        });

        describe('decrypt()', () => {
            it('should decrypt text using KMS', async () => {
                const mockPlaintext = Buffer.from('mock-plaintext-key');

                kmsMock.on(DecryptCommand).resolves({
                    Plaintext: mockPlaintext,
                });

                const cryptor = new Cryptor({ shouldUseAws: true });
                
                // First encrypt some data
                const mockDataKey = Buffer.from('test-key-32-bytes-long-exactly');
                kmsMock.on(GenerateDataKeyCommand).resolves({
                    KeyId: 'test-key-id',
                    Plaintext: mockDataKey,
                    CiphertextBlob: Buffer.from('encrypted-key'),
                });

                const encrypted = await cryptor.encrypt('test-data');
                
                // Then decrypt
                kmsMock.reset();
                kmsMock.on(DecryptCommand).resolves({
                    Plaintext: mockDataKey,
                });

                const decrypted = await cryptor.decrypt(encrypted);
                
                expect(decrypted).toBe('test-data');
                expect(kmsMock.calls()).toHaveLength(1);
            });

            it('should handle KMS errors during decryption', async () => {
                kmsMock.on(DecryptCommand).rejects(new Error('Invalid ciphertext'));

                const cryptor = new Cryptor({ shouldUseAws: true });
                const fakeEncrypted = Buffer.from('test-key-id').toString('base64') + ':fake:data:' + Buffer.from('fake-key').toString('base64');

                await expect(cryptor.decrypt(fakeEncrypted)).rejects.toThrow('Invalid ciphertext');
            });
        });
    });

    describe('Local Mode (shouldUseAws: false)', () => {
        beforeEach(() => {
            process.env.AES_KEY = '12345678901234567890123456789012'; // Exactly 32 characters for AES-256
            process.env.AES_KEY_ID = 'local-key-id';
        });

        it('should encrypt using local AES key', async () => {
            const cryptor = new Cryptor({ shouldUseAws: false });
            const result = await cryptor.encrypt('sensitive-data');

            expect(result).toBeDefined();
            expect(result.split(':').length).toBeGreaterThanOrEqual(3);
            expect(kmsMock.calls()).toHaveLength(0);  // Should not call KMS
        });

        it('should decrypt using local AES key', async () => {
            const cryptor = new Cryptor({ shouldUseAws: false });
            
            const encrypted = await cryptor.encrypt('test-data');
            const decrypted = await cryptor.decrypt(encrypted);

            expect(decrypted).toBe('test-data');
            expect(kmsMock.calls()).toHaveLength(0);  // Should not call KMS
        });

        it('should throw error if encryption key not found', async () => {
            delete process.env.AES_KEY_ID;

            const cryptor = new Cryptor({ shouldUseAws: false });
            const fakeEncrypted = 'unknown-key:data:key';

            await expect(cryptor.decrypt(fakeEncrypted)).rejects.toThrow('Encryption key not found');
        });
    });
});

