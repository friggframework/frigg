const { mongoose } = require('../mongoose');

const workflowSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 200
    },
    description: { 
        type: String,
        trim: true,
        maxlength: 1000
    },
    integrationId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Integration', 
        required: true,
        index: true
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'IndividualUser', 
        required: true,
        index: true
    },
    status: { 
        type: String, 
        enum: ['ACTIVE', 'PAUSED', 'ERROR', 'DISABLED'],
        default: 'ACTIVE',
        index: true
    },
    definition: {
        steps: [{ 
            type: mongoose.Schema.Types.Mixed,
            required: true
        }],
        triggers: [{ 
            type: mongoose.Schema.Types.Mixed,
            required: true
        }]
    },
    metadata: {
        createdAt: { 
            type: Date, 
            default: Date.now,
            index: true
        },
        updatedAt: { 
            type: Date, 
            default: Date.now
        },
        version: { 
            type: String, 
            default: '1.0.0'
        },
        tags: [String],
        category: String,
        lastExecutedAt: Date,
        executionCount: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// Indexes for better query performance
workflowSchema.index({ integrationId: 1, userId: 1 });
workflowSchema.index({ status: 1, 'metadata.createdAt': -1 });
workflowSchema.index({ userId: 1, status: 1 });

// Virtual for workflow summary
workflowSchema.virtual('stepCount').get(function() {
    return this.definition && this.definition.steps ? this.definition.steps.length : 0;
});

workflowSchema.virtual('triggerCount').get(function() {
    return this.definition && this.definition.triggers ? this.definition.triggers.length : 0;
});

// Pre-save middleware to update metadata.updatedAt
workflowSchema.pre('save', function(next) {
    this.metadata.updatedAt = new Date();
    next();
});

// Pre-update middleware to update metadata.updatedAt
workflowSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    this.set({ 'metadata.updatedAt': new Date() });
    next();
});

// Instance methods
workflowSchema.methods.isExecutable = function() {
    return this.status === 'ACTIVE' && 
           this.definition && 
           this.definition.steps && 
           this.definition.steps.length > 0;
};

workflowSchema.methods.getSummary = function() {
    return {
        id: this._id,
        name: this.name,
        description: this.description,
        status: this.status,
        stepCount: this.stepCount,
        triggerCount: this.triggerCount,
        createdAt: this.metadata.createdAt,
        updatedAt: this.metadata.updatedAt,
        version: this.metadata.version,
        executionCount: this.metadata.executionCount
    };
};

// Static methods
workflowSchema.statics.findByIntegrationAndUser = function(integrationId, userId) {
    return this.find({ integrationId, userId });
};

workflowSchema.statics.findActiveWorkflows = function(filters = {}) {
    return this.find({ status: 'ACTIVE', ...filters });
};

const WorkflowModel = mongoose.models.WorkflowModel || mongoose.model('WorkflowModel', workflowSchema);

module.exports = { WorkflowModel };