'use strict';
const mongoose = require('mongoose');
const { createModel, Credential: Parent } = require('@friggframework/models');

const collectionName = 'MarketoCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    client_id: { type: String, trim: true },
    client_secret: { type: String, trim: true, lhEncrypt: true },
});

const _model = createModel(collectionName, _schema, parentModelObject);

class MarketoCredential extends Parent {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = MarketoCredential;
