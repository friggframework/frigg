# Exploring the App

## **Frontend overview**

Running `npm start` at the root of your Frigg application repo will run `npm start` on both the `/backend` and `/frontend` directories. Let's unpack each.

The frontend is a cookie cutter React application built with Create React App and Tailwind CSS and Tailwind UI. It leverages the Frigg React component library for the Integration Management page. This is the core piece to pay attention to for your own application. You can read more about Frontend options and concepts with [Frigg here.](../../../reference/architecture.md)

We provide a very lightweight/basic user login flow and dashboard. Go ahead and try logging in or creating an account.

<mark style="color:red;background-color:red;">// Image of login screen</mark>

Note that when you attempt to log in, you will receive an error. We'll come back to this in a moment, but the TL;DR  is that we need to plug in a database for the backend to talk to.

## Backend overview

The backend is oriented around the serverless.com framework. When you run `npm start`, it runs the command to use the serverless-offline plugin. Critical to note is that this supports basic functionality (API => function invocation, or schedule => function invocation), it does not support all events that you may be relying on to power your integrations. In other words, you can run Authentication and Configuration, but the entirety of your Frigg applications' backend will not run using this command. For that, see "Running Frigg Locally."

The Backend is comprised of the following folder structure:

```
├── backend
│   ├── app.js
│   ├── jest.config.js
│   ├── package-lock.json
│   ├── package.json
│   ├── scripts
│   │   ├── set-up-tests.js
│   │   └── tear-down-tests.js
│   ├── serverless.yml
│   ├── setupEnv.js
│   ├── src
│   │   ├── configs
│   │   │   └── dev.json
│   │   ├── handlers
│   │   │   ├── createHandler.js
│   │   │   ├── examplePollWorker.js
│   │   │   ├── exampleQueuer.js
│   │   │   └── http
│   │   │       ├── auth.js
│   │   │       └── demo.js
│   │   ├── managers
│   │   │   ├── IntegrationConfigManager.js
│   │   │   ├── SyncManager.js
│   │   │   ├── UserManager.js
│   │   │   ├── entities
│   │   │   │   └── ExampleManager.js
│   │   │   ├── integrations
│   │   │   │   └── ExampleIntegrationManager.js
│   │   │   └── migrations
│   │   │       ├── MigrationManager.js
│   │   │       └── ExampleMigrator.js
│   │   ├── models
│   │   │   ├── IndividualUser.js
│   │   │   ├── OrganizationUser.js
│   │   │   ├── Token.js
│   │   │   └── User.js
│   │   ├── objects
│   │   │   └── sync
│   │   │       └── ExampleLeadSync.js
│   │   ├── routers
│   │   │   ├── auth.js
│   │   │   ├── demo.js
│   │   │   ├── middleware
│   │   │   │   ├── loadUserManager.js
│   │   │   │   └── requireLoggedInUser.js
│   │   │   └── user.js
│   │   ├── utils
│   │   │   ├── FormatPatchBody.js
│   │   │   ├── QueuerUtil.js
│   │   │   ├── RouterUtil.js
│   │   │   └── fakeWindow.js
│   │   └── workers
│   │       └── examples
│   │           ├── ExamplePollWorker.js
│   │           ├── ExampleQueuer.js
│   │           ├── InitialSync.js
│   │           ├── WebHookSync.js
│   │           └── WebhookWorker.js
│   ├── test
│   │   ├── api.integration.test.js
│   │   ├── managers
│   │   │   └── integrations
│   │   │       └── ExampleIntegration.test.js
│   │   ├── mocks
│   │   ├── routers
│   │   │   ├── auth.test.js
│   │   │   └── test-auth.test.js
│   │   └── utils
│   │       ├── Authenticator.js
│   │       ├── CreateIntegrationsTest.js
│   │       ├── ModelTestUtils.js
│   │       ├── TestUtils.js
│   │       ├── TextReportFile.js
│   │       └── reusableTestFunctions
│   │           └── integration.js
│   └── webpack.config.js
├── frontend
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.js
│   ├── public
│   │   ├── FriggLogo.svg
│   │   ├── LeftHooks-square.png
│   │   ├── _redirects
│   │   ├── assets
│   │   │   ├── media
│   │   │   │   └── Back_arrow.svg
│   │   │   └── type
│   │   │       └── FranklinGothicURW
│   │   │           ├── FranklinGothicURW-Boo.otf
│   │   │           ├── FranklinGothicURW-BooIta.otf
│   │   │           ├── FranklinGothicURW-Dem.otf
│   │   │           ├── FranklinGothicURW-DemIta.otf
│   │   │           ├── FranklinGothicURW-Lig.otf
│   │   │           ├── FranklinGothicURW-Med.otf
│   │   │           └── FranklinGothicURW-MedIta.otf
│   │   ├── favicon.ico
│   │   ├── hubspot_logo.svg
│   │   ├── index.html
│   │   ├── lh_logo.png
│   │   ├── manifest.json
│   │   └── salesforce_logo.svg
│   ├── src
│   │   ├── App.js
│   │   ├── AppRouter.js
│   │   ├── __tests__
│   │   │   ├── Integration.test.js
│   │   │   ├── Login.test.js
│   │   │   └── Logout.test.js
│   │   ├── actions
│   │   │   ├── auth.js
│   │   │   ├── integrations.js
│   │   │   ├── logout.js
│   │   │   ├── modal.js
│   │   │   └── modalForm.js
│   │   ├── api
│   │   │   └── api.js
│   │   ├── components
│   │   │   ├── Auth.js
│   │   │   ├── AuthRedirect.js
│   │   │   ├── CreateUser.js
│   │   │   ├── Data.js
│   │   │   ├── FormValidator.js
│   │   │   ├── Integration
│   │   │   │   ├── IntegrationDropdown.js
│   │   │   │   ├── IntegrationHorizontal.js
│   │   │   │   ├── IntegrationList.js
│   │   │   │   ├── IntegrationSkeleton.js
│   │   │   │   ├── IntegrationVertical.js
│   │   │   │   ├── ToggleSwitch.js
│   │   │   │   └── index.js
│   │   │   ├── Login.js
│   │   │   ├── Logout.js
│   │   │   ├── ModalForm.js
│   │   │   ├── Navbar.js
│   │   │   └── Sidebar.js
│   │   ├── frigg.config.js
│   │   ├── index.css
│   │   ├── index.js
│   │   ├── pages
│   │   │   ├── IntegrationsPage.js
│   │   │   └── SettingsPage.js
│   │   ├── reducers
│   │   │   ├── auth.js
│   │   │   ├── index.js
│   │   │   ├── integrations.js
│   │   │   ├── logout.js
│   │   │   ├── modal.js
│   │   │   └── modalForm.js
│   │   ├── store
│   │   │   └── index.js
│   │   └── utils
│   │       ├── IntegrationUtils.js
│   │       ├── history.js
│   │       ├── logger.js
│   │       └── withRouter.js
│   └── tailwind.config.js
├── package-lock.json
└── package.json
```

![](../../../.gitbook/assets/screencapture-demo-friggframework-org-integrations-2022.png)

### How it works

As you might have noticed, you use both a [serverless](https://aws.amazon.com/serverless/) instance and a client side react app to access the Frigg API modules. The flow looks like this:

![](<../../../.gitbook/assets/Screen Shot 2022-04-11 at 10.52.07 AM.png>)
