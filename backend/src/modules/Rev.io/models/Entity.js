const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil');
const Parent = require('../../../base/models/Entity');

const collectionName = 'RevioEntity';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    username: { type: String },
    webhook_receivers: [{ type: String }],
    webhook_subscriptions: [{ type: String }],
});

const _model = MongooseUtil.createModel(
    collectionName,
    _schema,
    parentModelObject
);

class Entity extends Parent {
    static Schema = _schema;
    static Model = _model;

    constructor(model = _model) {
        super(model);
    }
}

module.exports = Entity;
