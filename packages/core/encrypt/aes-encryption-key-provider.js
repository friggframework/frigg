/**
 * AES Encryption Key Provider (Adapter)
 *
 * Local AES-based implementation of EncryptionKeyProviderInterface.
 * Uses environment-variable-based master keys for envelope encryption.
 *
 * No external dependencies — works on any platform.
 *
 * Environment Variables:
 * - AES_KEY_ID: Identifier for the current AES master key
 * - AES_KEY: The current AES master key (32 chars)
 * - DEPRECATED_AES_KEY_ID: (optional) Previous key ID for key rotation
 * - DEPRECATED_AES_KEY: (optional) Previous key for decrypting old data
 */

const crypto = require('crypto');
const aes = require('./aes');
const {
    EncryptionKeyProviderInterface,
} = require('./encryption-key-provider-interface');

class AesEncryptionKeyProvider extends EncryptionKeyProviderInterface {
    /**
     * Generate a data encryption key using local AES
     *
     * Creates a random DEK and encrypts it with the AES master key
     * from environment variables.
     *
     * @returns {Promise<{keyId: string, encryptedKey: string, plaintext: string}>}
     */
    async generateDataKey() {
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

    /**
     * Decrypt a data encryption key using the AES master key
     *
     * Looks up the master key by keyId from environment variables,
     * supporting key rotation via DEPRECATED_AES_KEY.
     *
     * @param {string} keyId - Key identifier to look up in environment
     * @param {string|Buffer} encryptedKey - Encrypted DEK to decrypt
     * @returns {Promise<string>} Decrypted plaintext DEK
     */
    async decryptDataKey(keyId, encryptedKey) {
        const key = this.getKeyFromEnvironment(keyId);
        return aes.decrypt(encryptedKey, key);
    }

    /**
     * Look up an AES master key by its identifier
     *
     * @param {string} keyId - Key identifier
     * @returns {string} The master key
     * @throws {Error} If key not found in environment
     */
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
}

module.exports = { AesEncryptionKeyProvider };
