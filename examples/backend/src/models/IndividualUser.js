const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const MongooseUtil = require('../utils/MongooseUtil');
const Parent = require('./User');

const decimals = 10;

const collectionName = 'IndividualUser';
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
	email: { type: String, unique: true },
	username: { type: String, unique: true },
	hashword: { type: String },
	appUserId: { type: String },
	organizationUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const _model = MongooseUtil.createModel(collectionName, _schema, parentModelObject);

class IndividualUser extends Parent {
	static Schema = _schema;

	static Model = _model;

	constructor(model = _model) {
		super(model);
	}

	async create(obj) {
		if ('password' in obj) {
			obj.hashword = await bcrypt.hashSync(obj.password, parseInt(decimals));
			delete obj.password;
		}
		return super.create(obj);
	}

	async update(id, options) {
		if ('password' in options) {
			options.hashword = await bcrypt.hashSync(options.password, parseInt(decimals));
			delete options.password;
		}
		return super.update(id, options);
	}

	async getUserByUsername(username) {
		const getByUser = await this.list({ username });

		if (getByUser.length > 1) {
			throw new Error('Unique username or email? Please reach out to our developers');
		}

		if (getByUser.length === 1) {
			return getByUser[0];
		}
	}

	async getUserByAppUserId(appUserId) {
		const getByUser = await this.list({ appUserId });

		if (getByUser.length > 1) {
			throw new Error('Supposedly using a unique appUserId? Please reach out to our developers');
		}

		if (getByUser.length === 1) {
			return getByUser[0];
		}
	}
}

module.exports = IndividualUser;
