/**
 * CreateProcess Use Case Tests
 * 
 * Tests process creation with validation and error handling.
 */

const { CreateProcess } = require('./create-process');

/**
 * @group unit
 * @group application
 */
describe('CreateProcess', () => {
    let createProcessUseCase;
    let mockProcessRepository;

    beforeEach(() => {
        mockProcessRepository = {
            create: jest.fn(),
        };
        createProcessUseCase = new CreateProcess({
            processRepository: mockProcessRepository,
        });
    });

    describe('constructor', () => {
        it('should require processRepository', () => {
            expect(() => new CreateProcess({})).toThrow('processRepository is required');
        });

        it('should initialize with processRepository', () => {
            expect(createProcessUseCase.processRepository).toBe(mockProcessRepository);
        });
    });

    describe('execute', () => {
        const validProcessData = {
            userId: 'user-123',
            integrationId: 'integration-456',
            name: 'test-crm-contact-sync',
            type: 'CRM_SYNC',
        };

        it('should create a process with minimal required data', async () => {
            const mockCreatedProcess = { id: 'process-789', ...validProcessData };
            mockProcessRepository.create.mockResolvedValue(mockCreatedProcess);

            const result = await createProcessUseCase.execute(validProcessData);

            expect(mockProcessRepository.create).toHaveBeenCalledWith({
                userId: 'user-123',
                integrationId: 'integration-456',
                name: 'test-crm-contact-sync',
                type: 'CRM_SYNC',
                state: 'INITIALIZING',
                context: {},
                results: {},
                childProcesses: [],
                parentProcessId: null,
            });
            expect(result).toEqual(mockCreatedProcess);
        });

        it('should create a process with all optional data', async () => {
            const processDataWithOptions = {
                ...validProcessData,
                state: 'FETCHING_TOTAL',
                context: { syncType: 'INITIAL', totalRecords: 100 },
                results: { aggregateData: { totalSynced: 0 } },
                childProcesses: ['child-1', 'child-2'],
                parentProcessId: 'parent-123',
            };

            const mockCreatedProcess = { id: 'process-789', ...processDataWithOptions };
            mockProcessRepository.create.mockResolvedValue(mockCreatedProcess);

            const result = await createProcessUseCase.execute(processDataWithOptions);

            expect(mockProcessRepository.create).toHaveBeenCalledWith(processDataWithOptions);
            expect(result).toEqual(mockCreatedProcess);
        });

        it('should throw error if userId is missing', async () => {
            const invalidData = { integrationId: 'int-123', name: 'test', type: 'CRM_SYNC' };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('Missing required fields for process creation: userId');
        });

        it('should throw error if integrationId is missing', async () => {
            const invalidData = { userId: 'user-123', name: 'test', type: 'CRM_SYNC' };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('Missing required fields for process creation: integrationId');
        });

        it('should throw error if name is missing', async () => {
            const invalidData = { userId: 'user-123', integrationId: 'int-123', type: 'CRM_SYNC' };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('Missing required fields for process creation: name');
        });

        it('should throw error if type is missing', async () => {
            const invalidData = { userId: 'user-123', integrationId: 'int-123', name: 'test' };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('Missing required fields for process creation: type');
        });

        it('should throw error if userId is not a string', async () => {
            const invalidData = { ...validProcessData, userId: 123 };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('userId must be a string');
        });

        it('should throw error if integrationId is not a string', async () => {
            const invalidData = { ...validProcessData, integrationId: 456 };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('integrationId must be a string');
        });

        it('should throw error if name is not a string', async () => {
            const invalidData = { ...validProcessData, name: 789 };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('name must be a string');
        });

        it('should throw error if type is not a string', async () => {
            const invalidData = { ...validProcessData, type: 999 };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('type must be a string');
        });

        it('should throw error if state is provided but not a string', async () => {
            const invalidData = { ...validProcessData, state: 123 };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('state must be a string');
        });

        it('should throw error if context is provided but not an object', async () => {
            const invalidData = { ...validProcessData, context: 'invalid' };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('context must be an object');
        });

        it('should throw error if results is provided but not an object', async () => {
            const invalidData = { ...validProcessData, results: 'invalid' };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('results must be an object');
        });

        it('should throw error if childProcesses is provided but not an array', async () => {
            const invalidData = { ...validProcessData, childProcesses: 'invalid' };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('childProcesses must be an array');
        });

        it('should throw error if parentProcessId is provided but not a string', async () => {
            const invalidData = { ...validProcessData, parentProcessId: 123 };

            await expect(createProcessUseCase.execute(invalidData))
                .rejects.toThrow('parentProcessId must be a string');
        });

        it('should handle repository errors', async () => {
            const repositoryError = new Error('Database connection failed');
            mockProcessRepository.create.mockRejectedValue(repositoryError);

            await expect(createProcessUseCase.execute(validProcessData))
                .rejects.toThrow('Failed to create process: Database connection failed');
        });
    });
});
