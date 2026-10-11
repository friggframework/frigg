const { logger } = require('./logger');
const {
    EncryptionConfigurationError,
    getEncryptionConfig,
    isDeployedRuntime,
    resetEncryptionConfigWarnings,
    resolveEncryptionConfig,
} = require('./encryption-config');

const KMS = { KMS_KEY_ARN: 'arn:aws:kms:us-east-1:123456789012:key/abc' };
const AES = {
    AES_KEY_ID: 'key-1',
    AES_KEY: '0123456789abcdef0123456789abcdef',
};
const OPT_OUT = { FRIGG_ENCRYPTION_DISABLED: 'true' };

// What each runtime looks like from inside the process.
const LAMBDA = {
    AWS_LAMBDA_FUNCTION_NAME: 'my-app-dev-auth',
    LAMBDA_TASK_ROOT: '/var/task',
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs20.x',
};
// serverless-offline (frigg start) sets the Lambda variables too, plus IS_OFFLINE.
const OFFLINE = { ...LAMBDA, IS_OFFLINE: 'true' };
// `serverless invoke local` sets IS_LOCAL.
const INVOKE_LOCAL = { ...LAMBDA, IS_LOCAL: 'true' };
const JEST = { JEST_WORKER_ID: '1', NODE_ENV: 'test' };
const SCRIPT = {}; // plain `node script.js` on a laptop

describe('isDeployedRuntime', () => {
    it.each([
        ['a deployed Lambda', LAMBDA, true],
        [
            'a Lambda seen only through AWS_EXECUTION_ENV',
            { AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs20.x' },
            true,
        ],
        [
            'a Lambda seen only through LAMBDA_TASK_ROOT',
            { LAMBDA_TASK_ROOT: '/var/task' },
            true,
        ],
        // Frigg deploys to Lambda only; CI and CloudShell also set AWS_EXECUTION_ENV.
        [
            'an ECS task or CodeBuild job',
            { AWS_EXECUTION_ENV: 'AWS_ECS_FARGATE' },
            false,
        ],
        ['AWS CloudShell', { AWS_EXECUTION_ENV: 'CloudShell' }, false],
        ['serverless-offline', OFFLINE, false],
        [
            'serverless-offline with IS_OFFLINE=1',
            { ...LAMBDA, IS_OFFLINE: '1' },
            false,
        ],
        ['serverless invoke local', INVOKE_LOCAL, false],
        ['Jest, even with Lambda variables set', { ...LAMBDA, ...JEST }, false],
        ['a local script', SCRIPT, false],
        [
            'IS_OFFLINE=false inside Lambda',
            { ...LAMBDA, IS_OFFLINE: 'false' },
            true,
        ],
    ])('%s → %p', (_label, env, expected) => {
        expect(isDeployedRuntime(env)).toBe(expected);
    });
});

describe('resolveEncryptionConfig', () => {
    describe('deployed (in Lambda, not offline): the stage name never matters', () => {
        it.each(['dev', 'test', 'local', 'production', undefined])(
            'STAGE=%p with KMS_KEY_ARN → KMS',
            (STAGE) => {
                const config = resolveEncryptionConfig({
                    ...LAMBDA,
                    ...KMS,
                    STAGE,
                });
                expect(config).toMatchObject({
                    enabled: true,
                    method: 'kms',
                    mode: 'kms',
                    runtime: 'deployed',
                    bypassed: false,
                    error: null,
                });
            }
        );

        it('AES_KEY_ID + AES_KEY → AES', () => {
            const config = resolveEncryptionConfig({
                ...LAMBDA,
                ...AES,
                STAGE: 'dev',
            });
            expect(config).toMatchObject({
                enabled: true,
                method: 'aes',
                error: null,
            });
        });

        it('prefers KMS when both keys are set', () => {
            const config = resolveEncryptionConfig({
                ...LAMBDA,
                ...KMS,
                ...AES,
            });
            expect(config.method).toBe('kms');
        });

        it('treats a whitespace-only key as missing', () => {
            const config = resolveEncryptionConfig({
                ...LAMBDA,
                KMS_KEY_ARN: '   ',
                STAGE: 'prod',
            });
            expect(config.enabled).toBe(false);
            expect(config.error).toMatch(/No field-level encryption key/);
        });

        it.each(['dev', 'test', 'local', 'production'])(
            'STAGE=%p with no key → error, not plaintext',
            (STAGE) => {
                const config = resolveEncryptionConfig({ ...LAMBDA, STAGE });
                expect(config.enabled).toBe(false);
                expect(config.mode).toBe('none');
                expect(config.bypassed).toBe(false);
                expect(config.error).toMatch(/No field-level encryption key/);
                expect(config.error).toMatch(
                    /fieldLevelEncryptionMethod: 'kms'/
                );
                expect(config.error).toMatch(/AES_KEY_ID/);
                expect(config.error).toMatch(/FRIGG_ENCRYPTION_DISABLED=true/);
            }
        );

        it('AES_KEY_ID without AES_KEY → error naming AES_KEY', () => {
            const config = resolveEncryptionConfig({
                ...LAMBDA,
                AES_KEY_ID: 'key-1',
                STAGE: 'prod',
            });
            expect(config.enabled).toBe(false);
            expect(config.error).toMatch(
                /AES_KEY_ID is set but AES_KEY is not/
            );
        });

        it('opt-out with no key → disabled without error', () => {
            const config = resolveEncryptionConfig({
                ...LAMBDA,
                ...OPT_OUT,
                STAGE: 'prod',
            });
            expect(config).toMatchObject({
                enabled: false,
                mode: 'none',
                optedOut: true,
                bypassed: false,
                error: null,
            });
        });

        it.each(['TRUE', '1', ' true '])('opt-out accepts %p', (value) => {
            const config = resolveEncryptionConfig({
                ...LAMBDA,
                FRIGG_ENCRYPTION_DISABLED: value,
            });
            expect(config.optedOut).toBe(true);
            expect(config.error).toBeNull();
        });

        it.each(['false', '0', '', 'yes'])(
            'FRIGG_ENCRYPTION_DISABLED=%p is not an opt-out',
            (value) => {
                const config = resolveEncryptionConfig({
                    ...LAMBDA,
                    FRIGG_ENCRYPTION_DISABLED: value,
                });
                expect(config.optedOut).toBe(false);
                expect(config.error).not.toBeNull();
            }
        );

        it('opt-out does not override a configured key', () => {
            const config = resolveEncryptionConfig({
                ...LAMBDA,
                ...KMS,
                ...OPT_OUT,
            });
            expect(config).toMatchObject({
                enabled: true,
                method: 'kms',
                optedOut: false,
                optOutIgnored: true,
            });
        });
    });

    describe.each([
        ['frigg start (serverless-offline)', OFFLINE],
        ['serverless invoke local', INVOKE_LOCAL],
        ['Jest', JEST],
        ['a local script', SCRIPT],
    ])('local: %s', (_label, runtimeEnv) => {
        it.each(['dev', 'test', 'local', 'DEV'])(
            'STAGE=%p bypasses even with a key',
            (STAGE) => {
                const config = resolveEncryptionConfig({
                    ...runtimeEnv,
                    ...KMS,
                    STAGE,
                });
                expect(config).toMatchObject({
                    enabled: false,
                    bypassed: true,
                    runtime: 'local',
                    error: null,
                });
            }
        );

        it('a non-local stage with KMS_KEY_ARN encrypts', () => {
            const config = resolveEncryptionConfig({
                ...runtimeEnv,
                ...KMS,
                STAGE: 'production',
            });
            expect(config).toMatchObject({ enabled: true, method: 'kms' });
        });

        it('a non-local stage with AES_KEY_ID encrypts', () => {
            const config = resolveEncryptionConfig({
                ...runtimeEnv,
                ...AES,
                STAGE: 'production',
            });
            expect(config).toMatchObject({ enabled: true, method: 'aes' });
        });

        it('a non-local stage with no key stays plaintext, without error', () => {
            const config = resolveEncryptionConfig({
                ...runtimeEnv,
                STAGE: 'production',
            });
            expect(config).toMatchObject({
                enabled: false,
                bypassed: false,
                mode: 'none',
                error: null,
            });
        });
    });

    it('falls back to NODE_ENV, then development, for the stage', () => {
        expect(
            resolveEncryptionConfig({ NODE_ENV: 'test', ...KMS }).bypassed
        ).toBe(true);
        expect(resolveEncryptionConfig({ ...KMS }).stage).toBe('development');
        expect(resolveEncryptionConfig({ ...KMS }).enabled).toBe(true);
    });
});

describe('getEncryptionConfig', () => {
    let warn;

    beforeEach(() => {
        resetEncryptionConfigWarnings();
        warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('returns the resolved config when encryption is on', () => {
        expect(getEncryptionConfig({ ...LAMBDA, ...KMS })).toMatchObject({
            enabled: true,
            method: 'kms',
        });
    });

    it('throws EncryptionConfigurationError when deployed with no key', () => {
        expect(() => getEncryptionConfig({ ...LAMBDA, STAGE: 'dev' })).toThrow(
            EncryptionConfigurationError
        );
        expect(() => getEncryptionConfig({ ...LAMBDA, STAGE: 'dev' })).toThrow(
            /No field-level encryption key/
        );
    });

    it('does not throw locally with no key', () => {
        expect(getEncryptionConfig({ ...OFFLINE, STAGE: 'dev' })).toMatchObject(
            {
                enabled: false,
            }
        );
    });

    it('warns once per process on opt-out', () => {
        const env = { ...LAMBDA, ...OPT_OUT };
        expect(getEncryptionConfig(env).enabled).toBe(false);
        getEncryptionConfig(env);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/FRIGG_ENCRYPTION_DISABLED/);
        expect(warn.mock.calls[0][0]).toMatch(/PLAINTEXT/);
    });

    it('warns when an opt-out is ignored because a key is set', () => {
        getEncryptionConfig({ ...LAMBDA, ...KMS, ...OPT_OUT });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/ignored/);
    });

    it('reads process.env by default', () => {
        const saved = { ...process.env };
        try {
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'fn';
            delete process.env.JEST_WORKER_ID;
            delete process.env.IS_OFFLINE;
            delete process.env.KMS_KEY_ARN;
            delete process.env.AES_KEY_ID;
            delete process.env.FRIGG_ENCRYPTION_DISABLED;
            expect(() => getEncryptionConfig()).toThrow(
                EncryptionConfigurationError
            );
        } finally {
            process.env = saved;
        }
    });
});
