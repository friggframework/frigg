const { WorkflowStep } = require('./workflow-step');

/**
 * FanOutStep Class
 * 
 * Handles large datasets by splitting them into batches and processing them in parallel.
 * Supports both pagination fan-out and data processing fan-out patterns.
 */
class FanOutStep extends WorkflowStep {
    /**
     * Creates a new FanOutStep
     * 
     * @param {Object} params - Fan-out step parameters
     * @param {string} params.handler - Handler method to execute for each batch
     * @param {number} params.batchSize - Number of items per batch
     * @param {string} params.fanOutType - Type of fan-out (PAGINATION, DATA_PROCESSING)
     * @param {string} params.dependsOn - Step name that this fan-out depends on for data
     * @param {number} params.maxConcurrency - Maximum number of concurrent batches
     * @param {Object} params.aggregationStrategy - How to combine batch results
     * @param {...Object} base - Base WorkflowStep parameters
     */
    constructor({ handler, batchSize, fanOutType, dependsOn, maxConcurrency, aggregationStrategy, ...base }) {
        super({ ...base, type: 'FAN_OUT' });
        this.handler = handler;
        this.batchSize = batchSize || 100;
        this.fanOutType = fanOutType || 'DATA_PROCESSING'; // 'PAGINATION' or 'DATA_PROCESSING'
        this.dependsOn = dependsOn; // Step that provides data for fan-out
        this.maxConcurrency = maxConcurrency || 10; // Limit concurrent batches
        this.aggregationStrategy = aggregationStrategy || {
            type: 'array', // 'array', 'object', 'sum', 'custom'
            combineResults: true
        };
    }

    /**
     * Validate fan-out step configuration
     * @throws {Error} If configuration is invalid
     */
    validate() {
        super.validate();
        
        if (!this.handler) {
            throw new Error('Fan-out step requires a handler method');
        }

        if (this.batchSize <= 0) {
            throw new Error('Batch size must be greater than 0');
        }

        if (!['PAGINATION', 'DATA_PROCESSING'].includes(this.fanOutType)) {
            throw new Error('fanOutType must be either "PAGINATION" or "DATA_PROCESSING"');
        }

        if (this.maxConcurrency <= 0) {
            throw new Error('maxConcurrency must be greater than 0');
        }
    }

    /**
     * Determine batch configuration for pagination fan-out
     * @param {Object} paginationInfo - Information from previous step about pagination
     * @returns {Object} Batch configuration
     */
    createPaginationBatches(paginationInfo) {
        const { totalPages, pageSize, totalItems } = paginationInfo;
        
        if (totalPages) {
            // Use provided total pages
            return {
                totalBatches: totalPages,
                batchConfigs: Array.from({ length: totalPages }, (_, index) => ({
                    batchIndex: index,
                    pageNumber: index + 1,
                    pageSize: pageSize || this.batchSize,
                    isPageFetch: true
                }))
            };
        } else if (totalItems) {
            // Calculate pages from total items
            const calculatedPages = Math.ceil(totalItems / (pageSize || this.batchSize));
            return {
                totalBatches: calculatedPages,
                batchConfigs: Array.from({ length: calculatedPages }, (_, index) => ({
                    batchIndex: index,
                    pageNumber: index + 1,
                    pageSize: pageSize || this.batchSize,
                    offset: index * (pageSize || this.batchSize),
                    isPageFetch: true
                }))
            };
        }

        throw new Error('Pagination info must include either totalPages or totalItems');
    }

    /**
     * Create batches for data processing fan-out
     * @param {Array} data - Data array to split into batches
     * @returns {Object} Batch configuration
     */
    createDataProcessingBatches(data) {
        if (!Array.isArray(data)) {
            throw new Error('Data processing fan-out requires an array of data');
        }

        const batches = [];
        for (let i = 0; i < data.length; i += this.batchSize) {
            batches.push({
                batchIndex: Math.floor(i / this.batchSize),
                batchData: data.slice(i, i + this.batchSize),
                startIndex: i,
                endIndex: Math.min(i + this.batchSize - 1, data.length - 1),
                itemCount: Math.min(this.batchSize, data.length - i)
            });
        }

        return {
            totalBatches: batches.length,
            batchConfigs: batches
        };
    }

    /**
     * Determine batching strategy based on workflow context
     * @param {Object} workflowContext - Current workflow context
     * @returns {Object} Batch configuration
     */
    createBatchConfiguration(workflowContext) {
        if (this.fanOutType === 'PAGINATION') {
            // Get pagination info from dependent step
            const dependentStepResult = workflowContext.stepResults[this.dependsOn];
            if (!dependentStepResult) {
                throw new Error(`Fan-out step depends on "${this.dependsOn}" but no result found`);
            }

            return this.createPaginationBatches(dependentStepResult);
        } else {
            // Get data array from dependent step or previous fan-out
            let dataToProcess = [];
            
            if (this.dependsOn) {
                const dependentStepResult = workflowContext.stepResults[this.dependsOn];
                
                // Handle results from previous fan-out (aggregated data)
                if (dependentStepResult && dependentStepResult.batchResults) {
                    // Flatten data from all batches
                    dataToProcess = dependentStepResult.batchResults.reduce((acc, batchResult) => {
                        if (batchResult && batchResult.contacts) {
                            acc.push(...batchResult.contacts);
                        } else if (Array.isArray(batchResult)) {
                            acc.push(...batchResult);
                        } else if (batchResult && batchResult.data && Array.isArray(batchResult.data)) {
                            acc.push(...batchResult.data);
                        }
                        return acc;
                    }, []);
                } else if (Array.isArray(dependentStepResult)) {
                    dataToProcess = dependentStepResult;
                } else if (dependentStepResult && Array.isArray(dependentStepResult.data)) {
                    dataToProcess = dependentStepResult.data;
                }
            }

            if (dataToProcess.length === 0) {
                console.warn(`No data found for fan-out processing from step: ${this.dependsOn}`);
                return { totalBatches: 0, batchConfigs: [] };
            }

            return this.createDataProcessingBatches(dataToProcess);
        }
    }

    /**
     * Get execution context for batch processing
     * @param {Object} workflowContext - Current workflow context
     * @param {Object} batchConfig - Configuration for this specific batch
     * @returns {Object} Execution context for the batch
     */
    getBatchExecutionContext(workflowContext, batchConfig) {
        return {
            ...workflowContext.stepResults,
            ...workflowContext.variables,
            batchIndex: batchConfig.batchIndex,
            batchData: batchConfig.batchData,
            totalBatches: batchConfig.totalBatches,
            fanOutType: this.fanOutType,
            stepName: this.name,
            stepId: this.id,
            // Include pagination-specific context
            ...(batchConfig.isPageFetch && {
                pageNumber: batchConfig.pageNumber,
                pageSize: batchConfig.pageSize,
                offset: batchConfig.offset
            })
        };
    }

    /**
     * Determine if fan-out should use batched queuing
     * @param {number} totalBatches - Total number of batches
     * @returns {boolean} True if should batch queue operations
     */
    shouldBatchQueue(totalBatches) {
        // For large fan-outs, batch the queue operations to avoid overwhelming SQS
        return totalBatches > this.maxConcurrency;
    }

    /**
     * Create queue batches for large fan-outs
     * @param {Array} batchConfigs - All batch configurations
     * @returns {Array} Array of queue batch groups
     */
    createQueueBatches(batchConfigs) {
        const queueBatches = [];
        for (let i = 0; i < batchConfigs.length; i += this.maxConcurrency) {
            queueBatches.push(batchConfigs.slice(i, i + this.maxConcurrency));
        }
        return queueBatches;
    }

    /**
     * Get aggregation configuration for batch results
     * @returns {Object} Aggregation configuration
     */
    getAggregationConfig() {
        return {
            type: this.aggregationStrategy.type,
            combineResults: this.aggregationStrategy.combineResults,
            customAggregator: this.aggregationStrategy.customAggregator
        };
    }

    /**
     * Get step configuration for serialization
     * @returns {Object} Step configuration object
     */
    toConfig() {
        return {
            ...super.toConfig(),
            handler: this.handler,
            batchSize: this.batchSize,
            fanOutType: this.fanOutType,
            dependsOn: this.dependsOn,
            maxConcurrency: this.maxConcurrency,
            aggregationStrategy: this.aggregationStrategy
        };
    }

    /**
     * Create FanOutStep from configuration
     * @param {Object} config - Step configuration
     * @returns {FanOutStep} Fan-out step instance
     */
    static fromConfig(config) {
        return new FanOutStep(config);
    }

    /**
     * Get step summary for display
     * @returns {Object} Step summary
     */
    getSummary() {
        return {
            ...super.getSummary(),
            handler: this.handler,
            batchSize: this.batchSize,
            fanOutType: this.fanOutType,
            dependsOn: this.dependsOn,
            maxConcurrency: this.maxConcurrency,
            aggregationType: this.aggregationStrategy.type
        };
    }
}

module.exports = { FanOutStep };