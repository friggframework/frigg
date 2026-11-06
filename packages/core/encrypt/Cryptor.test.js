/**
 * Tests for Cryptor - AWS SDK v3 Migration
 * 
 * Tests KMS encryption/decryption operations using aws-sdk-client-mock
 */

describe('Cryptor - AWS SDK v3', () => {
    let kmsMock;
    let Cryptor;
    let GenerateDataKeyCommand;
    let DecryptCommand;
    const originalEnv = process.env;

    const buildCiphertext = (text, dataKey, encryptedKey = 'encrypted-key') => {
        const base64 = (value) => Buffer.from(value).toString('base64');
        return [
            base64('test-key-id'),
            require('./aes').encrypt(text, dataKey),
            base64(encryptedKey),
        ].join(':');
    };

    beforeEach(() => {
        jest.resetModules();
        const { mockClient } = require('aws-sdk-client-mock');
        const kms = require('@aws-sdk/client-kms');
        ({ GenerateDataKeyCommand, DecryptCommand } = kms);
        ({ Cryptor } = require('./Cryptor'));
        kmsMock = mockClient(kms.KMSClient);
        jest.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        kmsMock.reset();
        process.env = originalEnv;
    });

    it('exposes the shouldUseAws flag it was built with', () => {
        expect(new Cryptor({ shouldUseAws: true }).shouldUseAws).toBe(true);
        expect(new Cryptor({ shouldUseAws: false }).shouldUseAws).toBe(false);
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
                const dataKey = Buffer.from('test-data-key-is-32-bytes-long!!');
                kmsMock.on(DecryptCommand).resolves({ Plaintext: dataKey });

                const decrypted = await new Cryptor({ shouldUseAws: true }).decrypt(
                    buildCiphertext('test-data', dataKey)
                );

                expect(decrypted).toBe('test-data');
                expect(kmsMock.calls()).toHaveLength(1);
                expect(kmsMock.call(0).args[0].input.CiphertextBlob).toEqual(
                    Buffer.from('encrypted-key')
                );
            });

            it('should handle KMS errors during decryption', async () => {
                kmsMock.on(DecryptCommand).rejects(new Error('Invalid ciphertext'));

                const cryptor = new Cryptor({ shouldUseAws: true });
                const fakeEncrypted = Buffer.from('test-key-id').toString('base64') + ':fake:data:' + Buffer.from('fake-key').toString('base64');

                await expect(cryptor.decrypt(fakeEncrypted)).rejects.toThrow('Invalid ciphertext');
            });
        });
    });

    describe('KMS data key cache', () => {
        const dataKey = Buffer.from('test-data-key-is-32-bytes-long!!');
        const decryptCalls = () => kmsMock.commandCalls(DecryptCommand).length;
        const generateCalls = () => kmsMock.commandCalls(GenerateDataKeyCommand).length;
        let keyCounter;

        const stubKms = () => {
            keyCounter = 0;
            kmsMock.on(GenerateDataKeyCommand).callsFake(() => ({
                KeyId: 'test-key-id',
                Plaintext: dataKey,
                CiphertextBlob: Buffer.from(`encrypted-key-${keyCounter++}`),
            }));
            kmsMock.on(DecryptCommand).resolves({ Plaintext: dataKey });
        };

        const uncachedCiphertext = (text) => buildCiphertext(text, dataKey);

        beforeEach(() => {
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123456789:key/test-key-id';
            stubKms();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('decrypts the same value twice with one KMS Decrypt call', async () => {
            const encrypted = uncachedCiphertext('secret');
            const cryptor = new Cryptor({ shouldUseAws: true });

            expect(await cryptor.decrypt(encrypted)).toBe('secret');
            expect(await cryptor.decrypt(encrypted)).toBe('secret');

            expect(decryptCalls()).toBe(1);
        });

        it('decrypts a value it just encrypted without calling KMS Decrypt', async () => {
            const cryptor = new Cryptor({ shouldUseAws: true });

            const encrypted = await cryptor.encrypt('secret');

            expect(await cryptor.decrypt(encrypted)).toBe('secret');
            expect(decryptCalls()).toBe(0);
        });

        it('generates a fresh data key for every encrypt', async () => {
            const cryptor = new Cryptor({ shouldUseAws: true });

            await cryptor.encrypt('one');
            await cryptor.encrypt('two');

            expect(generateCalls()).toBe(2);
        });

        it('calls KMS Decrypt again once the entry is older than 60 minutes', async () => {
            jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
            const encrypted = uncachedCiphertext('secret');
            const cryptor = new Cryptor({ shouldUseAws: true });

            await cryptor.decrypt(encrypted);
            jest.setSystemTime(new Date('2026-01-01T00:59:59Z'));
            await cryptor.decrypt(encrypted);
            expect(decryptCalls()).toBe(1);

            jest.setSystemTime(new Date('2026-01-01T01:00:01Z'));
            await cryptor.decrypt(encrypted);
            expect(decryptCalls()).toBe(2);
        });

        const fillCache = async (cryptor, count) => {
            for (let i = 0; i < count; i++) {
                await cryptor.encrypt(`value-${i}`);
            }
            kmsMock.resetHistory();
        };

        it('evicts the least recently used entry when more than 10000 data keys are cached', async () => {
            const cryptor = new Cryptor({ shouldUseAws: true });
            const first = await cryptor.encrypt('first');
            await fillCache(cryptor, 10000);

            await cryptor.decrypt(first);
            expect(decryptCalls()).toBe(1);

            kmsMock.resetHistory();
            const latest = await cryptor.encrypt('latest');
            kmsMock.resetHistory();
            await cryptor.decrypt(latest);
            expect(decryptCalls()).toBe(0);
        });

        it('keeps a frequently read data key when newer keys fill the cache', async () => {
            const encrypted = uncachedCiphertext('credential');
            const cryptor = new Cryptor({ shouldUseAws: true });
            await cryptor.decrypt(encrypted);
            await fillCache(cryptor, 9999);

            await cryptor.decrypt(encrypted);
            await fillCache(cryptor, 9999);

            await cryptor.decrypt(encrypted);
            expect(decryptCalls()).toBe(0);
        });

        it('shares the cache across Cryptor instances', async () => {
            const encrypted = uncachedCiphertext('secret');

            await new Cryptor({ shouldUseAws: true }).decrypt(encrypted);
            await new Cryptor({ shouldUseAws: true }).decrypt(encrypted);

            expect(decryptCalls()).toBe(1);
        });

        it('shares one Decrypt call between concurrent decrypts of the same uncached key', async () => {
            const encrypted = uncachedCiphertext('secret');
            const cryptor = new Cryptor({ shouldUseAws: true });

            const results = await Promise.all([
                cryptor.decrypt(encrypted),
                cryptor.decrypt(encrypted),
            ]);

            expect(results).toEqual(['secret', 'secret']);
            expect(decryptCalls()).toBe(1);
        });

        it('does not cache a failed Decrypt', async () => {
            const encrypted = uncachedCiphertext('secret');
            const cryptor = new Cryptor({ shouldUseAws: true });
            kmsMock
                .on(DecryptCommand)
                .rejectsOnce(new Error('throttled'))
                .resolves({ Plaintext: dataKey });

            await expect(cryptor.decrypt(encrypted)).rejects.toThrow('throttled');
            expect(await cryptor.decrypt(encrypted)).toBe('secret');
        });
    });

    describe('Local Mode (shouldUseAws: false)', () => {
        beforeEach(() => {
            process.env.AES_KEY = 'test-aes-key-that-is-32-bytes!!!';
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
            const fakeEncrypted = [
                Buffer.from('unknown-key').toString('base64'),
                'iv',
                'data',
                Buffer.from('key').toString('base64'),
            ].join(':');

            await expect(cryptor.decrypt(fakeEncrypted)).rejects.toThrow('Encryption key not found');
        });
    });
});

