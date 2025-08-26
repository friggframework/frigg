const { mongoose } = require('../database/mongoose');

const schema = new mongoose.Schema(
    {
        entities: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Entity',
                required: true,
            },
        ],
        entityReference: {
            type: mongoose.Schema.Types.Map,
            of: String,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        },
        status: {
            type: String,
            enum: [
                'ENABLED',
                'NEEDS_CONFIG',
                'PROCESSING',
                'DISABLED',
                'ERROR',
            ],
            default: 'ENABLED',
        },
        config: {},
        version: { type: String },
        messages: {
            errors: [],
            warnings: [],
            info: [],
            logs: [],
        },
    },
    { timestamps: true }
);

const Integration =
    mongoose.models.Integration || mongoose.model('Integration', schema);
module.exports = { IntegrationModel: Integration };
