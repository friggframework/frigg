# GitLab

An API Module that allows you to connect to the [GitLab platform](https://docs.gitlab.com/).

### Supported Functionality

##### Me

- `getUserDetails()`: [Returns the data of the authenticated user.](https://docs.gitlab.com/ee/api/users.html#list-current-user)

##### Repositories

- `getProjects()`: [Returns a list of the projects of the authenticated user.](https://docs.gitlab.com/ee/api/projects.html#list-user-projects)

##### Issues

- `getProjectIssues(projectId)`: [Get's the issues for a project.](https://docs.gitlab.com/ee/api/issues.html#list-project-issues)
- `createProjectIssue(projectId, issue)`: [Create a single issue for a project.](https://docs.gitlab.com/ee/api/issues.html#new-issue)
- `deleteProjectIssue(projectId, issueIid)`: [Deletes an issue for a project.](https://docs.gitlab.com/ee/api/issues.html#delete-an-issue)
