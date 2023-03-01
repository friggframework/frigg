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
        this.bot = new Bot(this.adapter, this.conversationReferences);
    }
    async receiveActivity(req, res){
        await this.adapter.process(req, res, (context) => this.bot.run(context));
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

        this.onMessage(async (context, next) => {
            // if (context.activity.type === 'message' && context.activity.text === 'grab refs') {
            //     await this.getUserConversationReference(context);
            // }
            await next();
        });
    }

    async onInvokeActivity(context) {
        const refreshCard = CardFactory.adaptiveCard(respcard);
        if (context.activity.value.action.title === 'Create Channel Execute') {
            const message = MessageFactory.attachment(refreshCard);
            message.id = context.activity.replyToId;
            await context.updateActivity(message);
        }
        return invokeResponse(refreshCard);
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

    async sendProactive(userEmail, activity) {
        const conversationReference = this.conversationReferences[userEmail];
        if (conversationReference !== undefined) {
            await this.adapter.continueConversation(conversationReference, async (context) => {
                await context.sendActivity(activity);
            });
        }
    }
}

module.exports = { botApi };
