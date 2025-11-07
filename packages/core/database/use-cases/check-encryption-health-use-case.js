const { isDocumentDB } = require('../utils/documentdb-compatibility');

class CheckEncryptionHealthUseCase {
    constructor({ testEncryptionUseCase }) {
        this.testEncryptionUseCase = testEncryptionUseCase;
    }

    async execute() {
        const config = this._getEncryptionConfiguration();
        
        // DocumentDB doesn't support $$REMOVE operator used by Prisma
        // Skip Prisma-based encryption test and do KMS-only validation
        if (isDocumentDB()) {
            return this._executeDocumentDBCompatibleTest(config);
        }

        if (config.isBypassed || config.mode === 'none') {
            const testResult = config.isBypassed
                ? 'Encryption bypassed for this stage'
                : 'No encryption keys configured';

            return {
                status: 'disabled',
                mode: config.mode,
                bypassed: config.isBypassed,
                stage: config.stage,
                testResult,
                encryptionWorks: false,
                debug: {
                    hasKMS: config.hasKMS,
                    hasAES: config.hasAES,
                },
            };
        }

        try {
            const testResults = await this.testEncryptionUseCase.execute();

            return {
                ...testResults,
                mode: config.mode,
                bypassed: config.isBypassed,
                stage: config.stage,
                debug: {
                    hasKMS: config.hasKMS,
                    hasAES: config.hasAES,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                mode: config.mode,
                bypassed: config.isBypassed,
                stage: config.stage,
                testResult: `Encryption test failed: ${error.message}`,
                encryptionWorks: false,
                debug: {
                    hasKMS: config.hasKMS,
                    hasAES: config.hasAES,
                },
            };
        }
    }

    /**
     * DocumentDB-compatible encryption test
     * Skips Prisma operations (which use $$REMOVE) and tests KMS directly
     */
    async _executeDocumentDBCompatibleTest(config) {
        if (config.isBypassed || config.mode === 'none') {
            return {
                status: 'disabled',
                mode: config.mode,
                bypassed: config.isBypassed,
                stage: config.stage,
                testResult: config.isBypassed
                    ? 'Encryption bypassed for this stage'
                    : 'No encryption keys configured',
                encryptionWorks: false,
                documentDBMode: true,
                debug: {
                    hasKMS: config.hasKMS,
                    hasAES: config.hasAES,
                },
            };
        }

        try {
            // Test KMS encryption/decryption directly without Prisma
            const { Cryptor } = require('../../encrypt/Cryptor');
            const cryptor = new Cryptor({
                shouldUseAws: config.mode === 'kms',
            });

            const testValue = 'DocumentDB encryption test value';
            const encrypted = await cryptor.encrypt(testValue);
            const decrypted = await cryptor.decrypt(encrypted);

            const encryptionWorks = decrypted === testValue;

            return {
                status: encryptionWorks ? 'healthy' : 'unhealthy',
                mode: config.mode,
                bypassed: config.isBypassed,
                stage: config.stage,
                testResult: encryptionWorks
                    ? 'KMS encryption/decryption verified (DocumentDB-compatible test)'
                    : 'KMS encryption/decryption failed',
                encryptionWorks,
                documentDBMode: true,
                debug: {
                    hasKMS: config.hasKMS,
                    hasAES: config.hasAES,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                mode: config.mode,
                bypassed: config.isBypassed,
                stage: config.stage,
                testResult: `DocumentDB-compatible encryption test failed: ${error.message}`,
                encryptionWorks: false,
                documentDBMode: true,
                debug: {
                    hasKMS: config.hasKMS,
                    hasAES: config.hasAES,
                },
            };
        }
    }

    _getEncryptionConfiguration() {
        const { STAGE, BYPASS_ENCRYPTION_STAGE, KMS_KEY_ARN, AES_KEY_ID } =
            process.env;

        const defaultBypassStages = ['dev', 'test', 'local'];
        const useEnv = BYPASS_ENCRYPTION_STAGE !== undefined;
        const bypassStages = useEnv
            ? BYPASS_ENCRYPTION_STAGE.split(',').map((s) => s.trim())
            : defaultBypassStages;

        const isBypassed = bypassStages.includes(STAGE);
        const hasAES = AES_KEY_ID && AES_KEY_ID.trim() !== '';
        const hasKMS = KMS_KEY_ARN && KMS_KEY_ARN.trim() !== '';
        // Prefer KMS over AES when both are configured (KMS is more secure)
        const mode = hasKMS ? 'kms' : hasAES ? 'aes' : 'none';

        return {
            stage: STAGE || null,
            isBypassed,
            hasAES,
            hasKMS,
            mode,
        };
    }
}

module.exports = { CheckEncryptionHealthUseCase };
