const { WorkflowExecution } = require('./workflow-execution');

/**
 * WorkflowExecutionRepository
 * 
 * Repository for managing workflow execution data persistence and retrieval.
 * Handles runtime state, step execution history, and fan-out coordination.
 */
class WorkflowExecutionRepository {
    constructor() {
        // In a real implementation, this would be injected
        this.WorkflowExecutionModel = null; // Will be set when database models are created
    }

    /**
     * Set the database model for workflow executions
     * @param {Object} WorkflowExecutionModel - Mongoose model for workflow executions
     */
    setModel(WorkflowExecutionModel) {
        this.WorkflowExecutionModel = WorkflowExecutionModel;
    }

    /**
     * Create a new workflow execution
     * @param {Object} executionData - Execution data to create
     * @returns {Promise<WorkflowExecution>} Created execution domain object
     */
    async createExecution(executionData) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const record = await this.WorkflowExecutionModel.create({
            workflowId: executionData.workflowId,
            triggerType: executionData.triggerType,
            status: executionData.status || 'RUNNING',
            startTime: executionData.startTime || new Date(),
            endTime: executionData.endTime,
            stepExecutions: executionData.stepExecutions || [],
            context: executionData.context || {
                triggerData: {},
                stepResults: {},
                variables: {},
                currentStep: null,
                fanOutStates: {}
            },
            metadata: {
                totalSteps: executionData.metadata?.totalSteps || 0,
                completedSteps: executionData.metadata?.completedSteps || 0,
                retryCount: executionData.metadata?.retryCount || 0,
                ...executionData.metadata
            }
        });

        return this.mapToDomainObject(record);
    }

    /**
     * Find execution by ID
     * @param {string} executionId - Execution ID to find
     * @returns {Promise<WorkflowExecution|null>} Execution domain object or null
     */
    async findById(executionId) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const record = await this.WorkflowExecutionModel.findById(executionId).lean();
        return record ? this.mapToDomainObject(record) : null;
    }

    /**
     * Find executions by workflow ID
     * @param {string} workflowId - Workflow ID to filter by
     * @param {Object} options - Query options (limit, sort, etc.)
     * @returns {Promise<Array<WorkflowExecution>>} Array of execution domain objects
     */
    async findExecutionsByWorkflowId(workflowId, options = {}) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const query = this.WorkflowExecutionModel.find({ workflowId });
        
        if (options.limit) {
            query.limit(options.limit);
        }
        
        if (options.sort) {
            query.sort(options.sort);
        } else {
            query.sort({ startTime: -1 }); // Default to newest first
        }

        const records = await query.lean();
        return records.map(record => this.mapToDomainObject(record));
    }

    /**
     * Find running executions
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array<WorkflowExecution>>} Array of running executions
     */
    async findRunningExecutions(filters = {}) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const query = { status: 'RUNNING', ...filters };
        const records = await this.WorkflowExecutionModel.find(query).lean();
        return records.map(record => this.mapToDomainObject(record));
    }

    /**
     * Find stalled executions (running for too long without updates)
     * @param {number} minutesStalled - Minutes without updates to consider stalled
     * @returns {Promise<Array<WorkflowExecution>>} Array of stalled executions
     */
    async findStalledExecutions(minutesStalled = 30) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const stalledTime = new Date(Date.now() - minutesStalled * 60 * 1000);
        const records = await this.WorkflowExecutionModel.find({
            status: 'RUNNING',
            $or: [
                { lastUpdated: { $lt: stalledTime } },
                { lastUpdated: { $exists: false }, startTime: { $lt: stalledTime } }
            ]
        }).lean();

        return records.map(record => this.mapToDomainObject(record));
    }

    /**
     * Update execution status
     * @param {string} executionId - Execution ID to update
     * @param {string} status - New status
     * @param {Date} endTime - Optional end time for completion
     * @returns {Promise<void>}
     */
    async updateExecutionStatus(executionId, status, endTime = null) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const updateData = { 
            status,
            lastUpdated: new Date()
        };
        
        if (endTime) {
            updateData.endTime = endTime;
        }

        await this.WorkflowExecutionModel.updateOne(
            { _id: executionId },
            updateData
        );
    }

    /**
     * Update execution context
     * @param {string} executionId - Execution ID to update
     * @param {Object} context - New context data
     * @returns {Promise<void>}
     */
    async updateExecutionContext(executionId, context) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        await this.WorkflowExecutionModel.updateOne(
            { _id: executionId },
            { 
                context,
                lastUpdated: new Date()
            }
        );
    }

    /**
     * Add step execution to history
     * @param {string} executionId - Execution ID to update
     * @param {Object} stepExecution - Step execution result
     * @returns {Promise<void>}
     */
    async addStepExecution(executionId, stepExecution) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        await this.WorkflowExecutionModel.updateOne(
            { _id: executionId },
            { 
                $push: { stepExecutions: stepExecution },
                $set: { lastUpdated: new Date() }
            }
        );
    }

    /**
     * Update step result in context
     * @param {string} executionId - Execution ID to update
     * @param {string} stepName - Name of the step
     * @param {Object} result - Step execution result
     * @returns {Promise<void>}
     */
    async updateStepResult(executionId, stepName, result) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        await this.WorkflowExecutionModel.updateOne(
            { _id: executionId },
            { 
                $set: { 
                    [`context.stepResults.${stepName}`]: result,
                    lastUpdated: new Date()
                }
            }
        );
    }

    /**
     * Update fan-out state atomically
     * @param {string} executionId - Execution ID to update
     * @param {string} stepId - Fan-out step ID
     * @param {number} batchIndex - Batch index
     * @param {Object} batchResult - Result from batch execution
     * @returns {Promise<Object|null>} Updated execution record or null if update failed
     */
    async updateFanOutBatch(executionId, stepId, batchIndex, batchResult) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        // Atomic update with optimistic concurrency control
        const result = await this.WorkflowExecutionModel.findOneAndUpdate(
            { 
                _id: executionId,
                [`context.fanOutStates.${stepId}.status`]: 'RUNNING',
                // Ensure this batch hasn't been processed yet
                [`context.fanOutStates.${stepId}.batchResults.${batchIndex}`]: { $exists: false }
            },
            {
                $set: {
                    [`context.fanOutStates.${stepId}.batchResults.${batchIndex}`]: batchResult,
                    [`context.fanOutStates.${stepId}.lastUpdated`]: new Date(),
                    lastUpdated: new Date()
                },
                $inc: {
                    [`context.fanOutStates.${stepId}.completedBatches`]: 1
                }
            },
            { new: true, lean: true }
        );

        return result;
    }

    /**
     * Mark fan-out step as completed atomically
     * @param {string} executionId - Execution ID to update
     * @param {string} stepId - Fan-out step ID
     * @param {Object} aggregatedResult - Aggregated result from all batches
     * @returns {Promise<boolean>} True if update succeeded
     */
    async completeFanOutStep(executionId, stepId, aggregatedResult) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const result = await this.WorkflowExecutionModel.findOneAndUpdate(
            { 
                _id: executionId,
                [`context.fanOutStates.${stepId}.status`]: 'RUNNING'
            },
            {
                $set: {
                    [`context.fanOutStates.${stepId}.status`]: 'COMPLETED',
                    [`context.fanOutStates.${stepId}.completedAt`]: new Date(),
                    [`context.fanOutStates.${stepId}.aggregatedResult`]: aggregatedResult,
                    lastUpdated: new Date()
                }
            }
        );

        return !!result;
    }

    /**
     * Initialize fan-out state
     * @param {string} executionId - Execution ID to update
     * @param {string} stepId - Fan-out step ID
     * @param {Object} fanOutState - Initial fan-out state
     * @returns {Promise<void>}
     */
    async initializeFanOutState(executionId, stepId, fanOutState) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        await this.WorkflowExecutionModel.updateOne(
            { _id: executionId },
            { 
                $set: { 
                    [`context.fanOutStates.${stepId}`]: {
                        ...fanOutState,
                        createdAt: new Date(),
                        status: 'RUNNING'
                    },
                    lastUpdated: new Date()
                }
            }
        );
    }

    /**
     * Get execution statistics
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object>} Execution statistics
     */
    async getExecutionStats(filters = {}) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const stats = await this.WorkflowExecutionModel.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    avgDuration: { 
                        $avg: { 
                            $subtract: [
                                { $ifNull: ['$endTime', new Date()] }, 
                                '$startTime'
                            ] 
                        } 
                    },
                    avgStepsCompleted: { $avg: '$metadata.completedSteps' }
                }
            }
        ]);

        const totalCount = await this.WorkflowExecutionModel.countDocuments(filters);

        return {
            total: totalCount,
            byStatus: stats.reduce((acc, stat) => {
                acc[stat._id] = {
                    count: stat.count,
                    avgDurationMs: Math.round(stat.avgDuration || 0),
                    avgStepsCompleted: Math.round(stat.avgStepsCompleted || 0)
                };
                return acc;
            }, {})
        };
    }

    /**
     * Delete execution and all related data
     * @param {string} executionId - Execution ID to delete
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async deleteExecution(executionId) {
        if (!this.WorkflowExecutionModel) {
            throw new Error('WorkflowExecutionModel not set. Call setModel() first.');
        }

        const result = await this.WorkflowExecutionModel.deleteOne({ _id: executionId });
        return result.deletedCount > 0;
    }

    /**
     * Map database record to domain object
     * @param {Object} record - Database record
     * @returns {WorkflowExecution} Execution domain object
     */
    mapToDomainObject(record) {
        return new WorkflowExecution({
            id: record._id.toString(),
            workflowId: record.workflowId.toString(),
            triggerType: record.triggerType,
            status: record.status,
            startTime: record.startTime,
            endTime: record.endTime,
            stepExecutions: record.stepExecutions,
            context: record.context
        });
    }

    /**
     * Map domain object to database record format
     * @param {WorkflowExecution} execution - Execution domain object
     * @returns {Object} Database record format
     */
    mapToRecord(execution) {
        return {
            _id: execution.id,
            workflowId: execution.workflowId,
            triggerType: execution.triggerType,
            status: execution.status,
            startTime: execution.startTime,
            endTime: execution.endTime,
            stepExecutions: execution.stepExecutions,
            context: execution.context
        };
    }
}

module.exports = { WorkflowExecutionRepository };