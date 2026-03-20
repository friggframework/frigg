const { mongoose } = require('../mongoose');

const stepExecutionSchema = new mongoose.Schema({
    stepId: {
        type: String,
        required: true
    },
    stepName: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['RUNNING', 'COMPLETED', 'FAILED', 'RETRYING'],
        required: true
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: Date,
    result: mongoose.Schema.Types.Mixed,
    error: {
        message: String,
        stack: String,
        code: String,
        timestamp: Date
    },
    retryCount: {
        type: Number,
        default: 0
    },
    duration: Number // Duration in milliseconds
}, { _id: false });

const fanOutStateSchema = new mongoose.Schema({
    stepId: String,
    stepName: String,
    totalBatches: {
        type: Number,
        required: true
    },
    completedBatches: {
        type: Number,
        default: 0
    },
    batchResults: [mongoose.Schema.Types.Mixed],
    aggregatedResult: mongoose.Schema.Types.Mixed,
    status: {
        type: String,
        enum: ['RUNNING', 'COMPLETED', 'FAILED'],
        default: 'RUNNING'
    },
    fanOutType: {
        type: String,
        enum: ['PAGINATION', 'DATA_PROCESSING'],
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date,
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const workflowExecutionSchema = new mongoose.Schema({
    workflowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WorkflowModel',
        required: true,
        index: true
    },
    triggerType: {
        type: String,
        enum: ['MANUAL', 'WEBHOOK', 'SCHEDULE', 'EVENT'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['RUNNING', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED'],
        default: 'RUNNING',
        index: true
    },
    startTime: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    endTime: Date,
    stepExecutions: [stepExecutionSchema],
    context: {
        triggerData: mongoose.Schema.Types.Mixed,
        stepResults: mongoose.Schema.Types.Mixed,
        variables: mongoose.Schema.Types.Mixed,
        currentStep: String,
        fanOutStates: {
            type: Map,
            of: fanOutStateSchema
        }
    },
    metadata: {
        totalSteps: {
            type: Number,
            default: 0
        },
        completedSteps: {
            type: Number,
            default: 0
        },
        failedSteps: {
            type: Number,
            default: 0
        },
        retryCount: {
            type: Number,
            default: 0
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'IndividualUser'
        },
        integrationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Integration'
        },
        executionSource: String, // 'UI', 'API', 'WEBHOOK', etc.
        parentExecutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WorkflowExecutionModel'
        }
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Indexes for performance
workflowExecutionSchema.index({ workflowId: 1, startTime: -1 });
workflowExecutionSchema.index({ status: 1, lastUpdated: 1 });
workflowExecutionSchema.index({ 'metadata.userId': 1, startTime: -1 });
workflowExecutionSchema.index({ triggerType: 1, status: 1 });

// TTL index to automatically delete old completed executions after 90 days
workflowExecutionSchema.index(
    { endTime: 1 }, 
    { 
        expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days
        partialFilterExpression: { 
            status: { $in: ['COMPLETED', 'FAILED', 'CANCELLED'] } 
        }
    }
);

// Virtual properties
workflowExecutionSchema.virtual('duration').get(function() {
    if (!this.startTime) return 0;
    const endTime = this.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
});

workflowExecutionSchema.virtual('progress').get(function() {
    if (!this.metadata.totalSteps || this.metadata.totalSteps === 0) return 0;
    return (this.metadata.completedSteps / this.metadata.totalSteps) * 100;
});

workflowExecutionSchema.virtual('isRunning').get(function() {
    return this.status === 'RUNNING';
});

workflowExecutionSchema.virtual('isCompleted').get(function() {
    return this.status === 'COMPLETED';
});

workflowExecutionSchema.virtual('isFailed').get(function() {
    return this.status === 'FAILED';
});

// Pre-save middleware
workflowExecutionSchema.pre('save', function(next) {
    this.lastUpdated = new Date();
    
    // Calculate completed steps from stepExecutions
    if (this.stepExecutions) {
        this.metadata.completedSteps = this.stepExecutions.filter(
            step => step.status === 'COMPLETED'
        ).length;
        this.metadata.failedSteps = this.stepExecutions.filter(
            step => step.status === 'FAILED'
        ).length;
    }
    
    next();
});

// Pre-update middleware
workflowExecutionSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    this.set({ lastUpdated: new Date() });
    next();
});

// Instance methods
workflowExecutionSchema.methods.addStepExecution = function(stepExecution) {
    // Calculate duration if not provided
    if (stepExecution.startTime && stepExecution.endTime && !stepExecution.duration) {
        stepExecution.duration = stepExecution.endTime.getTime() - stepExecution.startTime.getTime();
    }
    
    this.stepExecutions.push(stepExecution);
    this.lastUpdated = new Date();
    
    // Update context with step result if provided
    if (stepExecution.result && stepExecution.stepName) {
        if (!this.context.stepResults) {
            this.context.stepResults = {};
        }
        this.context.stepResults[stepExecution.stepName] = stepExecution.result;
    }
    
    this.context.currentStep = stepExecution.stepId;
};

workflowExecutionSchema.methods.updateStatus = function(newStatus, endTime = null) {
    this.status = newStatus;
    this.lastUpdated = new Date();
    
    if (endTime) {
        this.endTime = endTime;
    } else if (newStatus === 'COMPLETED' || newStatus === 'FAILED' || newStatus === 'CANCELLED') {
        this.endTime = new Date();
    }
};

workflowExecutionSchema.methods.getLastCompletedStep = function() {
    const completedSteps = this.stepExecutions.filter(step => step.status === 'COMPLETED');
    return completedSteps.length > 0 ? completedSteps[completedSteps.length - 1] : null;
};

workflowExecutionSchema.methods.getSummary = function() {
    return {
        id: this._id,
        workflowId: this.workflowId,
        triggerType: this.triggerType,
        status: this.status,
        startTime: this.startTime,
        endTime: this.endTime,
        duration: this.duration,
        progress: this.progress,
        stepCount: this.stepExecutions.length,
        completedSteps: this.metadata.completedSteps,
        failedSteps: this.metadata.failedSteps,
        currentStep: this.context.currentStep,
        fanOutSteps: this.context.fanOutStates ? Array.from(this.context.fanOutStates.keys()) : []
    };
};

// Static methods
workflowExecutionSchema.statics.findByWorkflow = function(workflowId, options = {}) {
    const query = this.find({ workflowId });
    
    if (options.limit) query.limit(options.limit);
    if (options.sort) query.sort(options.sort);
    else query.sort({ startTime: -1 });
    
    return query;
};

workflowExecutionSchema.statics.findRunning = function(filters = {}) {
    return this.find({ status: 'RUNNING', ...filters });
};

workflowExecutionSchema.statics.findStalled = function(minutesStalled = 30) {
    const stalledTime = new Date(Date.now() - minutesStalled * 60 * 1000);
    return this.find({
        status: 'RUNNING',
        lastUpdated: { $lt: stalledTime }
    });
};

workflowExecutionSchema.statics.getStatistics = function(filters = {}) {
    return this.aggregate([
        { $match: filters },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgDuration: { 
                    $avg: { 
                        $cond: [
                            { $and: ['$startTime', '$endTime'] },
                            { $subtract: ['$endTime', '$startTime'] },
                            null
                        ]
                    }
                },
                avgCompletedSteps: { $avg: '$metadata.completedSteps' }
            }
        },
        { $sort: { _id: 1 } }
    ]);
};

const WorkflowExecutionModel = mongoose.models.WorkflowExecutionModel || 
    mongoose.model('WorkflowExecutionModel', workflowExecutionSchema);

module.exports = { WorkflowExecutionModel };