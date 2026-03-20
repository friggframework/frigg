/**
 * Field Encryption Service
 *
 * Infrastructure layer service that orchestrates field-level encryption/decryption.
 * Handles nested JSON paths (e.g., 'data.access_token') and bulk operations.
 */

import { Cryptor } from '../../encrypt';

export interface EncryptionSchemaProvider {
    getEncryptedFields(modelName: string): string[];
}

interface FieldEncryptionServiceOptions {
    cryptor: Cryptor;
    schema: EncryptionSchemaProvider;
}

export class FieldEncryptionService {
    private readonly cryptor: Cryptor;
    private readonly schema: EncryptionSchemaProvider;

    constructor({ cryptor, schema }: FieldEncryptionServiceOptions) {
        if (!cryptor) {
            throw new Error('Cryptor instance required');
        }
        if (!schema || typeof schema.getEncryptedFields !== 'function') {
            throw new Error('Schema with getEncryptedFields method required');
        }

        this.cryptor = cryptor;
        this.schema = schema;
    }

    async encryptFields(modelName: string, document: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!document || typeof document !== 'object') {
            return document;
        }

        const fields = this.schema.getEncryptedFields(modelName);
        if (fields.length === 0) {
            return document;
        }

        const encrypted = this._deepClone(document) as Record<string, unknown>;

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

        for (const result of results) {
            if (result) {
                this._setNestedValue(encrypted, result.fieldPath, result.encryptedValue);
            }
        }

        return encrypted;
    }

    async decryptFields(modelName: string, document: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!document || typeof document !== 'object') {
            return document;
        }

        const fields = this.schema.getEncryptedFields(modelName);
        if (fields.length === 0) {
            return document;
        }

        const decrypted = this._deepClone(document) as Record<string, unknown>;

        const decryptionPromises = fields.map(async (fieldPath) => {
            const value = this._getNestedValue(decrypted, fieldPath);

            if (this._isEncrypted(value)) {
                const decryptedValue = await this.cryptor.decrypt(value as string);
                const deserializedValue = this._deserializeAfterDecryption(decryptedValue);
                return { fieldPath, decryptedValue: deserializedValue };
            }
            return null;
        });

        const results = await Promise.all(decryptionPromises);

        for (const result of results) {
            if (result) {
                this._setNestedValue(decrypted, result.fieldPath, result.decryptedValue);
            }
        }

        return decrypted;
    }

    async encryptFieldsInBulk(modelName: string, documents: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
        if (!Array.isArray(documents)) {
            return documents;
        }
        return Promise.all(
            documents.map((doc) => this.encryptFields(modelName, doc))
        );
    }

    async decryptFieldsInBulk(modelName: string, documents: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
        if (!Array.isArray(documents)) {
            return documents;
        }
        return Promise.all(
            documents.map((doc) => this.decryptFields(modelName, doc))
        );
    }

    private _shouldEncrypt(value: unknown): boolean {
        return (
            value !== null &&
            value !== undefined &&
            value !== '' &&
            !this._isEncrypted(value)
        );
    }

    private _isEncrypted(value: unknown): boolean {
        if (typeof value !== 'string') {
            return false;
        }
        const parts = value.split(':');
        return parts.length >= 4;
    }

    private _getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        if (!obj || !path) {
            return undefined;
        }
        return path.split('.').reduce((current: unknown, key: string) => {
            return (current as Record<string, unknown>)?.[key];
        }, obj);
    }



    private _setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
        if (!obj || !path) {
            return;
        }

        const keys = path.split('.');
        const lastKey = keys.pop()!;

        const target = keys.reduce((current: Record<string, unknown>, key: string) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key] as Record<string, unknown>;
        }, obj);

        target[lastKey] = value;
    }

    private _deepClone(obj: unknown): unknown {
        if (typeof structuredClone !== 'undefined') {
            try {
                return structuredClone(obj);
            } catch {
                // Fall through to custom implementation
            }
        }

        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this._deepClone(item));
        }

        const cloned: Record<string, unknown> = {};
        for (const key in obj) {
            if (Object.hasOwn(obj, key)) {
                cloned[key] = this._deepClone((obj as Record<string, unknown>)[key]);
            }
        }

        return cloned;
    }

    private _serializeForEncryption(value: unknown): string {
        if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value);
        }
        return String(value);
    }

    private _deserializeAfterDecryption(value: string): unknown {
        if (typeof value !== 'string') {
            return value;
        }

        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
}