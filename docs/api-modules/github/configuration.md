# Configuration

The Frigg integration helps you to work with the GitHub API.

### Getting started

This guide assumes you already have a Frigg App working.

1. [Sign up](https://github.com/signup) or [Sign in](https://github.com/login) to your Github account for free.
2. Follow the [official instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) for creating an App and obtaining a Client ID and a Client Secret.
3. Specify a Redirection URL like on the example: `http://localhost:3000/redirect`.
4. In your Frigg App .json file, add the following:

```json
{
  "GITHUB_CLIENT_ID": "YOUR_CLIENT_ID",
  "GITHUB_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
  "GITHUB_SCOPE": "repo user"
}
```

5. Add a Github integration file to your Frigg app.
6. Implement methods as needed or necessary for your integration.
7. Add the integration in your appDefinition in `backend.js`:

```js
const githubIntegration = require("./integrations/GithubIntegration.js");

const appDefinition = {
  integrations: [githubIntegration],
  user: {
    password: true,
  },
};
```

8. Done! You are now ready to run the integration.
