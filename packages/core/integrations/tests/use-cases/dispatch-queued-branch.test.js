/**
 * Covers the producer "queued" branch in the create/update use cases: when the
 * dispatch helper enqueues the event (dispatch:'queue'), the use case must
 * return a { queued } ack instead of the integration DTO. The HTTP layer maps
 * that ack to a 202. The default (sync) branch must still return the DTO.
 */

jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock the dispatch helper so we control the queued vs sync outcome directly
// and assert the use case maps each outcome to the right return shape.
const mockDispatch = jest.fn();
jest.mock('../../use-cases/dispatch-integration-event', () => ({
    dispatchIntegrationEvent: (...args) => mockDispatch(...args),
}));

const { UpdateIntegration } = require('../../use-cases/update-integration');
const { CreateIntegration } = require('../../use-cases/create-integration');
const {
    TestIntegrationRepository,
} = require('../doubles/test-integration-repository');
const {
    TestModuleFactory,
} = require('../../../modules/tests/doubles/test-module-factory');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

describe('producer queued-branch return shape', () => {
    let integrationRepository;
    let moduleFactory;

    beforeEach(() => {
        mockDispatch.mockReset();
        integrationRepository = new TestIntegrationRepository();
        moduleFactory = new TestModuleFactory();
    });

    describe('UpdateIntegration', () => {
        let useCase;
        beforeEach(() => {
            useCase = new UpdateIntegration({
                integrationRepository,
                integrationClasses: [DummyIntegration],
                moduleFactory,
            });
        });

        it('returns a { queued } ack when the event was enqueued', async () => {
            const record = await integrationRepository.createIntegration(
                ['e1'],
                'user-1',
                { type: 'dummy' }
            );
            mockDispatch.mockResolvedValue({
                queued: true,
                messageId: 'msg-1',
                requestId: 'req-1',
            });

            const result = await useCase.execute(record.id, 'user-1', {
                type: 'dummy',
                foo: 'baz',
            });

            expect(result).toEqual({
                queued: true,
                integrationId: record.id,
                messageId: 'msg-1',
                requestId: 'req-1',
            });
        });

        it('returns the integration DTO when the event ran in-process', async () => {
            const record = await integrationRepository.createIntegration(
                ['e1'],
                'user-1',
                { type: 'dummy' }
            );
            mockDispatch.mockResolvedValue({ result: { ran: true } });

            const result = await useCase.execute(record.id, 'user-1', {
                type: 'dummy',
                foo: 'baz',
            });

            expect(result.queued).toBeUndefined();
            expect(result.id).toBe(record.id);
        });
    });

    describe('CreateIntegration', () => {
        let useCase;
        beforeEach(() => {
            useCase = new CreateIntegration({
                integrationRepository,
                integrationClasses: [DummyIntegration],
                moduleFactory,
            });
        });

        it('returns a { queued } ack when the event was enqueued', async () => {
            mockDispatch.mockResolvedValue({
                queued: true,
                messageId: 'msg-2',
                requestId: 'req-2',
            });

            const result = await useCase.execute(['e1'], 'user-1', {
                type: 'dummy',
            });

            expect(result).toMatchObject({
                queued: true,
                messageId: 'msg-2',
                requestId: 'req-2',
            });
            expect(result.integrationId).toBeDefined();
        });

        it('returns the integration DTO when the event ran in-process', async () => {
            mockDispatch.mockResolvedValue({ result: undefined });

            const result = await useCase.execute(['e1'], 'user-1', {
                type: 'dummy',
            });

            expect(result.queued).toBeUndefined();
            expect(result.id).toBeDefined();
        });
    });
});
