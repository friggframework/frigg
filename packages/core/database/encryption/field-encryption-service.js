/**
 * Field Encryption Service
 *
 * Infrastructure layer service that orchestrates field-level encryption/decryption.
 * Handles nested JSON paths (e.g., 'data.access_token') and bulk operations.
 */
class FieldEncryptionService {
    constructor({ cryptor, schema }) {
        if (!cryptor) {
            throw new Error('Cryptor instance required');
        }
        if (!schema || typeof schema.getEncryptedFields !== 'function') {
            throw new Error('Schema with getEncryptedFields method required');
        }

        this.cryptor = cryptor;
        this.schema = schema;
    }

    /**
     * Resolve the field paths to encrypt on write. Prefers
     * `schema.getFieldsToEncryptOnWrite` (which respects app opt-outs); falls
     * back to `schema.getEncryptedFields` for backwards compatibility with
     * older schema adapters.
     * @private
     */
    _getWriteFields(modelName) {
        if (typeof this.schema.getFieldsToEncryptOnWrite === 'function') {
            return this.schema.getFieldsToEncryptOnWrite(modelName);
        }
        return this.schema.getEncryptedFields(modelName);
    }

    /**
     * Resolve the field paths to attempt decryption on read. Prefers
     * `schema.getFieldsToDecryptOnRead` (which IGNORES opt-outs so legacy
     * encrypted rows still deserialize); falls back to
     * `schema.getEncryptedFields` for backwards compatibility.
     * @private
     */
    _getReadFields(modelName) {
        if (typeof this.schema.getFieldsToDecryptOnRead === 'function') {
            return this.schema.getFieldsToDecryptOnRead(modelName);
        }
        return this.schema.getEncryptedFields(modelName);
    }

    async encryptFields(modelName, document) {
        if (!document || typeof document !== 'object') {
            return document;
        }

        const fields = this._getWriteFields(modelName);
        if (fields.length === 0) {
            return document;
        }

        const encrypted = this._deepClone(document);

        // Parallelize encryption of multiple fields
        const encryptionPromises = fields.map(async (fieldPath) => {
            const value = this._getNestedValue(encrypted, fieldPath);

            if (this._shouldEncrypt(value)) {
                const serializedValue = this._serializeForEncryption(value);
                const encryptedValue = await this.cryptor.encrypt(serializedValue);
                return { fieldPath, encryptedValue };
            }
            return null;
        });

        const results = await Promise.all(encryptionPromises);

        // Apply encrypted values
        for (const result of results) {
            if (result) {
                this._setNestedValue(encrypted, result.fieldPath, result.encryptedValue);
            }
        }

        return encrypted;
    }

    async decryptFields(modelName, document) {
        if (!document || typeof document !== 'object') {
            return document;
        }

        const fields = this._getReadFields(modelName);
        if (fields.length === 0) {
            return document;
        }

        const decrypted = this._deepClone(document);

        // Parallelize decryption of multiple fields
        const decryptionPromises = fields.map(async (fieldPath) => {
            const value = this._getNestedValue(decrypted, fieldPath);

            if (this._isEncrypted(value)) {
                const decryptedValue = await this.cryptor.decrypt(value);
                const deserializedValue = this._deserializeAfterDecryption(decryptedValue);
                return { fieldPath, decryptedValue: deserializedValue };
            }
            return null;
        });

        const results = await Promise.all(decryptionPromises);

        // Apply decrypted values
        for (const result of results) {
            if (result) {
                this._setNestedValue(decrypted, result.fieldPath, result.decryptedValue);
            }
        }

        return decrypted;
    }

    async encryptFieldsInBulk(modelName, documents) {
        if (!Array.isArray(documents)) {
            return documents;
        }

        return Promise.all(
            documents.map((doc) => this.encryptFields(modelName, doc))
        );
    }

    async decryptFieldsInBulk(modelName, documents) {
        if (!Array.isArray(documents)) {
            return documents;
        }

        return Promise.all(
            documents.map((doc) => this.decryptFields(modelName, doc))
        );
    }

    _shouldEncrypt(value) {
        return (
            value !== null &&
            value !== undefined &&
            value !== '' &&
            !this._isEncrypted(value)
        );
    }

    _isEncrypted(value) {
        if (typeof value !== 'string') {
            return false;
        }

        const parts = value.split(':');
        return parts.length >= 4;
    }

    _getNestedValue(obj, path) {
        if (!obj || !path) {
            return undefined;
        }

        return path.split('.').reduce((current, key) => {
            return current?.[key];
        }, obj);
    }

    _setNestedValue(obj, path, value) {
        if (!obj || !path) {
            return;
        }

        const keys = path.split('.');
        const lastKey = keys.pop();

        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);

        target[lastKey] = value;
    }

    _deepClone(obj) {
        // Use structuredClone (Node.js 17+) for better performance
        // Falls back to custom implementation for older Node versions
        if (typeof structuredClone !== 'undefined') {
            try {
                return structuredClone(obj);
            } catch {
                // Fall through to custom implementation
            }
        }

        // Custom fallback for older environments
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this._deepClone(item));
        }

        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this._deepClone(obj[key]);
            }
        }

        return cloned;
    }

    /**
     * Serialize a value for encryption
     * Objects/arrays are JSON stringified, primitives are converted to strings
     * @private
     */
    _serializeForEncryption(value) {
        if (typeof value === 'object' && value !== null) {
            // JSON.stringify for objects and arrays
            return JSON.stringify(value);
        }
        // For primitives (string, number, boolean), convert to string
        return String(value);
    }

    /**
     * Deserialize a value after decryption
     * Attempts to parse as JSON, returns string if parsing fails
     * @private
     */
    _deserializeAfterDecryption(value) {
        if (typeof value !== 'string') {
            return value;
        }

        // Try to parse as JSON
        try {
            return JSON.parse(value);
        } catch {
            // Not valid JSON, return as-is (likely was a plain string field)
            return value;
        }
    }
}

module.exports = { FieldEncryptionService };
