const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Credential');

const collectionName = 'terminusCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    apiKey: {
        type: String,
        trim: true,
        unique: true,
        lhEncrypt: true,
    },
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
