# BitBucket

This is the API Module for BitBucket that allows the [Frigg](https://friggframework.org) code to talk to the BitBucket API.

Read more on the [Frigg documentation site](https://docs.friggframework.org/api-modules/list/bitbucket)

### How to create a new App

1- Go to this url: https://bitbucket.org/{YOUR_WORKSPACE_SLUG}/workspace/settings/oauth-consumers/new (replace `{YOUR_WORKSPACE_SLUG}` with your workspace slug url)
2- Fill in the form with the following information:

-   **App name**: The name of your app
-   **Homepage URL**: [The URL of your app](https://lefthook.com/)
-   **Callback URL**: http://localhost:3000/redirect/bitbucket
-   **Permissions**: Select
-   `Account`
-   Read
-   Write
-   `Repositories`
-   Read
-   Write
-   `Issues`
-   Read
-   Write

3 - Click on the "Save" button.
4 - You will be redirected to the app listing screen. **Key** is the _Client Id_ and **Secret** is the _Client Secret_. Copy and paste them on your `.env` file.
5 - You don't need to define scopes here since you defined them in your app settings.
