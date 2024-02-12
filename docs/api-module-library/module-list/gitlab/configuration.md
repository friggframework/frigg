# Configuration

# Configuration

The Frigg integration helps you to work with the GitLab API.

### Getting started

This guide assumes you already have a Frigg App working.

1. [Sign up](https://gitlab.com/users/sign_up) or [Sign in](https://gitlab.com/users/sign_in) to your GitLab account for free.
2. Follow the [official instructions](https://docs.gitlab.com/ee/api/oauth2.html) for creating an App and obtaining a Client ID and a Client Secret.
3. Specify a Redirection URL like on the example: `http://localhost:3000/redirect`.
4. In your Frigg App .json file, add the following:

```json
{
  "GITLAB_CLIENT_ID": "YOUR_CLIENT_ID",
  "GITLAB_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
  "GITLAB_SCOPE": "api read_api read_repository read_user write_repository",
  "GITLAB_BASE_URL": "https://gitlab.com"
}
```

**IMPORTANT**: GITLAB_BASE_URL is required since users can self-host GitLab instances.

5. Add a GitLab integration file to your Frigg app.
6. Implement methods as needed or necessary for your integration.
7. Add the integration in your appDefinition in `backend.js`:

```js
const gitlabIntegration = require("./integrations/GitlabIntegration.js");

const appDefinition = {
  integrations: [gitlabIntegration],
  user: {
    password: true,
  },
};
```

8. Done! You are now ready to run the integration.
