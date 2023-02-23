const { graphApi } = require('./graph');
const { botFrameworkApi } = require('./botFramework');
const { get } = require('@friggframework/assertions');

class Api {
    constructor(params) {
        this.graphApi = new graphApi({ access_token: get(params, 'graph_access_token', null)}, ...params);
        this.botFrameworkApi = new botFrameworkApi({  access_token: get(params, 'bot_access_token', null)}, ...params);
    }
}

module.exports = { Api };
