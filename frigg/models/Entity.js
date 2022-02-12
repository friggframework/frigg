'use strict';
const mongoose = require('mongoose');
const { createModel } = require('@friggframework/database/mongo');
const LHBaseModelObject = require('../LHBaseModelObject');
const collectionName = 'Entity';

let _schema = LHBaseModelObject.Schema.clone();

_schema.add({
    credential: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Credential',
        required: false,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String },
    externalId: { type: String },
});

_schema.static('upsert', async function upsert(filter, obj) {
    return this.findOneAndUpdate(filter, obj, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
    });
});

const _model = createModel(collectionName, _schema);

class Entity extends LHBaseModelObject {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }

    async getByUserId(userId) {
        let entities = await this.list({ user: userId });
        if (entities.length == 0) {
            return null;
        } else if (entities.length == 1) {
            return entities[0];
        } else {
            throw new Error('multiple entities with same userId');
        }
    }
}

module.exports = Entity;
