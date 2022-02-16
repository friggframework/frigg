const mongoose = require('mongoose');
const { Base } = require('./base');
const { createModel } = require('./create-model');

const collectionName = 'Integration';
const _schema = Base.Schema.clone();

_schema.add({
    entities: [
        { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
    ],
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['ENABLED', 'NEEDS_CONFIG', 'PROCESSING', 'DISABLED', 'ERROR'],
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
});

const _model = createModel(collectionName, _schema);

class Integration extends Base {
    static Schema = _schema;

    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = { Integration };
