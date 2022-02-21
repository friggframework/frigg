const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil.js');
const Parent = require('../../../base/models/Credential');

const collectionName = 'SalesForceCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    accessToken: {
        type: String,
        required: true,
        lhEncrypt: true,
    },
    refreshToken: {
        type: String,
        required: true,
        lhEncrypt: true,
    },
    instanceUrl: { type: String, required: true },
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

    // async getUserByEmail(email){
    //     let getUserByEmail = await this.list({email: email});
    //     if(getUserByEmail.length == 0){
    //         return null;
    //     }
    //     else if(getUserByEmail.length == 1) {
    //         return getUserByEmail[0];
    //     }
    //     else{
    //         throw new Error("multiple users with same email")
    //     }
    // }
}

module.exports = Credential;
