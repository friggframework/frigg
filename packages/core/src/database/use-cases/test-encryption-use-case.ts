import { HealthCheckRepositoryInterface } from '../repositories/health-check-repository-interface';

export interface EncryptionTestResult {
    status: 'enabled' | 'unhealthy';
    testResult: string;
    encryptionWorks: boolean;
}

interface TestData {
    testSecret: string;
    normalField: string;
    nestedSecret: { value: string };
}

interface RetrievedTestData extends TestData {
    id?: string;
}

interface EncryptionVerificationResults {
    secretIsEncrypted: boolean;
    nestedIsEncrypted: boolean;
    normalNotEncrypted: boolean;
}

export class TestEncryptionUseCase {
    private readonly repository: HealthCheckRepositoryInterface;

    constructor({ healthCheckRepository }: { healthCheckRepository: HealthCheckRepositoryInterface }) {
        this.repository = healthCheckRepository;
    }

    async execute(): Promise<EncryptionTestResult> {
        const testData: TestData = {
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
                this.repository.findCredentialById(credential.id as string),
                5000,
                'Find operation timed out'
            );

            const retrievedTestData = this._mapCredentialToTestData(retrievedCredential);
            const decryptionWorks = this._verifyDecryption(retrievedTestData, testData);

            const rawCredential = await this._withTimeout(
                this.repository.getRawCredentialById(credential.id as string),
                5000,
                'Database verification timed out'
            );

            const rawTestData = this._mapRawCredentialToTestData(rawCredential);
            const encryptionResults = this._verifyEncryptionInDatabase(rawTestData, testData);

            return this._evaluateEncryptionResults(decryptionWorks, encryptionResults);
        } finally {
            await this._withTimeout(
                this.repository.deleteCredential(credential.id as string),
                5000,
                'Delete operation timed out'
            );
        }
    }

    private _mapTestDataToCredential(testData: TestData): Record<string, unknown> {
        return {
            externalId: 'test-encryption-entity',
            data: {
                access_token: testData.testSecret,
                refresh_token: testData.nestedSecret?.value,
                domain: testData.normalField,
            },
        };
    }

    private _mapCredentialToTestData(credential: Record<string, unknown> | null): RetrievedTestData | null {
        if (!credential) {
            return null;
        }

        const data = credential.data as Record<string, unknown>;
        return {
            id: credential.id as string,
            testSecret: data.access_token as string,
            normalField: data.domain as string,
            nestedSecret: {
                value: data.refresh_token as string,
            },
        };
    }

    private _mapRawCredentialToTestData(rawCredential: Record<string, unknown> | null): RetrievedTestData | null {
        if (!rawCredential) {
            return null;
        }

        const data = rawCredential.data as Record<string, unknown> | undefined;
        return {
            testSecret: data?.access_token as string,
            normalField: data?.domain as string,
            nestedSecret: {
                value: data?.refresh_token as string,
            },
        };
    }

    private _verifyDecryption(retrievedDoc: RetrievedTestData | null, originalData: TestData): boolean {
        return (
            retrievedDoc !== null &&
            retrievedDoc.testSecret === originalData.testSecret &&
            retrievedDoc.normalField === originalData.normalField &&
            retrievedDoc.nestedSecret?.value === originalData.nestedSecret.value
        );
    }

    private _verifyEncryptionInDatabase(rawDoc: RetrievedTestData | null, originalData: TestData): EncryptionVerificationResults {
        const secretIsEncrypted =
            rawDoc !== null &&
            typeof rawDoc.testSecret === 'string' &&
            rawDoc.testSecret.includes(':') &&
            rawDoc.testSecret !== originalData.testSecret;

        const nestedIsEncrypted =
            rawDoc?.nestedSecret?.value !== undefined &&
            typeof rawDoc.nestedSecret.value === 'string' &&
            rawDoc.nestedSecret.value.includes(':') &&
            rawDoc.nestedSecret.value !== originalData.nestedSecret.value;

        const normalNotEncrypted =
            rawDoc !== null && rawDoc.normalField === originalData.normalField;

        return {
            secretIsEncrypted,
            nestedIsEncrypted,
            normalNotEncrypted,
        };
    }

    private _evaluateEncryptionResults(
        decryptionWorks: boolean,
        encryptionResults: EncryptionVerificationResults
    ): EncryptionTestResult {
        const { secretIsEncrypted, nestedIsEncrypted, normalNotEncrypted } = encryptionResults;

        if (decryptionWorks && secretIsEncrypted && nestedIsEncrypted && normalNotEncrypted) {
            return {
                status: 'enabled',
                testResult: 'Encryption and decryption verified successfully',
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

    private _withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(errorMessage)), ms)
            ),
        ]);
    }
}
