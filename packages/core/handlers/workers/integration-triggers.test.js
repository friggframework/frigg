/**
 * The `{integration}Triggers` Lambda entry: one handler per integration that declares triggers, handing the
 * schedule's event ({ tick | at, time }) to the tick use case.
 */
jest.mock('../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

class MockPoller { static Definition = { name: 'poller', triggers: { poll: { every: '15m', handler: 'poll' } } }; }
class MockDefined { static Definition = { name: 'defined', instanceTriggers: { tick: '5m' } }; }
class MockPlain { static Definition = { name: 'plain' }; }

jest.mock('../app-definition-loader', () => ({ loadAppDefinition: () => ({ integrations: [MockPoller, MockDefined, MockPlain] }) }));
jest.mock('../../database/prisma', () => ({ connectPrisma: async () => {} }));
jest.mock('../../integrations/use-cases/run-trigger-tick', () => ({ runTriggerTick: jest.fn(async () => ({ sent: 3 })) }));

const { handlers } = require('./integration-triggers');
const { runTriggerTick } = require('../../integrations/use-cases/run-trigger-tick');

describe('integration-triggers handlers', () => {
    it('exists only for integrations that declare triggers', () => {
        expect(Object.keys(handlers).sort()).toEqual(['defined', 'poller']);
    });

    it('passes the schedule event and the Lambda context to the tick', async () => {
        const context = { getRemainingTimeInMillis: () => 60000, callbackWaitsForEmptyEventLoop: true };
        await handlers.poller.tick({ tick: '15m', time: '2026-10-19T12:00:00Z' }, context);
        expect(runTriggerTick).toHaveBeenCalledWith(MockPoller, { tick: '15m', time: '2026-10-19T12:00:00Z' }, expect.objectContaining({ getRemainingTimeInMillis: expect.any(Function) }));
    });
});
