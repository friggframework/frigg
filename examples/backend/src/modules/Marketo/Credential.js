'use strict';
const mongoose = require('mongoose');
const MongooseUtil = require('../../utils/MongooseUtil.js');
const Parent = require('../../base/models/Credential');

const collectionName = 'MarketoCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    client_id: { type: String, trim: true },
    client_secret: { type: String, trim: true, lhEncrypt: true },
});

const _model = MongooseUtil.createModel(
    collectionName,
    _schema,
    parentModelObject
);

class MarketoCredential extends Parent {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = MarketoCredential;
