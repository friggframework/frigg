const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['store_id', 'secret'],
        properties: {
            store_id: {
                type: 'string',
                title: 'Store ID',
            },
            secret: {
                type: 'string',
                title: 'Secret',
            },
        },
    },
    uiSchema: {
        store_id: {
            'ui:help':
                'Log into your Yotpo admin. At the top right corner of the screen, click the Profile icon. Select Store Settings. You’ll find your app key at the bottom of the General Settings section.',
            'ui:placeholder': 'Your Yotpo App Key',
        },
        secret: {
            'ui:help':
                'Log into your Yotpo admin. At the top right corner of the screen, click the Profile icon. Select Store Settings. From your General Settings, click Get secret key. You’ll receive an email with a verification code to the email address associated with your account.',
            'ui:placeholder': 'Your Yotpo Secret Key',
        },
    },
};

module.exports = AuthFields;
