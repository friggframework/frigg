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

const ConfigFields = {
    jsonSchema: {
        type: 'object',
        required: ['channel'],
        properties: {
            channel: {
                type: 'string',
                title: 'Post to Channel:',
                enum: [
                    '#legal', // Call slack api for channels and add here
                    '#random',
                ],
            },
        },
    },
    uiSchema: {
        channel: {
            'ui:widget': 'select',
            'ui:placeholder': 'Choose a #channel',
        },
    },
};

module.exports = { AuthFields, ConfigFields };
