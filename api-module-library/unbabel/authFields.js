const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['username', 'password', 'customer_id'],
        properties: {
            username: {
                type: 'string',
                title: 'username',
            },
            password: {
                type: 'string',
                title: 'password',
            },
            customer_id: {
                type:'string',
                title: 'customer_id',
            }
        },
    },
    uiSchema: {
        username: {
            'ui:help':
                'Your username will be provided by Unbabel Support',
            'ui:placeholder': 'example.user',
        },
        password: {
            'ui:help':
                'Your password will be provided by Unbabel Support. Please reach out if you have any questions.',
            'ui:placeholder': 'Your Passwords',
            'ui:widget': 'password',
        },
        brand: {
            'ui:help': 'Your customer_id will be provided by Unbabel Support',
            'ui:placeholder': 'Default',
        }
    },
};

module.exports = AuthFields;
