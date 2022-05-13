'use strict';
const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil.js');
const Parent = require('../../../base/models/Credential');
let aes = require('../../../utils/encryption/aes.js');

const collectionName = 'ZoomCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    access_token: { type: String, trim: true, set: aes.encrypt, get: aes.decrypt },
    refresh_token: { type: String, trim: true, set: aes.encrypt, get: aes.decrypt },
    auth_is_valid: { type: Boolean, default: true },
});

const _model = MongooseUtil.createModel(collectionName, _schema, parentModelObject);

class Credentials extends Parent{
    static Schema = _schema;
    static Model = _model;

    constructor(model=_model){
        super(model);
    }
}

module.exports = Credentials;