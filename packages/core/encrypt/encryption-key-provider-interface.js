/**
 * Encryption Key Provider Interface (Port)
 *
 * Defines the contract for envelope encryption key operations.
 * Used by Cryptor for generating and decrypting data encryption keys.
 *
 * Following Frigg's hexagonal architecture pattern:
 * - Port defines WHAT the service does (contract)
 * - Adapters implement HOW (AWS KMS, local AES, Vault, etc.)
 *
 * Envelope Encryption Pattern:
 * 1. generateDataKey() creates a fresh DEK (plaintext + encrypted form)
 * 2. Caller encrypts data with the plaintext DEK
 * 3. Caller stores the encrypted DEK alongside the ciphertext
 * 4. decryptDataKey() recovers the plaintext DEK from the encrypted form
 * 5. Caller decrypts data with the recovered DEK
 */
class EncryptionKeyProviderInterface {
    /**
     * Generate a new data encryption key
     *
     * Returns both the plaintext key (for immediate encryption) and an
     * encrypted copy (for storage alongside the ciphertext).
     *
     * @returns {Promise<{keyId: string, encryptedKey: string, plaintext: string|Buffer}>}
     *   - keyId: Base64-encoded identifier for the master key used
     *   - encryptedKey: Base64-encoded encrypted copy of the DEK
     *   - plaintext: The raw DEK (string or Buffer) for immediate use
     */
    async generateDataKey() {
        throw new Error(
            'Method generateDataKey must be implemented by subclass'
        );
    }

    /**
     * Decrypt a previously encrypted data encryption key
     *
     * @param {string} keyId - Identifier of the master key used for encryption
     * @param {string|Buffer} encryptedKey - The encrypted DEK to decrypt
     * @returns {Promise<string|Buffer>} The decrypted plaintext DEK
     */
    async decryptDataKey(keyId, encryptedKey) {
        throw new Error(
            'Method decryptDataKey must be implemented by subclass'
        );
    }
}

module.exports = { EncryptionKeyProviderInterface };
