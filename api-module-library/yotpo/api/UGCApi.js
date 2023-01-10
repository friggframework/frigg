const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class UGCApi extends ApiKeyRequester {}
module.exports = { UGCApi };
