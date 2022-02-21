const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Credential');

const collectionName = 'AttentiveCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    access_token: { type: String, trim: true, lhEncrypt: true },
    id_token: { type: String, trim: true, lhEncrypt: true },
    token_type: { type: String, default: 'Bearer' },
    expires_in: { type: Number },
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
