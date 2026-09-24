/**
 * Process commands — end-to-end error-code mapping.
 *
 * Unlike process-commands.test.js (which mocks the use cases), this suite
 * exercises the REAL use cases against a stubbed repository to prove that
 * the codes they attach (INVALID_PROCESS_DATA / PROCESS_NOT_FOUND) survive
 * all the way to the HTTP-ish response shape produced by mapErrorToResponse.
 */

jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockApplyProcessUpdate = jest.fn();

jest.mock(
    '../../integrations/repositories/process-repository-factory',
    () => ({
        createProcessRepository: () => ({
            findById: mockFindById,
            create: mockCreate,
            update: mockUpdate,
            applyProcessUpdate: mockApplyProcessUpdate,
        }),
    }),
);

const { createProcessCommands } = require('./process-commands');

describe('process commands — error-code mapping (real use cases)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('maps invalid createProcess data to 400 INVALID_PROCESS_DATA', async () => {
        const commands = createProcessCommands();

        const result = await commands.createProcess({
            integrationId: 'int-1',
            name: 'sync',
            type: 'CRM_SYNC',
        }); // missing userId

        expect(result).toMatchObject({
            error: 400,
            code: 'INVALID_PROCESS_DATA',
        });
    });

    it('maps a missing process on updateProcessState to 404 PROCESS_NOT_FOUND', async () => {
        mockFindById.mockResolvedValue(null);
        const commands = createProcessCommands();

        const result = await commands.updateProcessState('missing', 'COMPLETED');

        expect(result).toEqual({
            error: 404,
            reason: 'Process not found: missing',
            code: 'PROCESS_NOT_FOUND',
        });
    });

    it('maps a missing process on updateProcessMetrics to 404 PROCESS_NOT_FOUND', async () => {
        mockApplyProcessUpdate.mockResolvedValue(null);
        const commands = createProcessCommands();

        const result = await commands.updateProcessMetrics('missing', {
            processed: 1,
        });

        expect(result).toEqual({
            error: 404,
            reason: 'Process not found: missing',
            code: 'PROCESS_NOT_FOUND',
        });
    });

    it('passes through null from getProcess (finder convention, not a 404)', async () => {
        mockFindById.mockResolvedValue(null);
        const commands = createProcessCommands();

        const result = await commands.getProcess('missing');

        expect(result).toBeNull();
    });
});
