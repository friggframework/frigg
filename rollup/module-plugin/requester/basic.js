const { Requester } = require('./requester');
const { get } = require('../../assertions');
const { ModuleConstants } = require('../ModuleConstants');

class BasicAuthRequester extends Requester {

    static requesterType = ModuleConstants.authType.basic;

    constructor(params) {
        super(params);

        this.username = get(params, 'username', null);
        this.password = get(params, 'password', null);
    }

    async addAuthHeaders(headers) {
        if (this.username && this.password) {
            headers['Authorization'] =
                'Basic ' +
                Buffer.from(this.username + ':' + this.password).toString(
                    'base64'
                );
        }
        return headers;
    }

    isAuthenticated() {
        return (
            this.username !== null &&
            this.username !== undefined &&
            this.username.trim().length() > 0
        );
    }

    setUsername(username) {
        this.username = username;
    }
    setPassword(password) {
        this.password = password;
    }
}

module.exports = { BasicAuthRequester };
