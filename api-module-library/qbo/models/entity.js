const mongoose = require('mongoose');
const moment = require('moment');
const { createModel, Entity: Parent } = require('@friggframework/models');

const collectionName = 'QBOEntity';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({});

const _model = createModel(collectionName, _schema, parentModelObject);

class Entity extends Parent {
    static Schema = _schema;

    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = { Entity };
