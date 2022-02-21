const AuthFields = {
    // Old model
    connectwiseAuthorizationFields: [
        {
            label: 'Company ID',
            identifier: 'company_id',
            type: 'STRING',
            description:
                'The Company ID you use to login to ConnectWise Manager.',
            required: true,
        },
        {
            label: 'Public Key',
            identifier: 'public_key',
            type: 'STRING',
            description:
                'To obtain your public and private key, log into ConnectWise and click on your user in the upper right hand corner, then go to My Account. Click on the API Key tab and generate a new API Key.',
            required: true,
        },
        {
            label: 'Private Key',
            identifier: 'private_key',
            type: 'PASSWORD',
            description: '',
            required: true,
        },
        {
            label: 'Site URL',
            identifier: 'site',
            type: 'STRING',
            description:
                'Example URLs: https://na.myconnectwise.net, https://eu.myconnectwise.net, or https://cw.mysite.com.',
            required: true,
        },
    ],

    // Using JSON Schema and react-jsonschema-form that includes uiSchema
    jsonSchema: {
        // "title": "Authorization Credentials",
        // "description": "A simple form example.",
        type: 'object',
        required: ['company_id', 'public_key', 'private_key', 'site'],
        properties: {
            company_id: {
                type: 'string',
                title: 'Company ID',
            },
            public_key: {
                type: 'string',
                title: 'Public Key',
            },
            private_key: {
                type: 'string',
                title: 'Private Key',
            },
            site: {
                type: 'string',
                format: 'uri',
                title: 'Site Url',
            },
        },
    },
    uiSchema: {
        company_id: {
            'ui:help': 'The Company ID you use to login to ConnectWise Manage.',
            'ui:placeholder': 'Company ID',
        },
        public_key: {
            'ui:help':
                'To obtain your public and private key, log into ConnectWise and click on your user in the upper right hand corner, then go to My Account. Click on the API Key tab and generate a new API Key.',
            'ui:placeholder': 'Public Key',
        },
        private_key: {
            'ui:widget': 'password',
            'ui:help':
                'Your private key is obtained along with your public key',
            'ui:placeholder': 'Private Key',
        },
        site: {
            'ui:placeholder': 'https://',
            'ui:help':
                'Example URLs: https://na.myconnectwise.net, https://eu.myconnectwise.net, or https://cw.mysite.com.',
        },
    },
};

module.exports = AuthFields;
