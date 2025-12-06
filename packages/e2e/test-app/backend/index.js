const { OAuthIntegration } = require('./integrations/oauthIntegration');
const { FormBasedIntegration } = require('./integrations/formBasedIntegration');
const { WebhookIntegration } = require('./integrations/webhookIntegration');

const Definition = {
    integrations: [
        OAuthIntegration,
        FormBasedIntegration,
        WebhookIntegration,
    ],
    database: {
        mongoDB: {
            enable: true,
        },
    },
    user: {
        model: 'mongoose',
    },
};

module.exports = { Definition };
