const AuthFields = {
    jsonSchema: {
        type: 'object',
        required: ['store_id', 'secret'],
        properties: {
            store_id: {
                type: 'string',
                title: 'App Key',
            },
            secret: {
                type: 'string',
                title: 'Secret',
            },
            loyalty_api_key: {
                type: 'string',
                title: 'Loyalty API Key',
            },
            loyalty_guid: {
                type: 'string',
                title: 'Loyalty GUID',
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
        loyalty_api_key: {
            'ui:help':
                'Log into your Yotpo Loyalty account. Navigate to the Loyalty Settings page. Copy the value of your Loyalty API Key and paste it here.',
            'ui:placeholder': 'Your Loyalty API Key',
        },
        loyalty_guid: {
            'ui:help':
                'Directly underneath your Loyalty API Key is the value of your Loyalty GUID. Copy and paste it here.',
            'ui:placeholder': 'Your Loyalty GUID',
        },
    },
};

module.exports = AuthFields;
