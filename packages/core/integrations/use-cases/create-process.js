/**
 * CreateProcess Use Case
 * 
 * Creates a new process record for tracking long-running operations.
 * Validates required fields and delegates persistence to the repository.
 * 
 * Design Philosophy:
 * - Use cases encapsulate business logic
 * - Validation happens at the use case layer
 * - Repositories handle only data access
 * - Process model is generic and reusable
 * 
 * @example
 * const createProcess = new CreateProcess({ processRepository });
 * const process = await createProcess.execute({
 *   userId: 'user123',
 *   integrationId: 'integration456',
 *   name: 'zoho-crm-contact-sync',
 *   type: 'CRM_SYNC',
 *   state: 'INITIALIZING',
 *   context: { syncType: 'INITIAL', totalRecords: 0 },
 *   results: { aggregateData: { totalSynced: 0, totalFailed: 0 } }
 * });
 */
const { invalidProcessData } = require('./process-errors');

class CreateProcess {
    /**
     * @param {Object} params
     * @param {ProcessRepositoryInterface} params.processRepository - Repository for process data access
     */
    constructor({ processRepository }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
    }

    /**
     * Execute the use case to create a process
     * @param {Object} processData - Process data to create
     * @param {string} processData.userId - User ID (required)
     * @param {string} processData.integrationId - Integration ID (required)
     * @param {string} processData.name - Process name (required)
     * @param {string} processData.type - Process type (required)
     * @param {string} [processData.state='INITIALIZING'] - Initial state
     * @param {Object} [processData.context={}] - Process context
     * @param {Object} [processData.results={}] - Process results
     * @param {string[]} [processData.childProcesses=[]] - Child process IDs
     * @param {string} [processData.parentProcessId] - Parent process ID
     * @returns {Promise<Object>} Created process record
     * @throws {Error} If validation fails or creation errors
     */
    async execute(processData) {
        // Validate required fields
        this._validateProcessData(processData);

        // Set defaults for optional fields
        const processToCreate = {
            userId: processData.userId,
            integrationId: processData.integrationId,
            name: processData.name,
            type: processData.type,
            state: processData.state || 'INITIALIZING',
            context: processData.context || {},
            results: processData.results || {},
            childProcesses: processData.childProcesses || [],
            parentProcessId: processData.parentProcessId || null,
        };

        // Delegate to repository
        try {
            const createdProcess = await this.processRepository.create(processToCreate);
            return createdProcess;
        } catch (error) {
            throw new Error(`Failed to create process: ${error.message}`);
        }
    }

    /**
     * Validate process data
     * @private
     * @param {Object} processData - Process data to validate
     * @throws {Error} If validation fails
     */
    _validateProcessData(processData) {
        const requiredFields = ['userId', 'integrationId', 'name', 'type'];
        const missingFields = requiredFields.filter(field => !processData[field]);

        if (missingFields.length > 0) {
            throw invalidProcessData(
                `Missing required fields for process creation: ${missingFields.join(', ')}`
            );
        }

        // Validate field types
        if (typeof processData.userId !== 'string') {
            throw invalidProcessData('userId must be a string');
        }
        if (typeof processData.integrationId !== 'string') {
            throw invalidProcessData('integrationId must be a string');
        }
        if (typeof processData.name !== 'string') {
            throw invalidProcessData('name must be a string');
        }
        if (typeof processData.type !== 'string') {
            throw invalidProcessData('type must be a string');
        }

        // Validate optional fields if provided
        if (processData.state && typeof processData.state !== 'string') {
            throw invalidProcessData('state must be a string');
        }
        if (processData.context && typeof processData.context !== 'object') {
            throw invalidProcessData('context must be an object');
        }
        if (processData.results && typeof processData.results !== 'object') {
            throw invalidProcessData('results must be an object');
        }
        if (processData.childProcesses && !Array.isArray(processData.childProcesses)) {
            throw invalidProcessData('childProcesses must be an array');
        }
        if (processData.parentProcessId && typeof processData.parentProcessId !== 'string') {
            throw invalidProcessData('parentProcessId must be a string');
        }
    }
}

module.exports = { CreateProcess };

