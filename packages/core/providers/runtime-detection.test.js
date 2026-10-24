const {
    isDeployedRuntime,
    isAwsLambdaRuntime,
    isLocalRun,
    resolveActiveProvider,
} = require('./runtime-detection');

const onNetlify = { detect: (env) => env.FRIGG_PROVIDER === 'netlify' };

describe('isDeployedRuntime', () => {
    it.each([
        ['AWS Lambda', { AWS_LAMBDA_FUNCTION_NAME: 'app-dev-auth' }],
        ['AWS Lambda (task root)', { LAMBDA_TASK_ROOT: '/var/task' }],
        ['AWS Lambda (execution env)', { AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs20.x' }],
    ])('%s is deployed, whatever STAGE says', (_label, env) => {
        expect(isDeployedRuntime({ ...env, STAGE: 'dev' }, { provider: null })).toBe(true);
    });

    it('a Netlify Function (no AWS Lambda variables) is deployed when the provider detects it', () => {
        const env = { FRIGG_PROVIDER: 'netlify', STAGE: 'dev' };
        expect(isDeployedRuntime(env, { provider: onNetlify })).toBe(true);
    });

    it('asks the provider named by FRIGG_PROVIDER (the real provider-netlify)', () => {
        expect(isDeployedRuntime({ FRIGG_PROVIDER: 'netlify', STAGE: 'dev' })).toBe(true);
    });

    it('asks the provider named by the app definition', () => {
        expect(
            isDeployedRuntime({ NETLIFY: 'true' }, { appDefinition: { provider: 'netlify' } })
        ).toBe(true);
    });

    it.each([
        ['netlify dev', { FRIGG_PROVIDER: 'netlify', NETLIFY_DEV: 'true' }],
        ['serverless-offline', { AWS_LAMBDA_FUNCTION_NAME: 'x', IS_OFFLINE: 'true' }],
        ['serverless invoke local', { LAMBDA_TASK_ROOT: '/var/task', IS_LOCAL: 'true' }],
        ['jest', { AWS_LAMBDA_FUNCTION_NAME: 'x', JEST_WORKER_ID: '1' }],
    ])('%s is a local run, never deployed', (_label, env) => {
        expect(isDeployedRuntime(env, { provider: onNetlify })).toBe(false);
    });

    it('a named provider whose package cannot be loaded fails closed (deployed)', () => {
        expect(isDeployedRuntime({ FRIGG_PROVIDER: 'not-an-installed-provider', STAGE: 'dev' })).toBe(true);
        expect(
            isDeployedRuntime({ STAGE: 'dev' }, { appDefinition: { provider: 'not-an-installed-provider' } })
        ).toBe(true);
    });

    it('a named provider still yields to a local run', () => {
        expect(
            isDeployedRuntime({ FRIGG_PROVIDER: 'not-an-installed-provider', NETLIFY_DEV: 'true' })
        ).toBe(false);
    });

    it('a laptop with no platform signal is local', () => {
        expect(isDeployedRuntime({ STAGE: 'production' })).toBe(false);
    });

    it('a provider that does not detect its platform, or throws, means not deployed', () => {
        expect(isDeployedRuntime({}, { provider: { detect: () => false } })).toBe(false);
        expect(isDeployedRuntime({}, { provider: { detect: () => 'yes' } })).toBe(false);
        expect(
            isDeployedRuntime({}, { provider: { detect: () => { throw new Error('x'); } } })
        ).toBe(false);
    });
});

describe('resolveActiveProvider', () => {
    it('resolves FRIGG_PROVIDER to its package', () => {
        const resolve = jest.fn(() => onNetlify);
        expect(resolveActiveProvider({ FRIGG_PROVIDER: 'netlify' }, { resolve })).toBe(onNetlify);
        expect(resolve).toHaveBeenCalledWith(null, { provider: 'netlify' });
    });

    it('prefers the app definition provider', () => {
        const resolve = jest.fn(() => onNetlify);
        resolveActiveProvider({ FRIGG_PROVIDER: 'other' }, { appDefinition: { provider: 'netlify' }, resolve });
        expect(resolve).toHaveBeenCalledWith(null, { provider: 'netlify' });
    });

    it('returns null for aws, for no provider, and for a package that is not installed', () => {
        const resolve = jest.fn(() => { throw new Error('not installed'); });
        expect(resolveActiveProvider({ FRIGG_PROVIDER: 'aws' }, { resolve })).toBeNull();
        expect(resolveActiveProvider({}, { resolve })).toBeNull();
        expect(resolveActiveProvider({ FRIGG_PROVIDER: 'nope' }, { resolve })).toBeNull();
    });
});

describe('isAwsLambdaRuntime / isLocalRun', () => {
    it('AWS_EXECUTION_ENV of another AWS host (CodeBuild) is not Lambda', () => {
        expect(isAwsLambdaRuntime({ AWS_EXECUTION_ENV: 'AWS_ECS_FARGATE' })).toBe(false);
    });

    it('NETLIFY_DEV=false is not a local run', () => {
        expect(isLocalRun({ NETLIFY_DEV: 'false' })).toBe(false);
    });
});
