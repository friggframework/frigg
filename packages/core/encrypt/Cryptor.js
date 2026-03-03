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
 * BREAKING CHANGE (v3): A keyProvider must be explicitly provided,
 * or pass { shouldUseAws: false } to auto-create AesEncryptionKeyProvider.
 * For AWS KMS, pass `new KmsEncryptionKeyProvider()` from @friggframework/provider-aws.
 * See docs/adr/001-decouple-aws-from-core.md for migration guide.
 */

const aes = require('./aes');

class Cryptor {
    /**
     * @param {Object} options
     * @param {boolean} [options.shouldUseAws] - true requires explicit keyProvider; false auto-creates AesEncryptionKeyProvider
     * @param {EncryptionKeyProviderInterface} [options.keyProvider] - Explicit key provider (takes precedence)
     */
    constructor({ shouldUseAws, keyProvider } = {}) {
        if (keyProvider) {
            this._keyProvider = keyProvider;
        } else if (shouldUseAws) {
            throw new Error(
                'Cryptor with shouldUseAws=true requires an explicit keyProvider. Pass one via constructor options, e.g.:\n' +
                '  const { KmsEncryptionKeyProvider } = require("@friggframework/provider-aws");\n' +
                '  new Cryptor({ shouldUseAws: true, keyProvider: new KmsEncryptionKeyProvider() })\n' +
                'See docs/adr/001-decouple-aws-from-core.md for migration guide.'
            );
        } else {
            // AES mode — no AWS dependency needed
            const { AesEncryptionKeyProvider } = require('./aes-encryption-key-provider');
            this._keyProvider = new AesEncryptionKeyProvider();
        }
        this._shouldUseAws = shouldUseAws;
    }

    /**
     * Get the key provider.
     * @returns {EncryptionKeyProviderInterface}
     */
    _getKeyProvider() {
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
