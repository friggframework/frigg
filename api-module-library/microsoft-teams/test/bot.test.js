const Api = require('../api/bot');
const config = require('../defaultConfig.json');
const chai = require('chai');
const should = chai.should();


describe(`${config.label} API Tests`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
    };

    const api = new Api.botApi(apiParams);

    describe.skip('Proactive message', () => {
        it('Send proactive message', async () => {
            const ref = {
                "user": {
                    "id": "29:1WtqNeqNQjfMvq4CiFyCaOTq7--xugVGH7lijkI-RB8IHZUjYUZfFAFvNRAooBxIhew2J3IlqLokPlN0jRNkJbA",
                    "name": "Michael Webber",
                    "aadObjectId": "c1cb384d-8a26-464e-8fe3-7117e5fd7918",
                    "givenName": "Michael",
                    "surname": "Webber",
                    "email": "michael.webber@sklzt.onmicrosoft.com",
                    "userPrincipalName": "michael.webber@sklzt.onmicrosoft.com",
                    "tenantId": "7f4664c5-385a-49f2-b44b-c68cc6fb13ea",
                    'userRole': "user"
            },
                "bot": {
                "id": "28:67c1a5ff-0ed6-4cb8-872d-f5188ad14711",
                    "name": "lefthook-card-test-bot"
            },
                "conversation": {
                    "id": "a:1yMbBb0tL6nyJX0Ys3EiakGZjo8LcADnVPwdVHP-lDNra9PbVA4YV9wmRYrT7734J_xnD6cbnVjUTB3FYTQM9UR6a_F1LgBlcSWS8tPpyUHz74fip5DqeCNrzzvsZ9nuj",
                    "isGroup": false,
                    "conversationType": null,
                    "tenantId": "7f4664c5-385a-49f2-b44b-c68cc6fb13ea",
                    "name": null
            },
                "channelId": "msteams",
                "locale": "en-US",
                "serviceUrl": "https://smba.trafficmanager.net/amer/"
            };
            api.conversationReferences[ref.user.email] = ref;
            const resp = await api.sendProactive(ref.user.email, 'proactive message');
            // resp is undefined for now, even when message is sent
        });
    });
});
