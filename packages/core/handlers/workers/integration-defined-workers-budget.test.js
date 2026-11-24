const mockCreateHandler = jest.fn((options) => options);

jest.mock('@friggframework/core', () => ({
    createHandler: mockCreateHandler,
}));
jest.mock('../app-definition-loader', () => ({
    loadAppDefinition: () => ({
        integrations: [{ Definition: { name: 'hubspot' } }],
    }),
}));
jest.mock('../backend-utils', () => ({
    createQueueWorker: jest.fn(() => class {}),
}));

const { MAX_IN_PROCESS_WAIT_MS } = require('../../core/invocation-deadline');

describe('integration queue worker handler', () => {
    it('runs with a wait budget of 0, so a hinted wait never holds a worker slot', () => {
        const { handlers } = require('./integration-defined-workers');

        expect(handlers.hubspot.queueWorker.maxInProcessWaitMs).toBe(
            MAX_IN_PROCESS_WAIT_MS.queueWorker
        );
        expect(MAX_IN_PROCESS_WAIT_MS.queueWorker).toBe(0);
    });
});
