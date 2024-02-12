# Github

This is the API Module for Github that allows the [Frigg](https://friggframework.org) code to talk to the Github API.

Read more on the [Frigg documentation site](https://docs.friggframework.org/api-modules/list/github)

### How to create a new App

1- Go to [this url](https://github.com/settings/applications/new).
2- Fill in the form with the following information:

-   **GitHub App name**: The name of your app
-   **Homepage URL**: [The URL of your app](https://lefthook.com/)
-   **User authorization callback URL**: http://localhost:3000/redirect/github

3 - Click on the "Register application" button.
4 - You will be redirected to the app settings page. Copy the **Client ID** and **Client Secret** and paste them in your `.env` file.
5 - `GITHUB_SCOPE` can default to **repo** and **user** for now like this: `GITHUB_SCOPE=repo user`
