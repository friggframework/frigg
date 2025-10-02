class CheckEncryptionHealthUseCase {
    constructor({ testEncryptionUseCase }) {
        this.testEncryptionUseCase = testEncryptionUseCase;
    }

    async execute() {
        const config = this._getEncryptionConfiguration();

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
        const hasKMS = KMS_KEY_ARN && KMS_KEY_ARN.trim() !== '' && !hasAES;
        const mode = hasAES ? 'aes' : hasKMS ? 'kms' : 'none';

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
