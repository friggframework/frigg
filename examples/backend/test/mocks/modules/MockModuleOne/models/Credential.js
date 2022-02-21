'use strict';
const mongoose = require('mongoose');

const MongooseUtil = require('../../../../../src/utils/MongooseUtil');
const Parent = require('../../../../../src/base/models/Credential');

const collectionName = 'mockModuleOneCredential';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({});

const _model = MongooseUtil.createModel(
    collectionName,
    _schema,
    parentModelObject
);

class Credential extends Parent {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = Credential;
