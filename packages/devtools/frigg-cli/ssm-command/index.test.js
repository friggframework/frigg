const { mockClient } = require('aws-sdk-client-mock');
const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
const { pushOffloadedParameters } = require('./index');

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
});
