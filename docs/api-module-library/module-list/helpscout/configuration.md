# Configuration

Help Scout has different kinds of apps. The Frigg integration works with the Mailbox API, which allows __your app__ to interact with Help Scout in the most flexible way.

### Getting started

This guide assumes you already have a Frigg App working.

1. Sign up/in to your Help Scout account, for free ([site link](https://www.helpscout.com/)).
2. Follow the [official instructions](https://developer.helpscout.com/mailbox-api/overview/authentication/#oauth2-application) for creating an App under your profile (not in the _App Directory_).
3. Specify a Redirection URL that follows this pattern: `https://{your domain}/redirect`. This is an example for localhost: `http://localhost:3000/redirect`.
4. In your Frigg App env file, add the following entries:

```js
"HELPSCOUT_CLIENT_ID": "{{ your app client id }}",
"HELPSCOUT_CLIENT_SECRET": "{{ your app secret }}"
```

5. Add a Help Scout integration file to your Frigg app (you can find an example at the end of this document).
6. Implement any calls you need (use the `getSampleData` method as an example).
7. Add the integration in your appDefinition in `backend.js`:

```js
const appDefinition = {
    integrations: [
        helpscoutIntegration
    ],
    user: {
        password: true,
    }
}
```

8. Done! You are ready to run the app and test the integration live.

### Example integration file

```js
class HelpscoutIntegration extends IntegrationBase {
    static Config = {
        name: 'helpscout',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        events: ['EXAMPLE_EVENT'],
    };

    static Options =
        new Options({
            module: HelpscoutModule,
            integrations: [HelpscoutModule],
            display: {
                name: 'Help Scout',
                description: 'Mailbox integration',
                category: 'CRM',
                detailsUrl: 'https://helpscout.com',
                icon: '',
            }
        });

    static display =  {
        name: 'Help Scout',
        description: 'Help Scout Mailbox integration',
        category: 'CRM',
        detailsUrl: 'https://helpscout.com',
        icon: '',
    }

    static modules = {
        helpscout: HelpscoutModule
    }

    /**
     * HANDLE EVENTS
     */
    async receiveNotification(notifier, event, object = null) {

    }

    /**
     * ALL CUSTOM/OPTIONAL METHODS FOR AN INTEGRATION
     */
    async getSampleData() {
        const list = await this.target.api.listConversations()
        
        const formatted = list._embedded.conversations.map(conversation => {
            return {
                id: conversation.id,
                type: conversation.type,
                subject: conversation.subject,
                preview: conversation.preview,
            }
        });
        return { data: formatted }
    }
}
```