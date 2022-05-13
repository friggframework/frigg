const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: [
            'clientId',
            'clientSecret',
            'companyId',
            'accessToken',
            'subdomain',
        ],
        properties: {
            clientId: {
                type: 'string',
                title: 'Client ID',
            },
            clientSecret: {
                type: 'password',
                title: 'Client secret',
            },
            companyId: {
                type: 'number', // not sure if this is the correct type name?
                title: 'Company ID',
            },
            accessToken: {
                type: 'password',
                title: 'Access token',
            },
            subdomain: {
                type: 'string',
                title: 'Subdomain',
            },
        },
    },
    uiSchema: {
        clientId: {
            'ui:help':
                'Navigate to Settings -> API Credentials. Click on "Existing unnamed credential." Copy "Client ID."',
            'ui:placeholder': 'Your Client ID',
        },
        clientSecret: {
            'ui:help':
                'Navigate to Settings -> API Credentials. Click on "Existing unnamed credential." Copy "Client secret."',
            'ui:placeholder': 'Your Client Secret',
        },
        companyId: {
            'ui:help':
                'Navigate to Settings -> API Credentials. Click on the "Recruiting API key." Copy "Your company ID."',
            'ui:placeholder': 'Your Company ID',
        },
        accessToken: {
            'ui:help':
                'Navigate to Settings -> API Credentials. Click on the "Recruiting API key." Copy "Access token."',
            'ui:placeholder': 'Your Access Token',
        },
        subdomain: {
            'ui:help':
                'The first portion in the URL after logging in - can be located between "https://" and "personio.de."',
            'ui:placeholder': 'Your Subdomain',
        },
    },
};

module.exports = AuthFields;
