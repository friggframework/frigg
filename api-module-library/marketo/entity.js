'use strict';
const mongoose = require('mongoose');
const { Entity } = require('@friggframework/models');

const _schema = new mongoose.Schema({
    munchkin_id: { type: String, trim: true },
});

const parentModel = new Entity();
const _model = parentModel.model.discriminator('MarketoEntity', _schema);

class MarketoEntity extends Entity {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = MarketoEntity;
