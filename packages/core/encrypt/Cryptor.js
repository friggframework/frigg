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
const AWS = require('aws-sdk');
const aes = require('./aes');

class Cryptor {
    constructor({ shouldUseAws }) {
        this.shouldUseAws = shouldUseAws;
    }

    async generateDataKey() {
        if (this.shouldUseAws) {
            const kmsClient = new AWS.KMS();
            const dataKey = await kmsClient
                .generateDataKey({
                    KeyId: process.env.KMS_KEY_ARN,
                    KeySpec: 'AES_256',
                })
                .promise();

            const keyId = Buffer.from(dataKey.KeyId).toString('base64');
            const encryptedKey = dataKey.CiphertextBlob.toString('base64');
            const plaintext = dataKey.Plaintext;
            return { keyId, encryptedKey, plaintext };
        }

        const { AES_KEY, AES_KEY_ID } = process.env;
        const randomKey = crypto.randomBytes(32).toString('hex').slice(0, 32);

        return {
            keyId: Buffer.from(AES_KEY_ID).toString('base64'),
            encryptedKey: Buffer.from(aes.encrypt(randomKey, AES_KEY)).toString(
                'base64'
            ),
            plaintext: randomKey,
        };
    }

    getKeyFromEnvironment(keyId) {
        const availableKeys = {
            [process.env.AES_KEY_ID]: process.env.AES_KEY,
            [process.env.DEPRECATED_AES_KEY_ID]: process.env.DEPRECATED_AES_KEY,
        };

        const key = availableKeys[keyId];

        if (!key) {
            throw new Error('Encryption key not found');
        }

        return key;
    }

    async decryptDataKey(keyId, encryptedKey) {
        if (this.shouldUseAws) {
            const kmsClient = new AWS.KMS();
            const dataKey = await kmsClient
                .decrypt({
                    KeyId: keyId,
                    CiphertextBlob: encryptedKey,
                })
                .promise();

            return dataKey.Plaintext;
        }

        const key = this.getKeyFromEnvironment(keyId);
        return aes.decrypt(encryptedKey, key);
    }

    async encrypt(text) {
        const { keyId, encryptedKey, plaintext } = await this.generateDataKey();
        const encryptedText = aes.encrypt(text, plaintext);
        return `${keyId}:${encryptedText}:${encryptedKey}`;
    }

    async decrypt(text) {
        const split = text.split(':');
        const keyId = Buffer.from(split[0], 'base64').toString();
        const encryptedText = `${split[1]}:${split[2]}`;
        const encryptedKey = Buffer.from(split[3], 'base64');
        const plaintext = await this.decryptDataKey(keyId, encryptedKey);
        return aes.decrypt(encryptedText, plaintext);
    }
}

module.exports = { Cryptor };
