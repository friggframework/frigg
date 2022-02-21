const mongoose = require('mongoose');
const MongooseUtil = require('../../../utils/MongooseUtil.js');
const Parent = require('../../../base/models/Credential');

const collectionName = 'ConnectWiseCredentials';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
    public_key: {
        type: String,
        required: true,
        lhEncrypt: true,
    },
    private_key: {
        type: String,
        required: true,
        lhEncrypt: true,
    },
    company_id: { type: String, required: true, unique: true },
    site: { type: String, required: true },
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

    async getUserByCompanyId(company_id) {
        const getUserByCompanyId = await this.list({ company_id });
        if (getUserByCompanyId.length == 0) {
            return null;
        }
        if (getUserByCompanyId.length == 1) {
            return getUserByCompanyId[0];
        }

        throw new Error('multiple users with same company id');
    }
}

module.exports = Credential;
