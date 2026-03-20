const { Workflow } = require('./workflow');

/**
 * WorkflowRepository
 * 
 * Repository for managing workflow data persistence and retrieval.
 * Implements the repository pattern for workflows following DDD principles.
 */
class WorkflowRepository {
    constructor() {
        // In a real implementation, this would be injected
        this.WorkflowModel = null; // Will be set when database models are created
    }

    /**
     * Set the database model for workflows
     * @param {Object} WorkflowModel - Mongoose model for workflows
     */
    setModel(WorkflowModel) {
        this.WorkflowModel = WorkflowModel;
    }

    /**
     * Create a new workflow
     * @param {Object} workflowData - Workflow data to create
     * @returns {Promise<Workflow>} Created workflow domain object
     */
    async createWorkflow(workflowData) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const record = await this.WorkflowModel.create({
            name: workflowData.name,
            description: workflowData.description,
            integrationId: workflowData.integrationId,
            userId: workflowData.userId,
            status: workflowData.status || 'ACTIVE',
            definition: workflowData.definition || { steps: [], triggers: [] },
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                version: workflowData.version || '1.0.0',
                ...workflowData.metadata
            }
        });

        return this.mapToDomainObject(record);
    }

    /**
     * Find workflow by ID
     * @param {string} workflowId - Workflow ID to find
     * @returns {Promise<Workflow|null>} Workflow domain object or null
     */
    async findById(workflowId) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const record = await this.WorkflowModel.findById(workflowId).lean();
        return record ? this.mapToDomainObject(record) : null;
    }

    /**
     * Find workflows by integration ID
     * @param {string} integrationId - Integration ID to filter by
     * @returns {Promise<Array<Workflow>>} Array of workflow domain objects
     */
    async findWorkflowsByIntegrationId(integrationId) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const records = await this.WorkflowModel.find({ integrationId }, '', { lean: true });
        return records.map(record => this.mapToDomainObject(record));
    }

    /**
     * Find workflows by user ID
     * @param {string} userId - User ID to filter by
     * @returns {Promise<Array<Workflow>>} Array of workflow domain objects
     */
    async findWorkflowsByUserId(userId) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const records = await this.WorkflowModel.find({ userId }, '', { lean: true });
        return records.map(record => this.mapToDomainObject(record));
    }

    /**
     * Find workflows by integration ID and user ID
     * @param {string} integrationId - Integration ID to filter by
     * @param {string} userId - User ID to filter by
     * @returns {Promise<Array<Workflow>>} Array of workflow domain objects
     */
    async findWorkflowsByIntegrationAndUser(integrationId, userId) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const records = await this.WorkflowModel.find({ 
            integrationId, 
            userId 
        }, '', { lean: true });
        
        return records.map(record => this.mapToDomainObject(record));
    }

    /**
     * Find active workflows
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array<Workflow>>} Array of active workflow domain objects
     */
    async findActiveWorkflows(filters = {}) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const query = { status: 'ACTIVE', ...filters };
        const records = await this.WorkflowModel.find(query, '', { lean: true });
        return records.map(record => this.mapToDomainObject(record));
    }

    /**
     * Update workflow status
     * @param {string} workflowId - Workflow ID to update
     * @param {string} status - New status
     * @returns {Promise<void>}
     */
    async updateWorkflowStatus(workflowId, status) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        await this.WorkflowModel.updateOne(
            { _id: workflowId },
            { 
                status,
                'metadata.updatedAt': new Date()
            }
        );
    }

    /**
     * Update workflow definition
     * @param {string} workflowId - Workflow ID to update
     * @param {Object} definition - New workflow definition
     * @returns {Promise<void>}
     */
    async updateWorkflowDefinition(workflowId, definition) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        await this.WorkflowModel.updateOne(
            { _id: workflowId },
            { 
                definition,
                'metadata.updatedAt': new Date()
            }
        );
    }

    /**
     * Update entire workflow
     * @param {string} workflowId - Workflow ID to update
     * @param {Object} updateData - Data to update
     * @returns {Promise<Workflow>} Updated workflow domain object
     */
    async updateWorkflow(workflowId, updateData) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const record = await this.WorkflowModel.findByIdAndUpdate(
            workflowId,
            {
                ...updateData,
                'metadata.updatedAt': new Date()
            },
            { new: true, lean: true }
        );

        return record ? this.mapToDomainObject(record) : null;
    }

    /**
     * Delete workflow
     * @param {string} workflowId - Workflow ID to delete
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async deleteWorkflow(workflowId) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const result = await this.WorkflowModel.deleteOne({ _id: workflowId });
        return result.deletedCount > 0;
    }

    /**
     * Check if user has access to workflow
     * @param {string} workflowId - Workflow ID to check
     * @param {string} userId - User ID to check access for
     * @returns {Promise<boolean>} True if user has access
     */
    async hasUserAccess(workflowId, userId) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const count = await this.WorkflowModel.countDocuments({
            _id: workflowId,
            userId: userId
        });

        return count > 0;
    }

    /**
     * Get workflow statistics
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object>} Workflow statistics
     */
    async getWorkflowStats(filters = {}) {
        if (!this.WorkflowModel) {
            throw new Error('WorkflowModel not set. Call setModel() first.');
        }

        const stats = await this.WorkflowModel.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    avgStepsCount: { $avg: { $size: '$definition.steps' } }
                }
            }
        ]);

        const totalCount = await this.WorkflowModel.countDocuments(filters);

        return {
            total: totalCount,
            byStatus: stats.reduce((acc, stat) => {
                acc[stat._id] = {
                    count: stat.count,
                    avgStepsCount: Math.round(stat.avgStepsCount || 0)
                };
                return acc;
            }, {})
        };
    }

    /**
     * Map database record to domain object
     * @param {Object} record - Database record
     * @returns {Workflow} Workflow domain object
     */
    mapToDomainObject(record) {
        return new Workflow({
            id: record._id.toString(),
            name: record.name,
            description: record.description,
            integrationId: record.integrationId.toString(),
            userId: record.userId.toString(),
            status: record.status,
            definition: record.definition,
            metadata: record.metadata
        });
    }

    /**
     * Map domain object to database record format
     * @param {Workflow} workflow - Workflow domain object
     * @returns {Object} Database record format
     */
    mapToRecord(workflow) {
        return {
            _id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            integrationId: workflow.integrationId,
            userId: workflow.userId,
            status: workflow.status,
            definition: workflow.definition,
            metadata: workflow.metadata
        };
    }
}

module.exports = { WorkflowRepository };