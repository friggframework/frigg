const {
    EventBridgeSchedulerAdapter,
} = require('./eventbridge-scheduler-adapter');

const ENV_KEYS = ['IS_OFFLINE', 'AWS_ENDPOINT', 'AWS_REGION'];

describe('EventBridgeSchedulerAdapter', () => {
    let savedEnv;

    beforeEach(() => {
        savedEnv = {};
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (savedEnv[key] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[key];
        }
    });

    it('uses the offline credentials and the local endpoint, as the queue clients do', async () => {
        process.env.IS_OFFLINE = 'true';
        process.env.AWS_ENDPOINT = 'http://localhost:4566';

        const { client } = new EventBridgeSchedulerAdapter();

        const endpoint = await client.config.endpoint();
        expect(endpoint).toMatchObject({ hostname: 'localhost', port: 4566 });
        await expect(client.config.credentials()).resolves.toMatchObject({
            accessKeyId: 'test-aws-key',
        });
    });

    it('keeps the AWS endpoint and the region when no local endpoint is set', async () => {
        process.env.AWS_REGION = 'eu-west-1';

        const { client } = new EventBridgeSchedulerAdapter();

        expect(client.config.isCustomEndpoint).toBe(false);
        await expect(client.config.region()).resolves.toBe('eu-west-1');
    });
});
