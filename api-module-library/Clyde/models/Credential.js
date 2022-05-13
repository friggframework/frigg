const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Credential');

const collectionName = 'clydeCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    // Clyde Access Details
    clientKey: {
        type: String,
        trim: true,
        unique: true,
    },
    secret: {
        type: String,
        trim: true,
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
