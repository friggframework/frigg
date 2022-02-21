'use strict';
const mongoose = require('mongoose');
const moment = require('moment');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Entity');

const collectionName = 'RollWorksEntity';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    organization_id: { type: String, trim: true, unique: true },
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
