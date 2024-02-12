# GitLab

This is the API Module for GitLab that allows the [Frigg](https://friggframework.org) code to talk to the GitLab API.

Read more on the [Frigg documentation site](https://docs.friggframework.org/api-modules/list/gitlab)

### How to create a new App

1 - Go to [this url](https://gitlab.com/-/user_settings/applications).
2 - Click on "Add new application" under `Your Applications`.
3 - Fill in the form with the following information:

-   **GitHub App name**: The name of your app
-   **Homepage URL**: [The URL of your app](https://lefthook.com/)
-   **Redirect URL**: http://localhost:3000/redirect/gitlab
-   **Scopes**: api read_api read_repository read_user write_repository

3 - Click on the "Save application" button.
4 - You will be redirected to the app settings page. Copy the **Client ID** and **Client Secret** and paste them in your `.env` file.
