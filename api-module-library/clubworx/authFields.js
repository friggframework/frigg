const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['accountKey'],
        properties: {
            accountKey: {
                type: 'string',
                title: 'Account Key',
            },
        },
    },
    uiSchema: {
        apiKey: {
            'ui:help': 'Your Clubworx Account Key.',
            'ui:placeholder': 'Your Clubworx Access Token...',
        },
    },
};

module.exports = AuthFields;
