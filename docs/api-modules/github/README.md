# GitHub

An API Module that allows you to connect to the [GitHub platform](https://docs.github.com/en).

### Supported Functionality

##### Me

- `getUserDetails()`: [Returns the data of the authenticated user as well as the URLs for the user's resources. We prefer to use those provided URLs instead of defining the paths ourselves.](https://docs.github.com/en/rest/users/users?apiVersion=2022-11-28#get-the-authenticated-user)

##### Repositories

- `getRepos()`: [Returns a list of repositories for the authenticated user.](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-repositories-for-the-authenticated-user)

##### Issues

- `getIssues(owner, name)`: [Get's the issues for a repository.](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#list-repository-issues)
- `getIssue(owner, name, issueNumber)`: [Get's a single issue for a repository.](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#get-an-issue)
- `updateIssue(owner, name, issueNumber, issueData)`: [Updates an issue for a repository.](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#update-an-issue)
