/**
 * A test stand-in for @friggframework/api-module-slack as ADR-054 item 6 describes it (bot token, fields.channel):
 * no extension, only an Api and a config field. Real HTTP through core's OAuth2Requester, so tests nock slack.com.
 */
const { OAuth2Requester } = require('../../../../modules/requester/oauth-2');

const BASE = 'https://slack.com/api';

class Api extends OAuth2Requester {
    postMessage(body) { return this._post({ url: `${BASE}/chat.postMessage`, body, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
    lookupUserByEmail(email) { return this._get({ url: `${BASE}/users.lookupByEmail`, query: { email } }); }
    listConversations() { return this._get({ url: `${BASE}/conversations.list`, query: { types: 'public_channel,private_channel', exclude_archived: true } }); }
}

const Definition = { moduleName: 'slack', getName: () => 'slack', API: Api };

const fields = {
    channel: ({ title = 'Channel', required = false } = {}) => ({
        module: 'slack',
        required,
        schema: { type: 'string', title },
        options: async (api) => ((await api.listConversations()).channels || []).map((c) => ({ const: c.id, title: `#${c.name}` })),
    }),
};

module.exports = { Api, Definition, extensions: {}, fields };
