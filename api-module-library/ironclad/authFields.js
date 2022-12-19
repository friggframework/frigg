const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['apiKey'],
        properties: {
            apiKey: {
                type: 'string',
                title: 'Access Token',
            },
            subdomain: {
                type: 'string',
                title: 'Subdomain',
            },
        },
    },
    uiSchema: {
        apiKey: {
            'ui:help':
                'Generate access tokens in Ironclad by clicking [YOUR_NAME] > Company Settings > API > Access Tokens. Must have admin privalages.',
            'ui:placeholder': 'Your Ironclad Access Token...',
        },
        subdomain: {
            'ui:help':
                'An Ironclad subdomain, https://<demo>.ironcladapp.com. Defaults to https://ironcladapp.com. Leave blank if you have none',
            'ui:placeholder': 'Your Ironclad Subdomain...',
        },
    },
};

module.exports = AuthFields;
