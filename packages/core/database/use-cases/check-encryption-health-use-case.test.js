/**
 * Tests for CheckEncryptionHealthUseCase
 * 
 * Tests encryption configuration detection and health checking
 */

const { CheckEncryptionHealthUseCase } = require('./check-encryption-health-use-case');

describe('CheckEncryptionHealthUseCase', () => {
    let originalEnv;

    beforeEach(() => {
        // Save original env
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        // Restore original env
        process.env = originalEnv;
    });

    describe('_getEncryptionConfiguration()', () => {
        it('should prefer KMS over AES when both are configured', async () => {
            process.env.STAGE = 'production';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123:key/abc';
            process.env.AES_KEY_ID = 'aes-key-123';
            process.env.AES_KEY = 'some-aes-key';

            const mockTestEncryption = {
                execute: jest.fn().mockResolvedValue({ success: true }),
            };

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: mockTestEncryption,
            });

            const result = await useCase.execute();

            expect(result.mode).toBe('kms'); // KMS should be preferred over AES
            expect(result.debug.hasKMS).toBe(true);
            expect(result.debug.hasAES).toBe(true);
        });

        it('should use AES when only AES is configured', async () => {
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'aes-key-123';
            process.env.AES_KEY = 'some-aes-key';
            delete process.env.KMS_KEY_ARN;

            const mockTestEncryption = {
                execute: jest.fn().mockResolvedValue({ status: 'healthy', encryptionWorks: true }),
            };

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: mockTestEncryption,
            });

            const result = await useCase.execute();

            expect(result.mode).toBe('aes');
            expect(result.status).toBe('healthy');
            expect(result.encryptionWorks).toBe(true);
        });

        it('should use KMS when only KMS is configured', async () => {
            process.env.STAGE = 'production';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123:key/abc';
            delete process.env.AES_KEY_ID;
            delete process.env.AES_KEY;

            const mockTestEncryption = {
                execute: jest.fn().mockResolvedValue({ status: 'healthy', encryptionWorks: true }),
            };

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: mockTestEncryption,
            });

            const result = await useCase.execute();

            expect(result.mode).toBe('kms');
            expect(result.status).toBe('healthy');
            expect(result.encryptionWorks).toBe(true);
        });

        it('should bypass encryption for dev stage', async () => {
            process.env.STAGE = 'dev';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123:key/abc';

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: { execute: jest.fn() },
            });

            const result = await useCase.execute();

            expect(result.bypassed).toBe(true);
            expect(result.stage).toBe('dev');
        });

        it('should not bypass encryption for production stage', async () => {
            process.env.STAGE = 'production';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123:key/abc';

            const mockTestEncryption = {
                execute: jest.fn().mockResolvedValue({ success: true }),
            };

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: mockTestEncryption,
            });

            const result = await useCase.execute();

            expect(result.bypassed).toBe(false);
            expect(result.stage).toBe('production');
        });

        it('should use qa stage correctly (not in bypass list)', async () => {
            process.env.STAGE = 'qa';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123:key/abc';

            const mockTestEncryption = {
                execute: jest.fn().mockResolvedValue({ success: true }),
            };

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: mockTestEncryption,
            });

            const result = await useCase.execute();

            expect(result.bypassed).toBe(false);
            expect(result.stage).toBe('qa');
            expect(result.mode).toBe('kms');
        });

        it('should return mode none when no encryption keys configured', async () => {
            process.env.STAGE = 'production';
            delete process.env.KMS_KEY_ARN;
            delete process.env.AES_KEY_ID;
            delete process.env.AES_KEY;

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: { execute: jest.fn() },
            });

            const result = await useCase.execute();

            expect(result.status).toBe('disabled');
            expect(result.mode).toBe('none');
            expect(result.bypassed).toBe(false);
            expect(result.testResult).toBe('No encryption keys configured');
        });
    });

    describe('execute() - bypass scenarios', () => {
        it('should return disabled status when encryption is bypassed', async () => {
            process.env.STAGE = 'dev';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123:key/abc';

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: { execute: jest.fn() },
            });

            const result = await useCase.execute();

            expect(result.status).toBe('disabled');
            expect(result.bypassed).toBe(true);
            expect(result.stage).toBe('dev');
            expect(result.testResult).toBe('Encryption bypassed for this stage');
            expect(result.encryptionWorks).toBe(false);
        });

        it('should return disabled status when no encryption keys configured', async () => {
            process.env.STAGE = 'production';
            delete process.env.KMS_KEY_ARN;
            delete process.env.AES_KEY_ID;

            const useCase = new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: { execute: jest.fn() },
            });

            const result = await useCase.execute();

            expect(result.status).toBe('disabled');
            expect(result.bypassed).toBe(false);
            expect(result.mode).toBe('none');
            expect(result.testResult).toBe('No encryption keys configured');
        });
    });

    describe('execute() - deployed runtime (in Lambda, not offline)', () => {
        beforeEach(() => {
            for (const key of [
                'JEST_WORKER_ID',
                'IS_OFFLINE',
                'IS_LOCAL',
                'KMS_KEY_ARN',
                'AES_KEY_ID',
                'AES_KEY',
                'FRIGG_ENCRYPTION_DISABLED',
            ]) {
                delete process.env[key];
            }
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-app-dev-health';
        });

        it('runs the encryption test on STAGE=dev when a key is configured', async () => {
            process.env.STAGE = 'dev';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123:key/abc';
            const testEncryption = {
                execute: jest
                    .fn()
                    .mockResolvedValue({ status: 'enabled', encryptionWorks: true }),
            };

            const result = await new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: testEncryption,
            }).execute();

            expect(testEncryption.execute).toHaveBeenCalled();
            expect(result.status).toBe('enabled');
            expect(result.bypassed).toBe(false);
            expect(result.runtime).toBe('deployed');
            expect(result.mode).toBe('kms');
        });

        it('reports unhealthy, with the fix, when no key is configured', async () => {
            process.env.STAGE = 'dev';
            const testEncryption = { execute: jest.fn() };

            const result = await new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: testEncryption,
            }).execute();

            expect(testEncryption.execute).not.toHaveBeenCalled();
            expect(result.status).toBe('unhealthy');
            expect(result.mode).toBe('none');
            expect(result.bypassed).toBe(false);
            expect(result.encryptionWorks).toBe(false);
            expect(result.testResult).toMatch(/No field-level encryption key/);
            expect(result.testResult).toMatch(/fieldLevelEncryptionMethod: 'kms'/);
        });

        it('reports disabled and opted out under FRIGG_ENCRYPTION_DISABLED=true', async () => {
            process.env.STAGE = 'prod';
            process.env.FRIGG_ENCRYPTION_DISABLED = 'true';

            const result = await new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: { execute: jest.fn() },
            }).execute();

            expect(result.status).toBe('disabled');
            expect(result.optedOut).toBe(true);
            expect(result.testResult).toMatch(/FRIGG_ENCRYPTION_DISABLED/);
        });

        it('ignores BYPASS_ENCRYPTION_STAGE, which never switched encryption off', async () => {
            process.env.STAGE = 'prod';
            process.env.BYPASS_ENCRYPTION_STAGE = 'prod';
            process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123:key/abc';
            const testEncryption = {
                execute: jest.fn().mockResolvedValue({ status: 'enabled' }),
            };

            const result = await new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: testEncryption,
            }).execute();

            expect(result.bypassed).toBe(false);
            expect(testEncryption.execute).toHaveBeenCalled();
        });
    });

    describe('execute() - frigg start (serverless-offline)', () => {
        it('reports the local bypass on STAGE=dev', async () => {
            delete process.env.KMS_KEY_ARN;
            delete process.env.AES_KEY_ID;
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-app-dev-health';
            process.env.IS_OFFLINE = 'true';
            process.env.STAGE = 'dev';

            const result = await new CheckEncryptionHealthUseCase({
                testEncryptionUseCase: { execute: jest.fn() },
            }).execute();

            expect(result.status).toBe('disabled');
            expect(result.bypassed).toBe(true);
            expect(result.runtime).toBe('local');
        });
    });
});
