const mongoose = require('mongoose');
const moment = require('moment');
const MongooseUtil = require('../utils/MongooseUtil');
const bcrypt = require('bcryptjs');
const LHBaseModelObject = require('../base/LHBaseModelObject');

const collectionName = 'Token';
const decimals = 10;

const _schema = new mongoose.Schema({
	token: { type: String, required: true },
	created: { type: Date, default: Date.now },
	expires: { type: Date },
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

const _model = MongooseUtil.createModel(collectionName, _schema);

class Token extends LHBaseModelObject {
	static Schema = _schema;
	static Model = _model;

	constructor(model = _model, schema = _schema) {
		super(model, schema);
	}

	// creates a token from a raw token (random bytes) that expires in Y minutes for
	// a given user id
	async createTokenWithExpire(userId, rawToken, minutes) {
		// Create user token
		let tokenHash = await bcrypt.hashSync(rawToken, parseInt(decimals));

		let session = {
			token: tokenHash,
			expires: moment().add(minutes, 'minutes').toISOString(),
			user: userId,
		};

		return this.create(session);
	}

	// Takes in a token object and  that has been created in the database and the raw token value.
	// Returns a json of just the token and id to return to the browser
	static createJSONToken(token, rawToken) {
		let returnArr = {
			id: token.id,
			token: rawToken,
		};
		return JSON.stringify(returnArr);
	}

	// Takes in a token object and  that has been created in the database and the raw token value.
	// Returns a base64 buffer of just the token and id to return to the browser
	static createBase64BufferToken(token, rawToken) {
		let jsonVal = Token.createJSONToken(token, rawToken);
		return Buffer.from(jsonVal).toString('base64');
	}

	static getJSONTokenFromBase64BufferToken(buffer) {
		let tokenStr = Buffer.from(buffer.trim(), 'base64').toString('ascii');
		return JSON.parse(tokenStr);
	}

	// Takes in a JSON Token with id and token in it and verifies the token
	// is valid from the database. If it is not va
	async validateAndGetTokenFromJSONToken(tokenObj) {
		let sessionToken = await this.get(tokenObj.id);
		if (sessionToken) {
			if (!(await bcrypt.compareSync(tokenObj.token, sessionToken.token))) {
				throw new Error('Invalid Token: Token does not match');
			}
			if (moment(sessionToken.expires).isBefore(moment())) {
				throw new Error('Invalid Token: Token is expired');
			}

			return sessionToken;
		} else {
			throw new Error('Invalid Token: Token does not exist');
		}
	}
}

module.exports = Token;
