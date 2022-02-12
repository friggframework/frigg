const mongoose = require('mongoose');
const { createModel } = require('@friggframework/database/mongo');
const Parent = require('frigg/models/Credential');

const collectionName = 'hubspotCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    // HS Access Details
    accessToken: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    refreshToken: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    accessTokenExpire: { type: Date },
    expires_at: { type: Date },
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
