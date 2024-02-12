# Configuration

This Frigg module helps you to work with the Bitbucket API.

### Getting started

This guide assumes you already have a Frigg App working.

1. Sign up or Sign in to your Bitbucket account for free.
2. Get started with the [official instructions](https://developer.atlassian.com/cloud/bitbucket/rest/intro/#oauth-2-0) for creating an App and obtaining a Client ID and a Client Secret.
   2.1. Go to this url: https://bitbucket.org/{YOUR_WORKSPACE_SLUG}/workspace/settings/oauth-consumers/new (replace `{YOUR_WORKSPACE_SLUG}` with your workspace slug url)
   2.2. Fill in the form with the following information:

- **GitHub App name**: The name of your app
- **Callback URL**: http://localhost:3000/redirect/bitbucket
- **Permissions**: Select
- `Account`
- Read
- Write
- `Repositories`
- Read
- Write
- `Issues`
- Read
- Write

  2.3. Click on the "Save" button.
  2.4. You will be redirected to the app listing screen. **Key** is the _Client Id_ and **Secret** is the _Client Secret_. Copy and paste them on your `.env` file. 3. Specify a Redirection URL like on the example: `http://localhost:3000/redirect`. 4. In your Frigg App .json file, add the following:

```json
{
  "BITBUCKET_CLIENT_ID": "YOUR_CLIENT_ID/KEY",
  "BITBUCKET__CLIENT_SECRET": "YOUR_CLIENT_SECRET/SECRET"
}
```

5. Add a BitBucket integration file to your Frigg app.
6. Implement methods as needed or necessary for your integration.
7. Add the integration in your appDefinition in `backend.js`:

```js
const bitbucketIntegration = require("./integrations/BitbucketIntegration.js");

const appDefinition = {
  integrations: [bitbucketIntegration],
  user: {
    password: true,
  },
};
```

8. Done! You are now ready to run the integration.
