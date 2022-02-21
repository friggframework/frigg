const mongoose = require('mongoose');
const MongooseUtil = require('../utils/MongooseUtil.js');
const LHBaseModelObject = require('../base/LHBaseModelObject');

const collectionName = 'User';

const _schema = LHBaseModelObject.Schema.clone();

const _model = MongooseUtil.createModel(collectionName, _schema);

class User extends LHBaseModelObject {
    static Schema = _schema;

    static Model = _model;

    constructor(model = _model, schema = _schema) {
        super(model, schema);
    }
}

module.exports = User;
