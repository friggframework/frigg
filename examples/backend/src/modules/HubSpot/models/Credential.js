const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Credential');

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
    portalId: {
        type: String,
        trim: true,
        required: true,
        unique: true,
    },
    accessTokenExpire: { type: Date },
    expires_at: { type: Date },
});

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
