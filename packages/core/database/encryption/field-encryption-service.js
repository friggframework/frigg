/**
 * Field Encryption Service
 *
 * Infrastructure Layer - Encryption Orchestration
 *
 * Orchestrates field-level encryption/decryption using Cryptor adapter.
 * Handles nested JSON paths, bulk operations, and field detection.
 *
 * Purpose:
 * - Encrypt/decrypt specific fields in documents
 * - Handle nested JSON paths (e.g., 'data.access_token')
 * - Support bulk operations (arrays of documents)
 * - Integrate with Cryptor for actual encryption
 *
 * Hexagonal Architecture:
 * - Infrastructure Layer (adapter pattern)
 * - Uses Cryptor (external encryption service adapter)
 * - Used by Prisma Extension (database adapter)
 */

/**
 * Field Encryption Service
 * Handles encryption and decryption of specific fields in documents
 */
class FieldEncryptionService {
    /**
     * @param {Object} params
     * @param {import('../../encrypt/Cryptor').Cryptor} params.cryptor - Encryption adapter
     * @param {Object} params.schema - Schema registry with getEncryptedFields method
     */
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

    async encryptFields(modelName, document) {
        if (!document || typeof document !== 'object') {
            return document;
        }

        const fields = this.schema.getEncryptedFields(modelName);
        if (fields.length === 0) {
            return document;
        }

        const encrypted = this._deepClone(document);

        for (const fieldPath of fields) {
            const value = this._getNestedValue(encrypted, fieldPath);

            if (this._shouldEncrypt(value)) {
                const encryptedValue = await this.cryptor.encrypt(String(value));
                this._setNestedValue(encrypted, fieldPath, encryptedValue);
            }
        }

        return encrypted;
    }

    async decryptFields(modelName, document) {
        if (!document || typeof document !== 'object') {
            return document;
        }

        const fields = this.schema.getEncryptedFields(modelName);
        if (fields.length === 0) {
            return document;
        }

        const decrypted = this._deepClone(document);

        for (const fieldPath of fields) {
            const value = this._getNestedValue(decrypted, fieldPath);

            if (this._isEncrypted(value)) {
                const decryptedValue = await this.cryptor.decrypt(value);
                this._setNestedValue(decrypted, fieldPath, decryptedValue);
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
}

module.exports = { FieldEncryptionService };
