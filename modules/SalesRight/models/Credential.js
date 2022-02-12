const mongoose = require('mongoose');
const { createModel } = require('@friggframework/database/mongo');
const Parent = require('@friggframework/models/Credential');

const collectionName = 'salesrightCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    accessToken: { type: String, lhEncrypt: true },
    refreshToken: { type: String, lhEncrypt: true },
    accessTokenExpire: { type: String },
    refreshTokenExpire: { type: String },
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
