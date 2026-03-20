import crypto from 'node:crypto';
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';
import * as aes from './aes';

export interface CryptorOptions {
    shouldUseAws: boolean;
}

interface DataKey {
    keyId: string;
    encryptedKey: string;
    plaintext: crypto.CipherKey;
}

export class Cryptor {
    private readonly shouldUseAws: boolean;

    constructor({ shouldUseAws }: CryptorOptions) {
        this.shouldUseAws = shouldUseAws;
    }

    async generateDataKey(): Promise<DataKey> {
        if (this.shouldUseAws) {
            const kmsClient = new KMSClient({});
            const command = new GenerateDataKeyCommand({
                KeyId: process.env.KMS_KEY_ARN,
                KeySpec: 'AES_256',
            });
            const dataKey = await kmsClient.send(command);

            const keyId = Buffer.from(dataKey.KeyId!).toString('base64');
            const encryptedKey = Buffer.from(dataKey.CiphertextBlob!).toString('base64');
            const plaintext = dataKey.Plaintext!;
            return { keyId, encryptedKey, plaintext };
        }

        const { AES_KEY, AES_KEY_ID } = process.env;
        const randomKey = crypto.randomBytes(32).toString('hex').slice(0, 32);

        return {
            keyId: Buffer.from(AES_KEY_ID!).toString('base64'),
            encryptedKey: Buffer.from(aes.encrypt(randomKey, AES_KEY!)).toString('base64'),
            plaintext: randomKey,
        };
    }

    getKeyFromEnvironment(keyId: string): string {
        const availableKeys: Record<string, string | undefined> = {
            [process.env.AES_KEY_ID!]: process.env.AES_KEY,
            [process.env.DEPRECATED_AES_KEY_ID!]: process.env.DEPRECATED_AES_KEY,
        };

        const key = availableKeys[keyId];

        if (!key) {
            throw new Error('Encryption key not found');
        }

        return key;
    }

    async decryptDataKey(keyId: string, encryptedKey: string | Uint8Array): Promise<crypto.CipherKey> {
        if (this.shouldUseAws) {
            const kmsClient = new KMSClient({});
            const command = new DecryptCommand({
                KeyId: keyId,
                CiphertextBlob: encryptedKey as Uint8Array,
            });
            const dataKey = await kmsClient.send(command);

            return Buffer.from(dataKey.Plaintext!);
        }

        const key = this.getKeyFromEnvironment(keyId);
        return aes.decrypt(encryptedKey as string, key);
    }

    async encrypt(text: string): Promise<string> {
        const { keyId, encryptedKey, plaintext } = await this.generateDataKey();
        const encryptedText = aes.encrypt(text, plaintext);
        return `${keyId}:${encryptedText}:${encryptedKey}`;
    }

    async decrypt(text: string): Promise<string> {
        const split = text.split(':');
        const keyId = Buffer.from(split[0], 'base64').toString();
        const encryptedText = `${split[1]}:${split[2]}`;
        const encryptedKey = Buffer.from(split[3], 'base64');
        const plaintext = await this.decryptDataKey(keyId, encryptedKey);
        return aes.decrypt(encryptedText, plaintext);
    }
}
