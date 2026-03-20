import { Cryptor } from '../encrypt';
import { getEncryptedFields, loadCustomEncryptionSchema } from './encryption/encryption-schema-registry';

interface DocumentDBEncryptionServiceOptions {
    cryptor?: Cryptor | null;
}

export class DocumentDBEncryptionService {
    private cryptor: Cryptor | null;
    private enabled: boolean;

    constructor({ cryptor = null }: DocumentDBEncryptionServiceOptions = {}) {
        if (cryptor) {
            this.cryptor = cryptor;
            this.enabled = true;
        } else {
            this.cryptor = null;
            this.enabled = false;
            this._initializeCryptor();
        }
    }

    private _initializeCryptor(): void {
        loadCustomEncryptionSchema();

        const stage = process.env.STAGE || process.env.NODE_ENV || 'development';
        const bypassEncryption = ['dev', 'test', 'local'].includes(stage.toLowerCase());

        if (bypassEncryption) {
            this.cryptor = null;
            this.enabled = false;
            return;
        }

        const hasKMS = !!process.env.KMS_KEY_ARN?.trim();
        const hasAES = !!process.env.AES_KEY_ID?.trim();

        if (!hasKMS && !hasAES) {
            console.warn('[DocumentDBEncryptionService] No encryption keys configured. Encryption disabled.');
            this.cryptor = null;
            this.enabled = false;
            return;
        }

        const shouldUseAws = hasKMS;
        this.cryptor = new Cryptor({ shouldUseAws });
        this.enabled = true;
    }

    async encryptFields(modelName: string, document: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!this.enabled || !this.cryptor) {
            return document;
        }

        if (!document || typeof document !== 'object') {
            return document;
        }

        const encryptedFieldsConfig = getEncryptedFields(modelName);
        if (!encryptedFieldsConfig || encryptedFieldsConfig.length === 0) {
            return document;
        }

        const result = structuredClone(document);

        for (const fieldPath of encryptedFieldsConfig) {
            await this._encryptFieldPath(result, fieldPath, modelName);
        }

        return result;
    }

    async decryptFields(modelName: string, document: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!this.enabled || !this.cryptor) {
            return document;
        }

        if (!document || typeof document !== 'object') {
            return document;
        }

        const encryptedFieldsConfig = getEncryptedFields(modelName);
        if (!encryptedFieldsConfig || encryptedFieldsConfig.length === 0) {
            return document;
        }

        const result = structuredClone(document);

        for (const fieldPath of encryptedFieldsConfig) {
            await this._decryptFieldPath(result, fieldPath, modelName);
        }

        return result;
    }

    private async _encryptFieldPath(document: Record<string, unknown>, fieldPath: string, modelName: string): Promise<void> {
        const parts = fieldPath.split('.');

        let current: Record<string, unknown> = document;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                return;
            }
            current = current[parts[i]] as Record<string, unknown>;
        }

        const fieldName = parts.at(-1)!;
        const value = current[fieldName];

        if (!value || this._isEncryptedValue(value)) {
            return;
        }

        try {
            const stringValue = typeof value === 'string'
                ? value
                : JSON.stringify(value);

            current[fieldName] = await this.cryptor!.encrypt(stringValue);
        } catch (error) {
            console.error(`[DocumentDBEncryptionService] Failed to encrypt ${modelName}.${fieldPath}:`, (error as Error).message);
            throw error;
        }
    }

    private async _decryptFieldPath(document: Record<string, unknown>, fieldPath: string, modelName: string): Promise<void> {
        const parts = fieldPath.split('.');

        let current: Record<string, unknown> = document;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                return;
            }
            current = current[parts[i]] as Record<string, unknown>;
        }

        const fieldName = parts.at(-1)!;
        const encryptedValue = current[fieldName];

        if (!encryptedValue || !this._isEncryptedValue(encryptedValue)) {
            return;
        }

        try {
            const decryptedString = await this.cryptor!.decrypt(encryptedValue as string);

            try {
                current[fieldName] = JSON.parse(decryptedString);
            } catch {
                current[fieldName] = decryptedString;
            }
        } catch (error) {
            const errorContext = {
                modelName,
                fieldPath,
                encryptedValuePrefix: (encryptedValue as string).substring(0, 20),
                errorMessage: (error as Error).message,
            };

            console.error(
                `[DocumentDBEncryptionService] Failed to decrypt ${modelName}.${fieldPath}:`,
                JSON.stringify(errorContext)
            );

            throw new Error(`Decryption failed for ${modelName}.${fieldPath}: ${(error as Error).message}`);
        }
    }

    private _isEncryptedValue(value: unknown): boolean {
        if (typeof value !== 'string') {
            return false;
        }

        const parts = value.split(':');
        if (parts.length !== 4) {
            return false;
        }

        const base64Pattern = /^[A-Za-z0-9+/=]+$/;

        if (!parts.every(part => base64Pattern.test(part))) {
            return false;
        }

        if (value.length < 50) {
            return false;
        }

        return true;
    }
}
