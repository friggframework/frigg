const mongoose = require('mongoose');
const LHBaseClass = require('./LHBaseClass');
const MongooseUtil = require('../utils/MongooseUtil');

const collectionName = 'Base';

const _schema = new mongoose.Schema({
	dateCreated: { type: Date, default: Date.now },
	dateUpdated: { type: Date, default: Date.now },
});
// Automatically update the dateUpdated timestamp if `.save()` method is called
_schema.pre('save', async () => {
	this.dateUpdated = Date.now();
});

const _model = MongooseUtil.createModel(collectionName, _schema);

class LHBaseModelObject extends LHBaseClass {
	static Schema = _schema;
	static Model = _model;

	constructor(model = _model) {
		super();
		this.model = model;
	}

	async create(obj) {
		return this.model.create(obj);
	}

	async list(filter = {}, fieldsToSelect, options = {}) {
		return await this.model.find(filter, fieldsToSelect, options);
	}

	async get(id, fieldsToSelect, options = {}) {
		return await this.model.findById(id, fieldsToSelect, options);
	}

	async update(id, setData, pushData) {
		setData.dateUpdated = Date.now();
		let updateObject = {
			$set: setData,
		};
		if (pushData) updateObject.$push = pushData;
		return this.model.findOneAndUpdate(
			{
				_id: id,
			},
			updateObject,
			{
				new: true,
				useFindAndModify: true,
			}
		);
	}

	async upsert(filter, obj) {
		obj.updated = Date.now();
		return this.model.findOneAndUpdate(filter, obj, {
			new: true,
			upsert: true,
			setDefaultsOnInsert: true,
		});
	}

	async delete(id) {
		await this.model.findOneAndDelete({ _id: id });
		return id;
	}
}

module.exports = LHBaseModelObject;
