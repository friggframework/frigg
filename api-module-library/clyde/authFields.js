const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['clientKey', 'secret'],
        properties: {
            clientKey: {
                type: 'string',
                title: 'Client Key',
            },
            secret: {
                type: 'string',
                title: 'Secret',
            },
        },
    },
    uiSchema: {
        clientKey: {
            'ui:help':
                'To obtain your Client Key and Secret, log in and head to settings. You can find your Keys in the "Developers" section.',
            'ui:placeholder': 'Client Key',
        },
        secret: {
            'ui:widget': 'password',
            'ui:help': 'Your secret is obtained along with your Client Key',
            'ui:placeholder': 'secret',
        },
    },
};

module.exports = AuthFields;
