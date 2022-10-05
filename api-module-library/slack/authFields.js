const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['clientId', 'clientSecret'],
        properties: {
            clientId: {
                type: 'string',
                title: 'Client ID',
            },
            clientSecret: {
                type: 'string',
                title: 'Client Secret',
            },
        },
    },
    uiSchema: {
        clientId: {
            'ui:help':
                'Your Client ID can be found under App Credentials on the Basic Information page for your App.',
            'ui:placeholder': 'Client ID...',
        },
        clientSecret: {
            'ui:widget': 'password',
            'ui:help':
                'Your Client Secret can be found in under App Credentials on the Basic Information page for your App.',
            'ui:placeholder': 'Client Secret...',
        },
    },
};

module.exports = AuthFields;
