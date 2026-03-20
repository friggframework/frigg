// Domain Models
const { Workflow } = require('./workflow');
const { WorkflowExecution } = require('./workflow-execution');

// Step Types
const { 
    WorkflowStep,
    FunctionStep,
    FanOutStep,
    StepFactory
} = require('./steps');

// Repositories
const { WorkflowRepository } = require('./workflow-repository');
const { WorkflowExecutionRepository } = require('./workflow-execution-repository');

// Use Cases
const { CreateWorkflow } = require('./use-cases/create-workflow');
const { ExecuteWorkflow } = require('./use-cases/execute-workflow');
const { ExecuteWorkflowStep } = require('./use-cases/execute-workflow-step');

// Fluent API
const { FriggWorkflow } = require('./frigg-workflow');

// Queue Service
const { WorkflowQueueService } = require('./workflow-queue-service');

// Database Models
const { WorkflowModel } = require('../database/models/WorkflowModel');
const { WorkflowExecutionModel } = require('../database/models/WorkflowExecutionModel');

/**
 * WorkflowService - Main service class that orchestrates workflow operations
 * 
 * Provides a high-level interface for workflow management, combining all use cases
 * and repositories. This is the main entry point for integration classes.
 */
class WorkflowService {
    constructor({ 
        integrationId, 
        userId, 
        queueUrl,
        logger = console 
    }) {
        this.integrationId = integrationId;
        this.userId = userId;
        this.logger = logger;

        // Initialize repositories
        this.workflowRepository = new WorkflowRepository();
        this.workflowExecutionRepository = new WorkflowExecutionRepository();

        // Set database models
        this.workflowRepository.setModel(WorkflowModel);
        this.workflowExecutionRepository.setModel(WorkflowExecutionModel);

        // Initialize queue service
        this.queueService = new WorkflowQueueService({ queueUrl, logger });

        // Initialize use cases
        this.createWorkflow = new CreateWorkflow({
            workflowRepository: this.workflowRepository,
            integrationRepository: null, // Will be injected
            logger
        });

        this.executeWorkflow = new ExecuteWorkflow({
            workflowRepository: this.workflowRepository,
            workflowExecutionRepository: this.workflowExecutionRepository,
            queueService: this.queueService,
            integrationRepository: null, // Will be injected
            logger
        });

        this.executeWorkflowStep = new ExecuteWorkflowStep({
            workflowExecutionRepository: this.workflowExecutionRepository,
            integrationRepository: null, // Will be injected
            queueService: this.queueService,
            logger
        });
    }

    /**
     * Set integration repository for use cases
     * @param {Object} integrationRepository - Integration repository instance
     */
    setIntegrationRepository(integrationRepository) {
        this.createWorkflow.integrationRepository = integrationRepository;
        this.executeWorkflow.integrationRepository = integrationRepository;
        this.executeWorkflowStep.integrationRepository = integrationRepository;
    }

    /**
     * Create a new workflow
     * @param {Object} workflowConfig - Workflow configuration
     * @returns {Promise<Workflow>} Created workflow
     */
    async createWorkflow(workflowConfig) {
        return await this.createWorkflow.execute(this.userId, this.integrationId, workflowConfig);
    }

    /**
     * Execute a workflow
     * @param {string} workflowId - Workflow ID to execute
     * @param {string} triggerType - Trigger type
     * @param {Object} triggerData - Trigger data
     * @param {Object} options - Execution options
     * @returns {Promise<WorkflowExecution>} Execution instance
     */
    async executeWorkflow(workflowId, triggerType, triggerData = {}, options = {}) {
        return await this.executeWorkflow.execute(workflowId, triggerType, triggerData, {
            userId: this.userId,
            ...options
        });
    }

    /**
     * Get workflows for the current integration
     * @returns {Promise<Array<Workflow>>} Array of workflows
     */
    async getWorkflows() {
        return await this.workflowRepository.findWorkflowsByIntegrationAndUser(
            this.integrationId, 
            this.userId
        );
    }

    /**
     * Get workflow executions
     * @param {string} workflowId - Workflow ID (optional)
     * @param {Object} options - Query options
     * @returns {Promise<Array<WorkflowExecution>>} Array of executions
     */
    async getExecutions(workflowId = null, options = {}) {
        if (workflowId) {
            return await this.workflowExecutionRepository.findExecutionsByWorkflowId(workflowId, options);
        }
        
        // Get executions for all workflows of this integration
        const workflows = await this.getWorkflows();
        const workflowIds = workflows.map(w => w.id);
        
        const allExecutions = [];
        for (const id of workflowIds) {
            const executions = await this.workflowExecutionRepository.findExecutionsByWorkflowId(id, options);
            allExecutions.push(...executions);
        }
        
        // Sort by start time descending
        return allExecutions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }

    /**
     * Cancel a workflow execution
     * @param {string} executionId - Execution ID to cancel
     * @param {string} reason - Cancellation reason
     * @returns {Promise<void>}
     */
    async cancelExecution(executionId, reason = 'User cancelled') {
        return await this.executeWorkflow.cancelExecution(executionId, this.userId, reason);
    }

    /**
     * Resume a paused execution
     * @param {string} executionId - Execution ID to resume
     * @returns {Promise<WorkflowExecution>} Resumed execution
     */
    async resumeExecution(executionId) {
        return await this.executeWorkflow.resumeExecution(executionId, this.userId);
    }
}

module.exports = {
    // Domain Models
    Workflow,
    WorkflowExecution,
    
    // Step Types
    WorkflowStep,
    FunctionStep,
    FanOutStep,
    StepFactory,
    
    // Repositories
    WorkflowRepository,
    WorkflowExecutionRepository,
    
    // Use Cases
    CreateWorkflow,
    ExecuteWorkflow,
    ExecuteWorkflowStep,
    
    // Fluent API
    FriggWorkflow,
    
    // Queue Service
    WorkflowQueueService,
    
    // Database Models
    WorkflowModel,
    WorkflowExecutionModel,
    
    // Main Service
    WorkflowService
};