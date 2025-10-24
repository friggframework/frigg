# Frigg Integration Framework
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-27-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

<img src="docs/FriggLogo.svg" style="width:250px">

**Frigg** is a **Framework** that powers **direct/native integrations** between your product and external software partners. It's full of opinionated structured code that gets you to integration development faster. Yup, another "don't rebuild the wheel. Build the car." thing. Better yet, build the rocket ship.

Build enterprise-grade integrations as simply as _`create-frigg-app`_.

## The Vision for the Framework and the Community
Imagine a world where you can spin up an integration requested by your customers, product team, or partnership folk within a matter of minutes, and push to production within a day.
Imagine that you get a notification whenever one of APIs you rely on has been updated, and less than a day later you get a 
second notification telling you your integration service is ready for a version bump with the new updates incorporated and tested.

And now imagine all of this is running on your own accounts.

That's our vision for Frigg. Learn more at <a href="https://friggramework.org/">FriggFramework.org</a>


## Background
Software integrations have been a problem developers have been asked to solve since the very first "hello world." It's not new.
However, in almost all cases, the most we could do was build our own homespun solution, read the API docs of our desired
integration target, and then forever maintain and hope we built a repeatable process. This cost time and labor, and a headache.
Developers spent time learning an API to only ever use it once. Maintaining the integrations over time becomes a headache.
Each one has a risk of becoming its own special time suck in the organization.

Yet every integration has the potential to deliver tremendous value to your end users and therefore to you as the software
provider.

At <a href="https://lefthook.com/">Left Hook</a> we found that not only were we recreating the wheel for every project,
we were also highly incentivized to learn an API and double down on that knowledge for any and all comers. We looked across
the market, and providers who were trying to solve this problem either created vendor lock-in with an integrations-as-subscription
model, or the open source options required spinning up expensive servers and immediately became deeply technical.

At the same time, over the past decade plus, major cloud providers started creating serverless options that unlock the perfect
use case for integrations.

- Low to no cost to have "at ready"
- Low to no server management
- Highly Scalable to tackle large request volumes with the same logic/code that handles single requests
- Infrastructure-as-code solutions like the serverless.com framework that allow for cloud agnostic architecture with the promise of fully managed infra

So, enter Frigg. We built what you would build, if you had the time to review hundreds or thousands of APIs and build a framework
flexible enough to handle any workflow or use case thrown at it, able to scale from two to two million records passing through the pipes.

## Getting Started

Best place to get started is to <a href="https://docs.friggframework.org">checkout our Docs</a>

Feel free to reach out and <a href="https://friggframework.org/#contact">contact us, and/or join our Frigg community shared Slack channel.</a>

## Command System

Frigg provides a clean **Application Service Layer** for all database operations through the command system. This isolates your integration code from the underlying ORM and ensures future compatibility.

### Why Use Commands?

- **ORM Independence**: Commands abstract away Mongoose, allowing framework upgrades without breaking your code
- **Hexagonal Architecture**: Commands act as the application service layer between your domain logic and infrastructure
- **Future-Proof**: Maintains backward compatibility during framework updates
- **Single Source of Truth**: Centralized database access with consistent error handling

### Quick Example

```javascript
const { createFriggCommands } = require('@friggframework/core');

// Initialize commands
const commands = createFriggCommands({
    integrationClass: MyIntegration
});

// Use commands for database operations
const user = await commands.findUserByAppUserId('external-user-123');
const credential = await commands.createCredential({
    userId: user.id,
    access_token: 'token',
    moduleName: 'asana'
});
```

### Available Command Categories

- **User Commands**: Create, find, and update Frigg users
- **Credential Commands**: Manage OAuth tokens and API credentials
- **Entity Commands**: Handle module entities (connections to external services)
- **Integration Commands**: Load full integration contexts with hydrated modules

For complete documentation, see the [Commands README](packages/core/application/commands/README.md).

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/seanspeaks"><img src="https://avatars.githubusercontent.com/u/7811325?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Sean Matthews</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=seanspeaks" title="Code">💻</a> <a href="#infra-seanspeaks" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#business-seanspeaks" title="Business development">💼</a> <a href="#ideas-seanspeaks" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/friggframework/frigg/commits?author=seanspeaks" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=seanspeaks" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://www.lefthook.com/"><img src="https://avatars.githubusercontent.com/u/22207033?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Tom Elliott</b></sub></a><br /><a href="#blog-tomlefthook" title="Blogposts">📝</a> <a href="#business-tomlefthook" title="Business development">💼</a> <a href="#content-tomlefthook" title="Content">🖋</a> <a href="https://github.com/friggframework/frigg/commits?author=tomlefthook" title="Documentation">📖</a> <a href="#ideas-tomlefthook" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/sheehantoufiq"><img src="https://avatars.githubusercontent.com/u/931781?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Sheehan Toufiq Khan</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=sheehantoufiq" title="Code">💻</a> <a href="#design-sheehantoufiq" title="Design">🎨</a> <a href="#ideas-sheehantoufiq" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-sheehantoufiq" title="Maintenance">🚧</a> <a href="https://github.com/friggframework/frigg/pulls?q=is%3Apr+reviewed-by%3Asheehantoufiq" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/friggframework/frigg/commits?author=sheehantoufiq" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=sheehantoufiq" title="Tests">⚠️</a> <a href="#infra-sheehantoufiq" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    <td align="center"><a href="https://github.com/wprl"><img src="https://avatars.githubusercontent.com/u/692511?v=4?s=100" width="100px;" alt=""/><br /><sub><b>William P. Riley-Land</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=wprl" title="Code">💻</a> <a href="#ideas-wprl" title="Ideas, Planning, & Feedback">🤔</a> <a href="#research-wprl" title="Research">🔬</a> <a href="https://github.com/friggframework/frigg/commits?author=wprl" title="Tests">⚠️</a> <a href="#tool-wprl" title="Tools">🔧</a></td>
    <td align="center"><a href="https://github.com/kad1001"><img src="https://avatars.githubusercontent.com/u/44247515?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Kelly Davis</b></sub></a><br /><a href="https://github.com/friggframework/frigg/issues?q=author%3Akad1001" title="Bug reports">🐛</a> <a href="https://github.com/friggframework/frigg/commits?author=kad1001" title="Code">💻</a> <a href="#plugin-kad1001" title="Plugin/utility libraries">🔌</a></td>
    <td align="center"><a href="https://github.com/JonathanEdMoore"><img src="https://avatars.githubusercontent.com/u/48260787?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jonathan Moore</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=JonathanEdMoore" title="Code">💻</a> <a href="#maintenance-JonathanEdMoore" title="Maintenance">🚧</a> <a href="#plugin-JonathanEdMoore" title="Plugin/utility libraries">🔌</a> <a href="https://github.com/friggframework/frigg/pulls?q=is%3Apr+reviewed-by%3AJonathanEdMoore" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/friggframework/frigg/commits?author=JonathanEdMoore" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=JonathanEdMoore" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/gregoriomartin"><img src="https://avatars.githubusercontent.com/u/26978598?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Gregorio Martin</b></sub></a><br /><a href="https://github.com/friggframework/frigg/issues?q=author%3Agregoriomartin" title="Bug reports">🐛</a> <a href="https://github.com/friggframework/frigg/commits?author=gregoriomartin" title="Code">💻</a> <a href="https://github.com/friggframework/frigg/commits?author=gregoriomartin" title="Tests">⚠️</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/cgenesoniSouthWorks"><img src="https://avatars.githubusercontent.com/u/108014154?v=4?s=100" width="100px;" alt=""/><br /><sub><b>cgenesoniSouthWorks</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=cgenesoniSouthWorks" title="Code">💻</a> <a href="#research-cgenesoniSouthWorks" title="Research">🔬</a> <a href="https://github.com/friggframework/frigg/commits?author=cgenesoniSouthWorks" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://github.com/TrevorKiefaber"><img src="https://avatars.githubusercontent.com/u/25160918?v=4?s=100" width="100px;" alt=""/><br /><sub><b>TrevorKiefaber</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=TrevorKiefaber" title="Code">💻</a> <a href="#ideas-TrevorKiefaber" title="Ideas, Planning, & Feedback">🤔</a> <a href="#plugin-TrevorKiefaber" title="Plugin/utility libraries">🔌</a> <a href="#research-TrevorKiefaber" title="Research">🔬</a> <a href="https://github.com/friggframework/frigg/commits?author=TrevorKiefaber" title="Tests">⚠️</a></td>
    <td align="center"><a href="http://www.coderden.com/"><img src="https://avatars.githubusercontent.com/u/1163670?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Caleb</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=cbanister" title="Code">💻</a> <a href="#ideas-cbanister" title="Ideas, Planning, & Feedback">🤔</a> <a href="#platform-cbanister" title="Packaging/porting to new platform">📦</a> <a href="#research-cbanister" title="Research">🔬</a></td>
    <td align="center"><a href="https://github.com/ryanzarick"><img src="https://avatars.githubusercontent.com/u/37348875?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ryan Zarick</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=ryanzarick" title="Code">💻</a> <a href="#ideas-ryanzarick" title="Ideas, Planning, & Feedback">🤔</a> <a href="#platform-ryanzarick" title="Packaging/porting to new platform">📦</a> <a href="#research-ryanzarick" title="Research">🔬</a> <a href="https://github.com/friggframework/frigg/pulls?q=is%3Apr+reviewed-by%3Aryanzarick" title="Reviewed Pull Requests">👀</a></td>
    <td align="center"><a href="https://queuetue.com/"><img src="https://avatars.githubusercontent.com/u/4491?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Scott Russell</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=queuetue" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=queuetue" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=queuetue" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/joncodo"><img src="https://avatars.githubusercontent.com/u/3011407?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jonathan O'Donnell</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=joncodo" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=joncodo" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/li-sherry"><img src="https://avatars.githubusercontent.com/u/117298948?v=4?s=100" width="100px;" alt=""/><br /><sub><b>li-sherry</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=li-sherry" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=li-sherry" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=li-sherry" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/vedantagrawall"><img src="https://avatars.githubusercontent.com/u/52647115?v=4?s=100" width="100px;" alt=""/><br /><sub><b>vedantagrawall</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=vedantagrawall" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=vedantagrawall" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=vedantagrawall" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/apps/codesee-maps"><img src="https://avatars.githubusercontent.com/in/122769?v=4?s=100" width="100px;" alt=""/><br /><sub><b>codesee-maps[bot]</b></sub></a><br /><a href="#infra-codesee-maps[bot]" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    <td align="center"><a href="https://github.com/MichaelRyanWebber"><img src="https://avatars.githubusercontent.com/u/7769437?v=4?s=100" width="100px;" alt=""/><br /><sub><b>MichaelRyanWebber</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=MichaelRyanWebber" title="Documentation">📖</a> <a href="#infra-MichaelRyanWebber" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/friggframework/frigg/commits?author=MichaelRyanWebber" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=MichaelRyanWebber" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/debbie-yu"><img src="https://avatars.githubusercontent.com/u/89419828?v=4?s=100" width="100px;" alt=""/><br /><sub><b>debbie-yu</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=debbie-yu" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=debbie-yu" title="Code">💻</a> <a href="https://github.com/friggframework/frigg/commits?author=debbie-yu" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://www.linkedin.com/in/roboli"><img src="https://avatars.githubusercontent.com/u/6392110?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Roberto Oliveros</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=roboli" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=roboli" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=roboli" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/leofmds"><img src="https://avatars.githubusercontent.com/u/7059835?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Leonardo Ferreira</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=leofmds" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=leofmds" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=leofmds" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/Fibii"><img src="https://avatars.githubusercontent.com/u/38106876?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Charaf</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=Fibii" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=Fibii" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=Fibii" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/msalvatti"><img src="https://avatars.githubusercontent.com/u/40447063?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Maximiliano Salvatti</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=msalvatti" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=msalvatti" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=msalvatti" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/msalvatti-ecotrak"><img src="https://avatars.githubusercontent.com/u/132104869?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Maximiliano Salvatti</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=msalvatti-ecotrak" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=msalvatti-ecotrak" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=msalvatti-ecotrak" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/Jo-lefthook"><img src="https://avatars.githubusercontent.com/u/139414886?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jo-lefthook</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=Jo-lefthook" title="Code">💻</a></td>
    <td align="center"><a href="http://nmilcoff.com/"><img src="https://avatars.githubusercontent.com/u/12127846?v=4?s=100" width="100px;" alt=""/><br /><sub><b>nmilcoff</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=nmilcoff" title="Documentation">📖</a> <a href="https://github.com/friggframework/frigg/commits?author=nmilcoff" title="Tests">⚠️</a> <a href="https://github.com/friggframework/frigg/commits?author=nmilcoff" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/igorschechtel"><img src="https://avatars.githubusercontent.com/u/21978920?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Igor Schechtel</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=igorschechtel" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://github.com/FerRiffel-LeftHook"><img src="https://avatars.githubusercontent.com/u/146733776?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Fer Riffel</b></sub></a><br /><a href="https://github.com/friggframework/frigg/commits?author=FerRiffel-LeftHook" title="Documentation">📖</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
