const { WorkflowStep } = require('./workflow-step');

/**
 * FunctionStep Class
 * 
 * Executes integration methods with access to credentials and API modules.
 * This is the primary step type for calling business logic in integrations.
 */
class FunctionStep extends WorkflowStep {
    /**
     * Creates a new FunctionStep
     * 
     * @param {Object} params - Function step parameters
     * @param {string} params.handler - Method name to call on integration class
     * @param {number} params.timeout - Execution timeout in milliseconds
     * @param {Object} params.retryPolicy - Retry configuration
     * @param {...Object} base - Base WorkflowStep parameters
     */
    constructor({ handler, timeout, retryPolicy, ...base }) {
        super({ ...base, type: 'FUNCTION' });
        this.handler = handler;
        this.timeout = timeout || 300000; // 5 minutes default
        this.retryPolicy = retryPolicy || {
            maxRetries: 3,
            backoffStrategy: 'exponential',
            baseDelay: 1000
        };
    }

    /**
     * Validate function step configuration
     * @throws {Error} If configuration is invalid
     */
    validate() {
        super.validate();
        
        if (!this.handler) {
            throw new Error('Function step requires a handler method name');
        }
        
        if (typeof this.handler !== 'string') {
            throw new Error('Handler must be a string method name');
        }

        if (this.timeout && (typeof this.timeout !== 'number' || this.timeout <= 0)) {
            throw new Error('Timeout must be a positive number');
        }

        if (this.retryPolicy) {
            this.validateRetryPolicy();
        }
    }

    /**
     * Validate retry policy configuration
     * @throws {Error} If retry policy is invalid
     */
    validateRetryPolicy() {
        const { maxRetries, backoffStrategy, baseDelay } = this.retryPolicy;
        
        if (maxRetries !== undefined && (typeof maxRetries !== 'number' || maxRetries < 0)) {
            throw new Error('maxRetries must be a non-negative number');
        }
        
        if (backoffStrategy && !['fixed', 'linear', 'exponential'].includes(backoffStrategy)) {
            throw new Error('backoffStrategy must be one of: fixed, linear, exponential');
        }
        
        if (baseDelay !== undefined && (typeof baseDelay !== 'number' || baseDelay <= 0)) {
            throw new Error('baseDelay must be a positive number');
        }
    }

    /**
     * Get execution context for this function step
     * @param {Object} workflowContext - Current workflow context
     * @returns {Object} Execution context with step results and metadata
     */
    getExecutionContext(workflowContext) {
        const executionContext = {
            ...workflowContext.stepResults
        };

        // Add metadata
        executionContext._metadata = {
            stepId: this.id,
            stepName: this.name,
            executionTime: new Date(),
            workflowExecutionId: workflowContext.executionId
        };

        return executionContext;
    }

    /**
     * Calculate retry delay based on retry policy
     * @param {number} attemptNumber - Current attempt number (0-based)
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attemptNumber) {
        const { backoffStrategy = 'exponential', baseDelay = 1000 } = this.retryPolicy;
        
        switch (backoffStrategy) {
            case 'fixed':
                return baseDelay;
            case 'linear':
                return baseDelay * (attemptNumber + 1);
            case 'exponential':
                return baseDelay * Math.pow(2, attemptNumber);
            default:
                return baseDelay;
        }
    }

    /**
     * Check if step should be retried
     * @param {Error} error - Error that occurred
     * @param {number} attemptNumber - Current attempt number
     * @returns {boolean} True if step should be retried
     */
    shouldRetry(error, attemptNumber) {
        const { maxRetries = 3 } = this.retryPolicy;
        
        if (attemptNumber >= maxRetries) {
            return false;
        }

        // Don't retry certain types of errors
        if (error.name === 'ValidationError' || 
            error.name === 'AuthenticationError' ||
            error.message.includes('Handler method not found')) {
            return false;
        }

        return true;
    }

    /**
     * Get step configuration for serialization
     * @returns {Object} Step configuration object
     */
    toConfig() {
        return {
            ...super.toConfig(),
            handler: this.handler,
            timeout: this.timeout,
            retryPolicy: this.retryPolicy
        };
    }

    /**
     * Create FunctionStep from configuration
     * @param {Object} config - Step configuration
     * @returns {FunctionStep} Function step instance
     */
    static fromConfig(config) {
        return new FunctionStep(config);
    }

    /**
     * Get step summary for display
     * @returns {Object} Step summary
     */
    getSummary() {
        return {
            ...super.getSummary(),
            handler: this.handler,
            timeout: this.timeout,
            maxRetries: this.retryPolicy.maxRetries
        };
    }
}

module.exports = { FunctionStep };