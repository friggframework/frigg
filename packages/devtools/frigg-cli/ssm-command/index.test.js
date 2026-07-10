const { mockClient } = require('aws-sdk-client-mock');
const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
const { pushOffloadedParameters, resolvePushRegion } = require('./index');

describe('ssm-command pushOffloadedParameters', () => {
    let ssmMock;
    const originalEnv = process.env;

    const appDefinition = {
        name: 'my-app',
        ssm: {
            enable: true,
            parameters: {
                MY_SECRET: { type: 'SecureString' },
            },
        },
        environment: {
            MY_CONFIG: 'ssm',
            PLAIN: true,
        },
    };

    beforeEach(() => {
        ssmMock = mockClient(SSMClient);
        ssmMock.on(PutParameterCommand).resolves({ Version: 1 });
        process.env = {
            ...originalEnv,
            MY_SECRET: 'shh',
            MY_CONFIG: 'value-1',
        };
    });

    afterEach(() => {
        ssmMock.restore();
        process.env = originalEnv;
    });

    it('pushes each offloaded key with resolved name, type, and overwrite', async () => {
        const result = await pushOffloadedParameters(appDefinition, 'prod');

        const calls = ssmMock.commandCalls(PutParameterCommand);
        expect(calls).toHaveLength(2);

        const byName = Object.fromEntries(
            calls.map((c) => [c.args[0].input.Name, c.args[0].input])
        );
        expect(byName['/frigg/my-app/prod/MY_SECRET']).toMatchObject({
            Value: 'shh',
            Type: 'SecureString',
            Overwrite: true,
        });
        expect(byName['/frigg/my-app/prod/MY_CONFIG']).toMatchObject({
            Value: 'value-1',
            Type: 'String',
            Overwrite: true,
        });
        expect(result.pushed).toHaveLength(2);
    });

    it('passes KeyId for SecureString when ssm.kmsKeyArn is set', async () => {
        const withKey = {
            ...appDefinition,
            ssm: {
                ...appDefinition.ssm,
                kmsKeyArn: 'arn:aws:kms:us-east-1:1:key/k',
            },
        };
        await pushOffloadedParameters(withKey, 'dev');

        const inputs = ssmMock
            .commandCalls(PutParameterCommand)
            .map((c) => c.args[0].input);
        const secure = inputs.find((i) => i.Type === 'SecureString');
        const plain = inputs.find((i) => i.Type === 'String');
        expect(secure.KeyId).toBe('arn:aws:kms:us-east-1:1:key/k');
        expect(plain.KeyId).toBeUndefined();
    });

    it('is a silent no-op when nothing is offloaded', async () => {
        const result = await pushOffloadedParameters(
            { name: 'x', environment: { PLAIN: true } },
            'dev'
        );
        expect(result.pushed).toHaveLength(0);
        expect(ssmMock.commandCalls(PutParameterCommand)).toHaveLength(0);
    });

    it('throws listing keys with missing or empty values', async () => {
        delete process.env.MY_SECRET;
        process.env.MY_CONFIG = '';

        await expect(
            pushOffloadedParameters(appDefinition, 'dev')
        ).rejects.toThrow(/MY_SECRET.*MY_CONFIG|MY_CONFIG.*MY_SECRET/s);
        expect(ssmMock.commandCalls(PutParameterCommand)).toHaveLength(0);
    });

    it('skips missing values with allowEmpty instead of throwing', async () => {
        delete process.env.MY_SECRET;

        const result = await pushOffloadedParameters(appDefinition, 'dev', {
            allowEmpty: true,
        });
        expect(result.skipped).toEqual(['MY_SECRET']);
        expect(ssmMock.commandCalls(PutParameterCommand)).toHaveLength(1);
    });

    it('rejects values over the standard tier limit and suggests advanced', async () => {
        process.env.MY_CONFIG = 'x'.repeat(4097);

        await expect(
            pushOffloadedParameters(appDefinition, 'dev')
        ).rejects.toThrow(/advanced/i);
    });

    it('accepts large values with the advanced tier', async () => {
        process.env.MY_CONFIG = 'x'.repeat(4097);

        await pushOffloadedParameters(appDefinition, 'dev', {
            tier: 'advanced',
        });
        const inputs = ssmMock
            .commandCalls(PutParameterCommand)
            .map((c) => c.args[0].input);
        expect(
            inputs.find((i) => i.Name.endsWith('/MY_CONFIG')).Tier
        ).toBe('Advanced');
    });

    it('rejects values over the advanced tier limit', async () => {
        process.env.MY_CONFIG = 'x'.repeat(8193);

        await expect(
            pushOffloadedParameters(appDefinition, 'dev', {
                tier: 'advanced',
            })
        ).rejects.toThrow(/8192|8 ?KB/i);
    });

    describe('per-key tier resolution', () => {
        const withKeyTier = {
            ...appDefinition,
            ssm: {
                ...appDefinition.ssm,
                parameters: {
                    MY_SECRET: { type: 'SecureString' },
                    MY_CONFIG: { tier: 'advanced' },
                },
            },
        };

        it('accepts a large value when the key is configured advanced in the app definition', async () => {
            process.env.MY_CONFIG = 'x'.repeat(4097);

            await pushOffloadedParameters(withKeyTier, 'dev');

            const config = ssmMock
                .commandCalls(PutParameterCommand)
                .map((c) => c.args[0].input)
                .find((i) => i.Name.endsWith('/MY_CONFIG'));
            expect(config.Tier).toBe('Advanced');
        });

        it('validates each key against its own configured tier', async () => {
            // MY_CONFIG (advanced) tolerates 5000 bytes; MY_SECRET (standard) does not
            process.env.MY_CONFIG = 'x'.repeat(5000);
            process.env.MY_SECRET = 'y'.repeat(5000);

            await expect(
                pushOffloadedParameters(withKeyTier, 'dev')
            ).rejects.toThrow(/MY_SECRET/);
            expect(ssmMock.commandCalls(PutParameterCommand)).toHaveLength(0);
        });

        it('does not tag standard-tier keys with an Advanced tier', async () => {
            await pushOffloadedParameters(withKeyTier, 'dev');

            const secret = ssmMock
                .commandCalls(PutParameterCommand)
                .map((c) => c.args[0].input)
                .find((i) => i.Name.endsWith('/MY_SECRET'));
            expect(secret.Tier).toBeUndefined();
        });

        it('lets the --tier CLI option override per-key config for all keys', async () => {
            process.env.MY_CONFIG = 'x'.repeat(4097);

            await expect(
                pushOffloadedParameters(withKeyTier, 'dev', {
                    tier: 'standard',
                })
            ).rejects.toThrow(/advanced/i);
        });
    });

    it('throws on invalid offload config (markers without ssm.enable)', async () => {
        await expect(
            pushOffloadedParameters(
                { name: 'x', environment: { FOO: 'ssm' } },
                'dev'
            )
        ).rejects.toThrow(/ssm\.enable/);
    });

    it('wraps AWS errors with the parameter name', async () => {
        ssmMock
            .on(PutParameterCommand, {
                Name: '/frigg/my-app/dev/MY_SECRET',
            })
            .rejects(new Error('boom'));

        await expect(
            pushOffloadedParameters(appDefinition, 'dev')
        ).rejects.toThrow(/MY_SECRET/);
    });

    it('honors a custom parameterPrefix', async () => {
        const custom = {
            ...appDefinition,
            ssm: { ...appDefinition.ssm, parameterPrefix: '/team/x' },
        };
        await pushOffloadedParameters(custom, 'dev');

        const names = ssmMock
            .commandCalls(PutParameterCommand)
            .map((c) => c.args[0].input.Name);
        expect(names).toEqual(
            expect.arrayContaining([
                '/team/x/MY_SECRET',
                '/team/x/MY_CONFIG',
            ])
        );
    });

    describe('resolvePushRegion', () => {
        it('prefers an explicit --region option over the environment', () => {
            process.env.AWS_REGION = 'us-west-2';
            expect(resolvePushRegion({ region: 'eu-central-1' })).toBe(
                'eu-central-1'
            );
        });

        it('falls back to AWS_REGION when no option is given', () => {
            process.env.AWS_REGION = 'us-west-2';
            expect(resolvePushRegion({})).toBe('us-west-2');
        });

        it('defaults to us-east-1 when neither option nor AWS_REGION is set', () => {
            delete process.env.AWS_REGION;
            expect(resolvePushRegion({})).toBe('us-east-1');
        });
    });
});
