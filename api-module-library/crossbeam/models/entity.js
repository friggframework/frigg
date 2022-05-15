'use strict';
const mongoose = require('mongoose');
const moment = require('moment');
const { createModel, Entity: Parent } = require('@friggframework/models');

const collectionName = 'CrossbeamEntity';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    organization_id: { type: String, trim: true, unique: true },
});

const _model = createModel(collectionName, _schema, parentModelObject);

class Entity extends Parent {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = Entity;
