/**
 * Cryptor - Encryption Service Adapter
 *
 * Infrastructure Layer adapter for envelope encryption.
 * Key management is delegated to an EncryptionKeyProviderInterface adapter:
 * - KmsEncryptionKeyProvider (in @friggframework/provider-aws) for AWS KMS
 * - AesEncryptionKeyProvider (in core) for local AES keys
 *
 * Envelope Encryption Pattern:
 * 1. Generate Data Encryption Key (DEK) via key provider
 * 2. Encrypt field value with DEK using AES-256-CTR
 * 3. Store encrypted DEK alongside ciphertext
 * 4. Return format: "keyId:encryptedText:encryptedKey"
 *
 * Backward compatible: accepts { shouldUseAws } or { keyProvider }.
 */

const aes = require('./aes');

class Cryptor {
    /**
     * @param {Object} options
     * @param {boolean} [options.shouldUseAws] - Legacy flag: true = KMS, false = AES
     * @param {EncryptionKeyProviderInterface} [options.keyProvider] - Explicit key provider
     */
    constructor({ shouldUseAws, keyProvider } = {}) {
        this._keyProvider = keyProvider || null;
        this._shouldUseAws = shouldUseAws;
    }

    /**
     * Get the key provider, lazy-loading the appropriate default.
     * @returns {EncryptionKeyProviderInterface}
     */
    _getKeyProvider() {
        if (!this._keyProvider) {
            if (this._shouldUseAws) {
                const { KmsEncryptionKeyProvider } =
                    require('@friggframework/provider-aws');
                this._keyProvider = new KmsEncryptionKeyProvider();
            } else {
                const { AesEncryptionKeyProvider } =
                    require('./aes-encryption-key-provider');
                this._keyProvider = new AesEncryptionKeyProvider();
            }
        }
        return this._keyProvider;
    }

    async generateDataKey() {
        return this._getKeyProvider().generateDataKey();
    }

    /**
     * Look up an AES key by identifier from environment variables.
     * Kept for backward compatibility.
     *
     * @param {string} keyId - Key identifier
     * @returns {string} The master key
     */
    getKeyFromEnvironment(keyId) {
        const provider = this._getKeyProvider();
        if (typeof provider.getKeyFromEnvironment === 'function') {
            return provider.getKeyFromEnvironment(keyId);
        }

        // Fallback for providers that don't implement getKeyFromEnvironment
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
        return this._getKeyProvider().decryptDataKey(keyId, encryptedKey);
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
