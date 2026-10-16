const provider = require('../index');

describe('@friggframework/provider-aws (plugin facade over core)', () => {
    it('loads no AWS SDK when required', () => {
        jest.isolateModules(() => {
            require('../index');
        });
        const loaded = Object.keys(require.cache).filter((m) => m.includes('@aws-sdk/client-scheduler'));
        expect(loaded).toEqual([]);
    });

    it('exposes core implementations under the plugin interface', () => {
        expect(provider.name).toBe('aws');
        expect(provider.QueueProvider).toBe(
            require('@friggframework/core/queues/providers/sqs-queue-provider').SqsQueueProvider
        );
        expect(provider.SqsQueueProvider).toBe(provider.QueueProvider);
        expect(provider.SqsQueueClient).toBe(
            require('@friggframework/core/queues/sqs-queue-client').SqsQueueClient
        );
        expect(provider.SchedulerAdapter.name).toBe('EventBridgeSchedulerAdapter');
        expect(provider.EventBridgeSchedulerAdapter).toBe(provider.SchedulerAdapter);
        expect(provider.LambdaInvoker.name).toBe('LambdaInvoker');
        expect(typeof provider.invokeFunctionAdapter.invoke).toBe('function');
        expect(typeof provider.loadSecrets).toBe('function');
        expect(provider.MigrationStatusRepositoryS3.name).toBe('MigrationStatusRepositoryS3');
    });

    it('is what core resolves for provider "aws"', () => {
        const { resolveProvider } = require('@friggframework/core/providers/resolve-provider');
        expect(resolveProvider({ provider: 'aws' }).name).toBe('aws');
    });
});
