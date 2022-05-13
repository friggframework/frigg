const mongoose = require('mongoose');

const { createModel, Credential: Parent } = require('@friggframework/models');

const collectionName = 'terminusCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    apiKey: {
        type: String,
        trim: true,
        unique: true,
        lhEncrypt: true,
    },
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
