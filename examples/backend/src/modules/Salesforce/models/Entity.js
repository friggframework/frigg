'use strict';
const mongoose = require('mongoose');
const moment = require('moment');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Entity');

const collectionName = 'salesforceEntity';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    isSandbox: Boolean,
    connectedUsername: String,
});

const _model = MongooseUtil.createModel(
    collectionName,
    _schema,
    parentModelObject
);

class Entity extends Parent {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = Entity;
