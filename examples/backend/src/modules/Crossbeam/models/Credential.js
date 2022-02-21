const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Credential');

const collectionName = 'CrossbeamCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    crossbeam_user_id: { type: Number, unique: true },
    access_token: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    refresh_token: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    // expires_in: { type: String, trim: true },
    // expires_at: { type: Date },
    // auth_created_at: { type: Date },
    // authorized: { type: Boolean },
    auth_is_valid: { type: Boolean, default: true },
    // user_name: { type: String, trim: true },
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
