const mongoose = require('mongoose');
const MongooseUtil = require('../utils/MongooseUtil');
const Parent = require('./User');

const collectionName = 'OrganizationUser';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
	appOrgId: { type: String, required: true, unique: true },
	name: { type: String },
});

const _model = MongooseUtil.createModel(collectionName, _schema, parentModelObject);

class OrganizationUser extends Parent {
	static Schema = _schema;

	static Model = _model;

	constructor(model = _model) {
		super(model);
	}

	async getUserByAppOrgId(appOrgId) {
		const getByUser = await this.list({ appOrgId });

		if (getByUser.length > 1) {
			throw new Error('Supposedly using a unique appOrgId? Please reach out to our developers');
		}

		if (getByUser.length === 1) {
			return getByUser[0];
		}
	}
}

module.exports = OrganizationUser;
