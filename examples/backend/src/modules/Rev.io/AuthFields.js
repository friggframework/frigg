const AuthFields = {
    // Old model
    revioAuthorizationFields: [
        {
            label: 'API User Name',
            identifier: 'username',
            type: 'STRING',
            description: 'Create a dedicated API user for your Rev.io account',
            required: true,
        },
        {
            label: "API User's Password",
            identifier: 'password',
            type: 'PASSWORD',
            description: 'The password for the (newly) created API user',
            required: true,
        },
        {
            label: 'Client Code',
            identifier: 'client_code',
            type: 'STRING',
            description:
                'Find your Client Code inside your Rev.io account [here](https://rev.io/link)',
            required: true,
        },
    ],

    // Using JSON Schema and react-jsonschema-form that includes uiSchema
    jsonSchema: {
        // "title": "Authorization Credentials",
        // "description": "A simple form example.",
        type: 'object',
        required: ['username', 'password', 'client_code'],
        properties: {
            username: {
                type: 'string',
                title: 'Username',
            },
            password: {
                type: 'string',
                title: 'Password',
            },
            client_code: {
                type: 'string',
                title: 'Client Code',
            },
        },
    },
    uiSchema: {
        username: {
            'ui:help':
                'The Username you use to log in to Rev.io, or ideally that of an API-specific User',
            'ui:placeholder': 'API.User@rev.io',
        },
        password: {
            'ui:widget': 'password',
            'ui:help': 'Password used for login',
            'ui:placeholder': 'API User Password',
        },
        client_code: {
            'ui:help': 'The Client Code you use to log in to Rev.io',
            'ui:placeholder': 'Client Code Example',
        },
    },
};

module.exports = AuthFields;
