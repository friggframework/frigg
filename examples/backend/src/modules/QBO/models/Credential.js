'use strict';
const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Credential');

const collectionName = 'qboCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    realmId: { type: String, required: true },
    accessToken: { type: String },
    refreshToken: { type: String },
    accessTokenExpire: { type: String },
    refreshTokenExpire: { type: String },
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
