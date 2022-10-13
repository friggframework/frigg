const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['apiKey'],
        properties: {
            apiKey: {
                type: 'string',
                title: 'Access Token',
            },
        },
    },
    uiSchema: {
        apiKey: {
            'ui:help':
                'Generate access tokens in Ironclad by clicking [YOUR_NAME] > Company Settings > API > Access Tokens. Must have admin privalages.',
            'ui:placeholder': 'Your Ironclad Access Token...',
        },
    },
};

module.exports = AuthFields;
