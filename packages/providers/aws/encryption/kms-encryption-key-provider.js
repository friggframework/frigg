/**
 * KMS Encryption Key Provider (Adapter)
 *
 * AWS KMS implementation of EncryptionKeyProviderInterface.
 * Uses AWS Key Management Service for envelope encryption.
 *
 * Environment Variables:
 * - KMS_KEY_ARN: ARN of the KMS Customer Master Key
 * - AWS_REGION: AWS region for KMS client
 */

const {
    EncryptionKeyProviderInterface,
} = require('@friggframework/core/encrypt/encryption-key-provider-interface');

let _kmsClient = null;

function getKmsClient() {
    if (!_kmsClient) {
        const { KMSClient } = require('@aws-sdk/client-kms');
        _kmsClient = new KMSClient({});
    }
    return _kmsClient;
}

class KmsEncryptionKeyProvider extends EncryptionKeyProviderInterface {
    /**
     * Generate a data encryption key via KMS GenerateDataKeyCommand
     *
     * KMS generates the DEK and returns both plaintext and encrypted forms.
     * The master key never leaves KMS.
     *
     * @returns {Promise<{keyId: string, encryptedKey: string, plaintext: Buffer}>}
     */
    async generateDataKey() {
        const { GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
        const command = new GenerateDataKeyCommand({
            KeyId: process.env.KMS_KEY_ARN,
            KeySpec: 'AES_256',
        });
        const dataKey = await getKmsClient().send(command);

        const keyId = Buffer.from(dataKey.KeyId).toString('base64');
        const encryptedKey = Buffer.from(dataKey.CiphertextBlob).toString(
            'base64'
        );
        const plaintext = dataKey.Plaintext;
        return { keyId, encryptedKey, plaintext };
    }

    /**
     * Decrypt a data encryption key via KMS DecryptCommand
     *
     * @param {string} keyId - KMS key identifier
     * @param {Buffer} encryptedKey - Encrypted DEK ciphertext blob
     * @returns {Promise<Buffer>} Decrypted plaintext DEK
     */
    async decryptDataKey(keyId, encryptedKey) {
        const { DecryptCommand } = require('@aws-sdk/client-kms');
        const command = new DecryptCommand({
            KeyId: keyId,
            CiphertextBlob: encryptedKey,
        });
        const dataKey = await getKmsClient().send(command);

        return dataKey.Plaintext;
    }
}

module.exports = { KmsEncryptionKeyProvider };
