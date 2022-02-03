'use strict';
const mongoose = require('mongoose');
const { createModel } = require('@friggframework/database/mongo');
const Parent = require('frigg/models/Entity');

const collectionName = 'HubSpotEntity';
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

module.exports = Entity;
