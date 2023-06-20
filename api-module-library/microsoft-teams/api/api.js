const { graphApi } = require('./graph');
const { botFrameworkApi } = require('./botFramework');
const { botApi } = require('./bot')
const { get } = require('@friggframework/assertions');

class Api {
    constructor(params) {
        this.graphApi = new graphApi({ access_token: get(params, 'graph_access_token', null), ...params});
        this.botFrameworkApi = new botFrameworkApi({  access_token: get(params, 'bot_access_token', null), ...params});
        this.botApi = new botApi(params);
    }

    async getTokenFromClientCredentials(){
        await this.graphApi.getTokenFromClientCredentials();
        await this.botFrameworkApi.getTokenFromClientCredentials();
    }

    async createConversationReferences(teamId=null){
        if (teamId) {
            this.graphApi.setTeamId(teamId);
        } else if (!this.graphApi.team_id) {
            throw new Error('Conversation references are not available without a team id');
        }
        const teamChannel = await this.graphApi.getPrimaryChannel();
        const teamMembers = await this.botFrameworkApi.getTeamMembers(teamChannel.id);
        const initialRef =
            {
                bot: {
                    id: this.client_id
                },
                conversation: {
                    tenantId: this.botFrameworkApi.tenant_id
                },
                serviceUrl: this.botFrameworkApi.serviceUrl,
                channelId: teamChannel.id
            };
        await Promise.all(teamMembers.members.map(async (member) => {
            await this.botApi.createConversationReference(initialRef, member);
        }));
        return this.botApi.conversationReferences;
    }
}

module.exports = { Api };
