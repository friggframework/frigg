const {
    resolveEncryptionConfig,
    OPT_OUT_VAR,
} = require('../encryption/encryption-config');

/**
 * Reports whether field-level encryption is on and working, using the same
 * rule the Prisma client applies at startup (encryption/encryption-config.js).
 */
class CheckEncryptionHealthUseCase {
    constructor({ testEncryptionUseCase }) {
        this.testEncryptionUseCase = testEncryptionUseCase;
    }

    async execute() {
        const config = this._getEncryptionConfiguration();
        const summary = {
            mode: config.mode,
            bypassed: config.bypassed,
            optedOut: config.optedOut,
            runtime: config.runtime,
            stage: config.stage,
            debug: {
                hasKMS: config.hasKMS,
                hasAES: config.hasAES,
            },
        };

        if (config.error) {
            return {
                status: 'unhealthy',
                ...summary,
                testResult: config.error,
                encryptionWorks: false,
            };
        }

        if (!config.enabled) {
            return {
                status: 'disabled',
                ...summary,
                testResult: this._disabledReason(config),
                encryptionWorks: false,
            };
        }

        try {
            const testResults = await this.testEncryptionUseCase.execute();
            return { ...testResults, ...summary };
        } catch (error) {
            return {
                status: 'unhealthy',
                ...summary,
                testResult: `Encryption test failed: ${error.message}`,
                encryptionWorks: false,
            };
        }
    }

    _disabledReason(config) {
        if (config.bypassed) return 'Encryption bypassed for this stage';
        if (config.optedOut) {
            return `Encryption explicitly disabled (${OPT_OUT_VAR}=true); sensitive fields are stored in plaintext`;
        }
        return 'No encryption keys configured';
    }

    _getEncryptionConfiguration() {
        const config = resolveEncryptionConfig(process.env);
        return { ...config, stage: process.env.STAGE || null };
    }
}

module.exports = { CheckEncryptionHealthUseCase };
