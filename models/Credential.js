'use strict';
const mongoose = require('mongoose');
const { createModel } = require('@friggframework/database/mongo');
const BaseModelObject = require('./BaseModelObject');
const LHEncrypt = require('@friggframework/encrypt');

const collectionName = 'Credentials';
const _schema = BaseModelObject.Schema.clone();

_schema.add({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    auth_is_valid: { type: Boolean },
    externalId: { type: String }, // Used for lookups, identifying the owner of the credential
});

_schema.plugin(LHEncrypt);

const _model = createModel(collectionName, _schema);

class Credentials extends BaseModelObject {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = Credentials;
