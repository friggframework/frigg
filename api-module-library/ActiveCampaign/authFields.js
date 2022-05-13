const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['apiUrl', 'apiKey'],
        properties: {
            apiUrl: {
                type: 'string',
                title: 'API Access URL',
            },
            apiKey: {
                type: 'string',
                title: 'API Access Key',
            },
        },
    },
    uiSchema: {
        apiUrl: {
            'ui:help':
                'Your API URL can be found in your account on the My Settings page under the "Developer" tab.',
            'ui:placeholder': 'https://youraccountname.api-us1.com',
        },
        apiKey: {
            'ui:help':
                'Your API key can be found in your account on the Settings page under the "Developer" tab. Each user in your ActiveCampaign account has their own unique API key.',
            'ui:placeholder': 'Your API Access Key',
        },
    },
};

module.exports = AuthFields;
