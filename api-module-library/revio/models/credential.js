const mongoose = require('mongoose');
const { createModel, Credential: Parent } = require('@friggframework/models');

const collectionName = 'RevioCredential';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    // password: { type: String, required: true, lhEncrypt: true },
    // client_code: { type: String, required: true, lhEncrypt: true }
    password: { type: String, required: true },
    client_code: { type: String, required: true },
});

const _model = createModel(collectionName, _schema, parentModelObject);

class Credential extends Parent {
    static Schema = _schema;

    static Model = _model;

    constructor(model = _model) {
        super(model);
    }

    async getUserByUserName(username) {
        const getUserByUserName = await this.list({ username });
        if (getUserByUserName.length == 0) {
            return null;
        }
        if (getUserByUserName.length == 1) {
            return getUserByUserName[0];
        }

        throw new Error('multiple users with same user name');
    }
}

module.exports = Credential;
