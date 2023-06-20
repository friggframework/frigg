const { BotFrameworkAdapter, StatusCodes, TeamsActivityHandler, CardFactory, MessageFactory, TeamsInfo, TurnContext
} = require('botbuilder');
const {OAuth2Requester} = require("@friggframework/module-plugin");
const {get} = require("@friggframework/assertions");


class botApi {
    constructor(params) {
        // bot expects to listen on
        this.adapter = new BotFrameworkAdapter({
            appId: params.client_id,
            appPassword: params.client_secret
        });
        this.adapter.onTurnError = async (context, error) => {
            await context.sendTraceActivity(
                'OnTurnError Trace',
                `${ error }`,
                'https://www.botframework.com/schemas/error',
                'TurnError'
            );
            await context.sendActivity('The bot encountered an error.');
        };
        this.conversationReferences = {};
        this.botId = params.client_id;
        this.tenantId = params.tenant_id;
        this.serviceUrl = params.service_url;
        this.bot = new Bot(this.adapter, this.conversationReferences);
    }
    async receiveActivity(req, res){
        await this.adapter.process(req, res, (context) => this.bot.run(context));
    }

    async setConversationReferenceFromMembers(members){
        const ref = {
            bot: {
                id: this.botId
            },
            conversation: {
                tenantId: this.tenantId
            },
            serviceUrl: this.serviceUrl,
            channelId: 'msteams'
        }

        const refRequests = [];
        members.map( (member) => {
            ref.user = member;
            refRequests.push( this.adapter.createConversation(ref, async (context) => {
                const ref = TurnContext.getConversationReference(context.activity);
                this.conversationReferences[member.email] = ref;
            }));
        });
        await Promise.all(refRequests);
        return this.conversationReferences
    }

    async sendProactive(userEmail, activity) {
        const conversationReference = this.conversationReferences[userEmail];
        if (conversationReference !== undefined) {
            await this.adapter.continueConversation(conversationReference, async (context) => {
                await context.sendActivity(activity);
            });
        }
    }

    async createConversationReference(initialRef,member){
        initialRef.user = member;
        await this.adapter.createConversation(initialRef, async (context) => {
            const ref = TurnContext.getConversationReference(context.activity);
            this.conversationReferences[member.email] = ref;
        });
        return this.conversationReferences[member.email];
    }
}

const invokeResponse = (card) => {
    const cardRes = {
        statusCode: StatusCodes.OK,
        type: 'application/vnd.microsoft.card.adaptive',
        value: card
    };
    const res = {
        status: StatusCodes.OK,
        body: cardRes
    };
    return res;
};

class Bot extends TeamsActivityHandler {
    constructor(adapter, conversationReferences) {
        super();
        this.conversationReferences = conversationReferences;
        this.adapter = adapter;
        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            membersAdded.map(async member => {
                if (member.id !== context.activity.recipient.id) {
                    await this.setConversationReference(context, member);
                }
            });
            await next();
        });
    }

    async handleTeamsCardActionInvoke(context) {
        // this is not implemented by the superclass
        // but shown here as an example (define this function in the integration)
        await super.handleTeamsCardActionInvoke(context);
    }

    async getUserConversationReference(context) {
        const TeamMembers = await TeamsInfo.getPagedMembers(context);
        TeamMembers.members.map(async member => {
            await this.setConversationReference(context, member);
        });
    }

    async setConversationReference(context, member){
        const ref = TurnContext.getConversationReference(context.activity);
        ref.user = member;
        delete ref.conversation.id;
        delete ref.activityId;
        await context.adapter.createConversation(ref, async (context) => {
            const ref = TurnContext.getConversationReference(context.activity);
            this.conversationReferences[member.email] = ref;
        });
    }
}

module.exports = { botApi };
