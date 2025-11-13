/**
 * Tests for CheckEncryptionHealthUseCase
 * 
 * Tests encryption configuration detection and health checking
 */

const { CheckEncryptionHealthUseCase } = require('./check-encryption-health-use-case');

/**
 * @group unit
 * @group application
 */
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
});

