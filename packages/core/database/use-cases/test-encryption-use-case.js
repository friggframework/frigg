/**
 * Use Case for testing encryption functionality.
 * Contains business logic for verifying that encryption and decryption work correctly.
 *
 * Follows DDD/Hexagonal Architecture:
 * - Application Layer (this use case)
 * - Depends on Infrastructure Layer (HealthCheckRepository)
 */
class TestEncryptionUseCase {
    /**
     * @param {Object} params
     * @param {import('../health-check-repository-interface').HealthCheckRepositoryInterface} params.healthCheckRepository
     */
    constructor({ healthCheckRepository }) {
        this.repository = healthCheckRepository;
    }

    /**
     * Execute encryption test
     * Orchestrates the full encryption test workflow using Prisma
     * @returns {Promise<Object>} Test results with status and details
     */
    async execute() {
        const testData = {
            testSecret: 'This is a secret value that should be encrypted',
            normalField: 'This is a normal field that should not be encrypted',
            nestedSecret: {
                value: 'This is a nested secret that should be encrypted',
            },
        };

        const credentialData = this._mapTestDataToCredential(testData);

        const credential = await this._withTimeout(
            this.repository.createCredential(credentialData),
            5000,
            'Save operation timed out'
        );

        try {
            const retrievedCredential = await this._withTimeout(
                this.repository.findCredentialById(credential.id),
                5000,
                'Find operation timed out'
            );

            const retrievedTestData =
                this._mapCredentialToTestData(retrievedCredential);
            const decryptionWorks = this._verifyDecryption(
                retrievedTestData,
                testData
            );

            const rawCredential = await this._withTimeout(
                this.repository.getRawCredentialById(credential.id),
                5000,
                'Database verification timed out'
            );

            const rawTestData = this._mapRawCredentialToTestData(rawCredential);
            const encryptionResults = this._verifyEncryptionInDatabase(
                rawTestData,
                testData
            );

            return this._evaluateEncryptionResults(
                decryptionWorks,
                encryptionResults
            );
        } finally {
            await this._withTimeout(
                this.repository.deleteCredential(credential.id),
                5000,
                'Delete operation timed out'
            );
        }
    }

    /**
     * Map test data format to Credential model format
     * @param {Object} testData - Test data with testSecret, normalField, nestedSecret
     * @returns {Object} Credential data structure
     * @private
     */
    _mapTestDataToCredential(testData) {
        return {
            user_id: 'test-encryption-user',
            entity_id: 'test-encryption-entity',
            data: {
                access_token: testData.testSecret,
                refresh_token: testData.nestedSecret?.value,
                domain: testData.normalField,
            },
        };
    }

    /**
     * Map Credential model format to test data format
     * @param {Object} credential - Credential from database
     * @returns {Object} Test data format
     * @private
     */
    _mapCredentialToTestData(credential) {
        if (!credential) {
            return null;
        }

        return {
            id: credential.id,
            testSecret: credential.data.access_token,
            normalField: credential.data.domain,
            nestedSecret: {
                value: credential.data.refresh_token,
            },
        };
    }

    /**
     * Map raw Credential data to test data format
     * @param {Object} rawCredential - Raw credential from database
     * @returns {Object} Test data format with raw encrypted values
     * @private
     */
    _mapRawCredentialToTestData(rawCredential) {
        if (!rawCredential) {
            return null;
        }

        return {
            testSecret: rawCredential.data?.access_token,
            normalField: rawCredential.data?.domain,
            nestedSecret: {
                value: rawCredential.data?.refresh_token,
            },
        };
    }

    /**
     * Verify that a document was decrypted correctly
     * @param {Object} retrievedDoc - Document retrieved from database
     * @param {Object} originalData - Original unencrypted data
     * @returns {boolean} True if decryption worked correctly
     * @private
     */
    _verifyDecryption(retrievedDoc, originalData) {
        return (
            retrievedDoc &&
            retrievedDoc.testSecret === originalData.testSecret &&
            retrievedDoc.normalField === originalData.normalField &&
            retrievedDoc.nestedSecret?.value === originalData.nestedSecret.value
        );
    }

    /**
     * Verify that data was encrypted in the database
     * Business rule: Encrypted fields should contain ':' and differ from original
     * @param {Object} rawDoc - Raw document from database
     * @param {Object} originalData - Original unencrypted data
     * @returns {Object} Encryption verification results
     * @private
     */
    _verifyEncryptionInDatabase(rawDoc, originalData) {
        const secretIsEncrypted =
            rawDoc &&
            typeof rawDoc.testSecret === 'string' &&
            rawDoc.testSecret.includes(':') &&
            rawDoc.testSecret !== originalData.testSecret;

        const nestedIsEncrypted =
            rawDoc?.nestedSecret?.value &&
            typeof rawDoc.nestedSecret.value === 'string' &&
            rawDoc.nestedSecret.value.includes(':') &&
            rawDoc.nestedSecret.value !== originalData.nestedSecret.value;

        const normalNotEncrypted =
            rawDoc && rawDoc.normalField === originalData.normalField;

        return {
            secretIsEncrypted,
            nestedIsEncrypted,
            normalNotEncrypted,
        };
    }

    /**
     * Evaluate encryption test results
     * Business logic for determining if encryption is healthy
     * @param {boolean} decryptionWorks - Whether decryption succeeded
     * @param {Object} encryptionResults - Encryption verification results
     * @returns {Object} Test status and result message
     * @private
     */
    _evaluateEncryptionResults(decryptionWorks, encryptionResults) {
        const { secretIsEncrypted, nestedIsEncrypted, normalNotEncrypted } =
            encryptionResults;

        if (
            decryptionWorks &&
            secretIsEncrypted &&
            nestedIsEncrypted &&
            normalNotEncrypted
        ) {
            return {
                status: 'enabled',
                testResult:
                    'Encryption and decryption verified successfully',
                encryptionWorks: true,
            };
        }

        if (decryptionWorks && (!secretIsEncrypted || !nestedIsEncrypted)) {
            return {
                status: 'unhealthy',
                testResult: 'Fields are not being encrypted in database',
                encryptionWorks: false,
            };
        }

        if (decryptionWorks && !normalNotEncrypted) {
            return {
                status: 'unhealthy',
                testResult: 'Normal fields are being incorrectly encrypted',
                encryptionWorks: false,
            };
        }

        return {
            status: 'unhealthy',
            testResult: 'Decryption failed or data mismatch',
            encryptionWorks: false,
        };
    }

    /**
     * Execute promise with timeout
     * @param {Promise} promise - Promise to execute
     * @param {number} ms - Timeout in milliseconds
     * @param {string} errorMessage - Error message for timeout
     * @returns {Promise} Promise that rejects on timeout
     * @private
     */
    _withTimeout(promise, ms, errorMessage) {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(errorMessage)), ms)
            ),
        ]);
    }
}

module.exports = { TestEncryptionUseCase };