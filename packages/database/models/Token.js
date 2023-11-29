const { mongoose } = require('../mongoose');
const moment = require('moment');
const bcrypt = require('bcryptjs');

const collectionName = 'Token';
const decimals = 10;

const schema = new mongoose.Schema({
    token: { type: String, required: true },
    created: { type: Date, default: Date.now },
    expires: { type: Date },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

schema.static({
    createTokenWithExpire: async function (userId, rawToken, minutes) {
        // Create user token
        let tokenHash = await bcrypt.hashSync(rawToken, parseInt(decimals));

        let session = {
            token: tokenHash,
            expires: moment().add(minutes, 'minutes').toISOString(),
            user: userId,
        };

        return this.create(session);
    },
    // Takes in a token object and  that has been created in the database and the raw token value.
    // Returns a json of just the token and id to return to the browser
    createJSONToken: function (token, rawToken) {
        let returnArr = {
            id: token.id,
            token: rawToken,
        };
        return JSON.stringify(returnArr);
    },
    // Takes in a token object and  that has been created in the database and the raw token value.
    // Returns a base64 buffer of just the token and id to return to the browser
    createBase64BufferToken: function (token, rawToken) {
        let jsonVal = Token.createJSONToken(token, rawToken);
        return Buffer.from(jsonVal).toString('base64');
    },
    getJSONTokenFromBase64BufferToken: function (buffer) {
        let tokenStr = Buffer.from(buffer.trim(), 'base64').toString('ascii');
        return JSON.parse(tokenStr);
    },

    // Takes in a JSON Token with id and token in it and verifies the token
    // is valid from the database. If it is not va
    validateAndGetTokenFromJSONToken: async function (tokenObj) {
        let sessionToken = await this.findById(tokenObj.id);
        if (sessionToken) {
            if (
                !(await bcrypt.compareSync(tokenObj.token, sessionToken.token))
            ) {
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
})

const Token = mongoose.models.Token || mongoose.model(collectionName, schema);

module.exports = { Token };
