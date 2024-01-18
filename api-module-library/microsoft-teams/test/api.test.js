const {Api} = require('../api/api');

describe('Test of cross API functionality', () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        team_id: process.env.TEAMS_TEAM_ID,
        tenant_id: process.env.TEAMS_TENANT_ID,
        scope: process.env.TEAMS_CRED_SCOPE,
    };
    const api = new Api(apiParams);

    beforeAll(async () => {
        await api.graphApi.getTokenFromClientCredentials();
        await api.botFrameworkApi.getTokenFromClientCredentials();
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an access_token', async () => {
            expect(api.graphApi.access_token).toBeDefined();
            expect(api.botFrameworkApi.access_token).toBeDefined();
        });
    });

    describe('Conversation reference generation tests', () => {
        let convRef;
        const testEmail = 'michael.webber2@sklzt.onmicrosoft.com'
        it('Should create the conversation references', async () => {
            convRef = await api.createConversationReferences();
            expect(convRef).toBeDefined();
            expect(convRef[testEmail]).toBeDefined();
        });

        it('Should not create the conversation references again', async () => {
            api.botApi.createConversationReference = jest.fn().mockResolvedValueOnce({});
           convRef = await api.createConversationReferences();
            expect(convRef).toBeDefined();
            expect(convRef[testEmail]).toBeDefined();
            expect(api.botApi.createConversationReference).toHaveBeenCalledTimes(0);
        })

        it('Should only create the conversation references new members', async () => {
            const ref = api.botApi.conversationReferences[testEmail];
            delete api.botApi.conversationReferences[testEmail]
            api.botApi.createConversationReference = jest.fn().mockResolvedValueOnce(ref);
            await api.createConversationReferences();
            expect(api.botApi.createConversationReference).toHaveBeenCalledTimes(1);
            convRef[testEmail] = ref;
        });

        it('Should send a proactive message from the bot', async () => {
            await api.botApi.sendProactive(testEmail, "hello from api.test.js!");
        });

        it('Should send a proactive message from the user', async () => {
            const membersAddedActivity = {
                "membersAdded": [
                    {
                        "id": "29:1ZyIbnG-qqkNNFYz-rZTV1ssjJy4Nrm1tOafLaCX6hO_bRZITWGLivobS2Hoa-Db97SD0zI_L6Ka4mUNJBp0amg",
                        "aadObjectId": "7dd3eefa-789f-4fb1-9f12-04faf311eee6"
                    },
                    {
                        "id": "29:1pVbNsHSsEv2BOwzyGKovmlUQzUxcXzrZW5KOPd8W4rsDOsOkqwYvCKLQ5fUZ8D_vDnUuUHvGQcbYAgvdYuL68A",
                        "aadObjectId": "ebf2b9a3-aad2-44ad-903e-86b69cecfbf1"
                    }
                ],
                "type": "conversationUpdate",
                "timestamp": "2024-01-09T18:31:15.1980079Z",
                "id": "f:f530b91d-bfe6-e577-bbea-bfc159506254",
                "channelId": "msteams",
                "serviceUrl": "https://smba.trafficmanager.net/amer/",
                "from": {
                    "id": "29:1WtqNeqNQjfMvq4CiFyCaOTq7--xugVGH7lijkI-RB8IHZUjYUZfFAFvNRAooBxIhew2J3IlqLokPlN0jRNkJbA",
                    "aadObjectId": "c1cb384d-8a26-464e-8fe3-7117e5fd7918"
                },
                "conversation": {
                    "isGroup": true,
                    "conversationType": "channel",
                    "tenantId": "7f4664c5-385a-49f2-b44b-c68cc6fb13ea",
                    "id": "19:FYCHqM6U1I8a321DaF6cXDR6RRMXKuRblMFBIVwnSr01@thread.tacv2"
                },
                "recipient": {
                    "id": "28:67c1a5ff-0ed6-4cb8-872d-f5188ad14711",
                    "name": "lefthook-card-test-bot"
                },
                "channelData": {
                    "team": {
                        "aadGroupId": "5baff79c-bc70-4f07-ba2b-617961ca6c09",
                        "name": "test app install",
                        "id": "19:FYCHqM6U1I8a321DaF6cXDR6RRMXKuRblMFBIVwnSr01@thread.tacv2"
                    },
                    "eventType": "teamMemberAdded",
                    "tenant": {
                        "id": "7f4664c5-385a-49f2-b44b-c68cc6fb13ea"
                    }
                }
            }
            delete api.botApi.conversationReferences[testEmail];

            await api.botApi.run({activity: membersAddedActivity});
            expect(api.botApi.conversationReferences[testEmail]).toBeDefined();
            await api.botApi.sendProactive(testEmail, "hello from api.test.js again! woo!!");

        })


    });
});
