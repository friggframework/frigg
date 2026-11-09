/**
 * Cryptor - Encryption Service Adapter
 *
 * Infrastructure Layer adapter for AWS KMS and local AES encryption.
 * Provides envelope encryption pattern for field-level encryption.
 *
 * Envelope Encryption Pattern:
 * 1. Generate Data Encryption Key (DEK) via KMS or locally
 * 2. Encrypt field value with DEK using AES-256-CTR
 * 3. Encrypt DEK with Master Key (KMS CMK or AES_KEY)
 * 4. Return format: "keyId:encryptedText:encryptedKey"
 *
 * Benefits:
 * - Reduces KMS API calls (unique DEK per operation)
 * - Master key never leaves KMS
 * - Enables key rotation without re-encrypting data
 */

const crypto = require('crypto');
const { KMSClient, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const aes = require('./aes');

const DATA_KEY_TTL_MS = 60 * 60 * 1000;
const DATA_KEY_CACHE_MAX_ENTRIES = 10000;

function createKmsDataKeys() {
    let client = null;
    const cache = new Map();

    const getClient = () => {
        client = client || new KMSClient({});
        return client;
    };

    const remember = (encryptedKeyB64, promise) => {
        cache.delete(encryptedKeyB64);
        if (cache.size >= DATA_KEY_CACHE_MAX_ENTRIES) {
            cache.delete(cache.keys().next().value);
        }
        cache.set(encryptedKeyB64, {
            promise,
            expiresAt: Date.now() + DATA_KEY_TTL_MS,
        });
    };

    const lookup = (encryptedKeyB64) => {
        const entry = cache.get(encryptedKeyB64);
        if (!entry) {
            return undefined;
        }
        cache.delete(encryptedKeyB64);
        if (entry.expiresAt <= Date.now()) {
            return undefined;
        }
        cache.set(encryptedKeyB64, entry);
        return entry.promise;
    };

    return {
        async generate() {
            const dataKey = await getClient().send(
                new GenerateDataKeyCommand({
                    KeyId: process.env.KMS_KEY_ARN,
                    KeySpec: 'AES_256',
                })
            );
            const encryptedKey = Buffer.from(dataKey.CiphertextBlob).toString('base64');
            remember(encryptedKey, Promise.resolve(dataKey.Plaintext));
            return {
                keyId: Buffer.from(dataKey.KeyId).toString('base64'),
                encryptedKey,
                plaintext: dataKey.Plaintext,
            };
        },

        async decrypt(keyId, encryptedKeyB64) {
            const cached = lookup(encryptedKeyB64);
            if (cached) {
                return cached;
            }

            const pending = getClient()
                .send(
                    new DecryptCommand({
                        KeyId: keyId,
                        CiphertextBlob: Buffer.from(encryptedKeyB64, 'base64'),
                    })
                )
                .then((dataKey) => dataKey.Plaintext);
            remember(encryptedKeyB64, pending);
            pending.catch(() => {
                if (cache.get(encryptedKeyB64)?.promise === pending) {
                    cache.delete(encryptedKeyB64);
                }
            });
            return pending;
        },
    };
}

const localDataKeys = {
    async generate() {
        const { AES_KEY, AES_KEY_ID } = process.env;
        const randomKey = crypto.randomBytes(32).toString('hex').slice(0, 32);

        return {
            keyId: Buffer.from(AES_KEY_ID).toString('base64'),
            encryptedKey: Buffer.from(aes.encrypt(randomKey, AES_KEY)).toString(
                'base64'
            ),
            plaintext: randomKey,
        };
    },

    async decrypt(keyId, encryptedKeyB64) {
        const availableKeys = {
            [process.env.AES_KEY_ID]: process.env.AES_KEY,
            [process.env.DEPRECATED_AES_KEY_ID]: process.env.DEPRECATED_AES_KEY,
        };

        const key = availableKeys[keyId];

        if (!key) {
            throw new Error('Encryption key not found');
        }

        return aes.decrypt(Buffer.from(encryptedKeyB64, 'base64'), key);
    },
};

const kmsDataKeys = createKmsDataKeys();

class Cryptor {
    constructor({ shouldUseAws }) {
        this.shouldUseAws = shouldUseAws;
        this.dataKeys = shouldUseAws ? kmsDataKeys : localDataKeys;
    }

    async encrypt(text) {
        const { keyId, encryptedKey, plaintext } = await this.dataKeys.generate();
        const encryptedText = aes.encrypt(text, plaintext);
        return `${keyId}:${encryptedText}:${encryptedKey}`;
    }

    async decrypt(text) {
        const split = text.split(':');
        const keyId = Buffer.from(split[0], 'base64').toString();
        const encryptedText = `${split[1]}:${split[2]}`;
        const plaintext = await this.dataKeys.decrypt(keyId, split[3]);
        return aes.decrypt(encryptedText, plaintext);
    }
}

module.exports = { Cryptor };
