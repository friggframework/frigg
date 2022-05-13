'use strict';
const mongoose = require('mongoose');
const { createModel, Credential: Parent } = require('@friggframework/models');

const collectionName = 'RevIoCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    user_code: { type: String },
    password: { type: String },
    webhook_recibers: [{ type: String }],
    webhook_suscriptions: [{ type: String }],
});

const _model = createModel(collectionName, _schema, parentModelObject);

class RevIoCredentials extends Parent {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }

    async getUserByUserName(user_name) {
        let getUserByUserName = await this.list({ user_name: user_name });
        if (getUserByUserName.length == 0) {
            return null;
        } else if (getUserByUserName.length == 1) {
            return getUserByUserName[0];
        } else {
            throw new Error('multiple users with same user name');
        }
    }
}

module.exports = RevIoCredentials;
