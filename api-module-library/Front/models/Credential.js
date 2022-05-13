'use strict';
const mongoose = require('mongoose');
const { createModel, Credential: Parent } = require('@friggframework/models');

const collectionName = 'FrontCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    access_token: { type: String, trim: true, lhEncrypt: true },
    refresh_token: { type: String, trim: true, lhEncrypt: true },
    auth_is_valid: { type: Boolean, default: true },
});

const _model = createModel(collectionName, _schema, parentModelObject);

class Credential extends Parent {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = Credential;
