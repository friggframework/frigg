/* eslint-disable @typescript-eslint/no-require-imports */
import type { SchedulerServiceInterface } from './scheduler-service-interface';

export const SCHEDULER_PROVIDERS = {
    EVENTBRIDGE: 'eventbridge' as const,
    MOCK: 'mock' as const,
};

const LOCAL_STAGES = ['dev', 'test', 'local'];

export function determineProvider(): string {
    const explicitProvider = process.env.SCHEDULER_PROVIDER;
    if (explicitProvider) {
        return explicitProvider;
    }

    const stage = process.env.STAGE || 'dev';
    if (LOCAL_STAGES.includes(stage)) {
        return SCHEDULER_PROVIDERS.MOCK;
    }

    return SCHEDULER_PROVIDERS.EVENTBRIDGE;
}

export interface CreateSchedulerServiceOptions {
    provider?: string;
    region?: string;
    verbose?: boolean;
}

export function createSchedulerService(options: CreateSchedulerServiceOptions = {}): SchedulerServiceInterface {
    const provider = options.provider || determineProvider();

    switch (provider) {
        case SCHEDULER_PROVIDERS.EVENTBRIDGE: {
            const { EventBridgeSchedulerAdapter } = require('./eventbridge-scheduler-adapter');
            return new EventBridgeSchedulerAdapter({
                region: options.region,
            });
        }
        case SCHEDULER_PROVIDERS.MOCK: {
            const { MockSchedulerAdapter } = require('./mock-scheduler-adapter');
            return new MockSchedulerAdapter({
                verbose: options.verbose,
            });
        }
        default:
            throw new Error(`Unknown scheduler provider: ${provider}`);
    }
}
