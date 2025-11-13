const { Cryptor } = require('../encrypt/Cryptor');
const { getEncryptedFields } = require('./encryption/encryption-schema-registry');

/**
 * Encryption service specifically for DocumentDB repositories
 * that use $runCommandRaw and bypass Prisma Client Extensions.
 *
 * Provides document-level encryption/decryption, handling nested fields
 * according to the encryption schema registry.
 *
 * @class DocumentDBEncryptionService
 * @example
 * const service = new DocumentDBEncryptionService();
 *
 * // Encrypt before write
 * const encrypted = await service.encryptFields('Credential', document);
 * await insertOne(prisma, 'Credential', encrypted);
 *
 * // Decrypt after read
 * const doc = await findOne(prisma, 'Credential', filter);
 * const decrypted = await service.decryptFields('Credential', doc);
 */
class DocumentDBEncryptionService {
    /**
     * @param {Object} options - Configuration options
     * @param {Cryptor} [options.cryptor] - Optional Cryptor instance for dependency injection (useful for testing)
     */
    constructor({ cryptor = null } = {}) {
        if (cryptor) {
            // Dependency injection - use provided Cryptor (for testing)
            this.cryptor = cryptor;
            this.enabled = true;
        } else {
            // Default behavior - create Cryptor from environment
            this._initializeCryptor();
        }
    }

    /**
     * Initialize Cryptor with environment-based configuration.
     * Matches the logic from @friggframework/core/database/prisma.js
     *
     * Encryption is bypassed in dev/test/local stages.
     * Production uses AWS KMS (if available) or AES encryption.
     *
     * @private
     */
    _initializeCryptor() {
        // Match logic from packages/core/database/prisma.js
        const stage = process.env.STAGE || process.env.NODE_ENV || 'development';
        const bypassEncryption = ['dev', 'test', 'local'].includes(stage.toLowerCase());

        if (bypassEncryption) {
            this.cryptor = null;
            this.enabled = false;
            return;
        }

        // Determine encryption method (ensure boolean values)
        const hasKMS = !!(process.env.KMS_KEY_ARN && process.env.KMS_KEY_ARN.trim() !== '');
        const hasAES = !!(process.env.AES_KEY_ID && process.env.AES_KEY_ID.trim() !== '');

        if (!hasKMS && !hasAES) {
            console.warn('[DocumentDBEncryptionService] No encryption keys configured. Encryption disabled.');
            this.cryptor = null;
            this.enabled = false;
            return;
        }

        // KMS takes precedence over AES
        const shouldUseAws = hasKMS;
        this.cryptor = new Cryptor({ shouldUseAws });
        this.enabled = true;
    }

    /**
     * Encrypt sensitive fields in a document before storing to DocumentDB.
     *
     * Reads field paths from encryption-schema-registry.js and encrypts
     * only the fields defined for the given model.
     *
     * @param {string} modelName - Model name from schema registry (e.g., 'User', 'Credential')
     * @param {Object} document - Document to encrypt
     * @returns {Promise<Object>} - New document with encrypted fields (original unchanged)
     *
     * @example
     * const plainDoc = {
     *   userId: '123',
     *   data: { access_token: 'plain_secret' }
     * };
     * const encrypted = await service.encryptFields('Credential', plainDoc);
     * // encrypted.data.access_token = "keyId:iv:cipher:encKey"
     */
    async encryptFields(modelName, document) {
        // Bypass if encryption disabled
        if (!this.enabled || !this.cryptor) {
            return document;
        }

        // Validate input
        if (!document || typeof document !== 'object') {
            return document;
        }

        // Get encrypted fields from registry
        const encryptedFieldsConfig = getEncryptedFields(modelName);
        if (!encryptedFieldsConfig || !encryptedFieldsConfig.fields || encryptedFieldsConfig.fields.length === 0) {
            return document;
        }

        // Deep clone to prevent mutation (preserves Date, RegExp, Buffer)
        const result = structuredClone(document);

        // Encrypt each field path
        for (const fieldPath of encryptedFieldsConfig.fields) {
            await this._encryptFieldPath(result, fieldPath, modelName);
        }

        return result;
    }

    /**
     * Decrypt sensitive fields in a document after reading from DocumentDB.
     *
     * Reads field paths from encryption-schema-registry.js and decrypts
     * only the fields defined for the given model.
     *
     * @param {string} modelName - Model name from schema registry
     * @param {Object} document - Document to decrypt
     * @returns {Promise<Object>} - New document with decrypted fields (original unchanged)
     *
     * @example
     * const encryptedDoc = {
     *   userId: '123',
     *   data: { access_token: 'keyId:iv:cipher:encKey' }
     * };
     * const decrypted = await service.decryptFields('Credential', encryptedDoc);
     * // decrypted.data.access_token = "plain_secret"
     */
    async decryptFields(modelName, document) {
        // Bypass if encryption disabled
        if (!this.enabled || !this.cryptor) {
            return document;
        }

        // Validate input
        if (!document || typeof document !== 'object') {
            return document;
        }

        // Get encrypted fields from registry
        const encryptedFieldsConfig = getEncryptedFields(modelName);
        if (!encryptedFieldsConfig || !encryptedFieldsConfig.fields || encryptedFieldsConfig.fields.length === 0) {
            return document;
        }

        // Deep clone to prevent mutation (preserves Date, RegExp, Buffer)
        const result = structuredClone(document);

        // Decrypt each field path
        for (const fieldPath of encryptedFieldsConfig.fields) {
            await this._decryptFieldPath(result, fieldPath, modelName);
        }

        return result;
    }

    /**
     * Encrypt a specific field path in a document (handles nested fields).
     *
     * @private
     * @param {Object} document - Document to modify (mutated in place)
     * @param {string} fieldPath - Field path from schema registry (e.g., 'data.access_token')
     * @param {string} modelName - For error logging context
     */
    async _encryptFieldPath(document, fieldPath, modelName) {
        // Parse field path
        const parts = fieldPath.split('.');

        // Navigate to parent object
        let current = document;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                // Path doesn't exist, nothing to encrypt
                return;
            }
            current = current[parts[i]];
        }

        // Get field name and value
        const fieldName = parts[parts.length - 1];
        const value = current[fieldName];

        // Skip if already encrypted or empty
        if (!value || this._isEncryptedValue(value)) {
            return;
        }

        try {
            // Convert to string if needed
            const stringValue = typeof value === 'string'
                ? value
                : JSON.stringify(value);

            // Encrypt using Cryptor
            current[fieldName] = await this.cryptor.encrypt(stringValue);
        } catch (error) {
            console.error(`[DocumentDBEncryptionService] Failed to encrypt ${modelName}.${fieldPath}:`, error.message);
            throw error;
        }
    }

    /**
     * Decrypt a specific field path in a document (handles nested fields).
     *
     * @private
     * @param {Object} document - Document to modify (mutated in place)
     * @param {string} fieldPath - Field path from schema registry
     * @param {string} modelName - For error logging context
     */
    async _decryptFieldPath(document, fieldPath, modelName) {
        // Parse field path
        const parts = fieldPath.split('.');

        // Navigate to parent object
        let current = document;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                // Path doesn't exist, nothing to decrypt
                return;
            }
            current = current[parts[i]];
        }

        // Get field name and encrypted value
        const fieldName = parts[parts.length - 1];
        const encryptedValue = current[fieldName];

        // Skip if not encrypted format
        if (!encryptedValue || !this._isEncryptedValue(encryptedValue)) {
            return;
        }

        try {
            // Decrypt using Cryptor
            const decryptedString = await this.cryptor.decrypt(encryptedValue);

            // Try to parse as JSON (for objects/arrays)
            try {
                current[fieldName] = JSON.parse(decryptedString);
            } catch {
                // Not JSON, return as string
                current[fieldName] = decryptedString;
            }
        } catch (error) {
            const errorContext = {
                modelName,
                fieldPath,
                encryptedValuePrefix: encryptedValue.substring(0, 20),
                errorMessage: error.message
            };

            console.error(
                `[DocumentDBEncryptionService] Failed to decrypt ${modelName}.${fieldPath}:`,
                JSON.stringify(errorContext)
            );

            // Throw error to fail fast - don't silently corrupt data
            throw new Error(`Decryption failed for ${modelName}.${fieldPath}: ${error.message}`);
        }
    }

    /**
     * Check if a value is in encrypted format.
     *
     * Encrypted format: "keyId:iv:cipher:encKey" (envelope encryption)
     * All parts are base64-encoded strings.
     *
     * @private
     * @param {any} value - Value to check
     * @returns {boolean} - True if value is encrypted
     *
     * @example
     * _isEncryptedValue("plain_text")  // false
     * _isEncryptedValue("YWVzLWtleS0x:TXlJVkhlcmU=:QWN0dWFsQ2lwaGVy:RW5jcnlwdGVk")  // true
     * _isEncryptedValue(null)  // false
     * _isEncryptedValue({})  // false
     */
    _isEncryptedValue(value) {
        // Must be string
        if (typeof value !== 'string') {
            return false;
        }

        // Must have exactly 4 colon-separated parts
        const parts = value.split(':');
        if (parts.length !== 4) {
            return false;
        }

        // Enhanced validation: check for base64 pattern
        // This prevents false positives on URLs, connection strings, etc.
        const base64Pattern = /^[A-Za-z0-9+/=]+$/;

        // All parts should be base64-encoded
        if (!parts.every(part => base64Pattern.test(part))) {
            return false;
        }

        // Encrypted values should be sufficiently long to be valid
        // Real encrypted values from Cryptor are always >50 chars due to envelope encryption format:
        // - keyId (base64): ~12 chars minimum
        // - iv (base64): ~24 chars for 16-byte IV
        // - ciphertext (base64): varies, minimum ~16 chars for small values
        // - encryptedKey (base64): ~44 chars for 32-byte data key
        // Total minimum: ~96 chars, so 50 is a safe lower bound
        // This prevents false positives on non-encrypted strings that happen to have 4 colons
        if (value.length < 50) {
            return false;
        }

        return true;
    }
}

module.exports = { DocumentDBEncryptionService };
