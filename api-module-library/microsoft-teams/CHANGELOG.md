# v0.1.1 (Mon Oct 30 2023)

#### 🐛 Bug Fix

- Vedantagrawal/ms teams fix [#228](https://github.com/friggframework/frigg/pull/228) ([@vedantagrawall](https://github.com/vedantagrawall))
- pr feedback ([@vedantagrawall](https://github.com/vedantagrawall))
- Merge branch 'main' of https://github.com/friggframework/frigg ([@vedantagrawall](https://github.com/vedantagrawall))
- fixing ms teams redirect and admin consent urls ([@vedantagrawall](https://github.com/vedantagrawall))
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@vedantagrawall](https://github.com/vedantagrawall)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.1.0 (Wed Sep 06 2023)

#### 🐛 Bug Fix

- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 1

- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.10 (Wed Jul 26 2023)

#### 🐛 Bug Fix

- fr/teams-getuserbyid [#205](https://github.com/friggframework/frigg/pull/205) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving user details ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))

#### Authors: 1

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)

---

# v0.0.9 (Wed Jun 21 2023)

#### 🐛 Bug Fix

- Fr/iro 51 [#185](https://github.com/friggframework/frigg/pull/185) ([@seanspeaks](https://github.com/seanspeaks) [@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- manager slight fix due to change in orgDetails return value ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- graph api tests for user and app are now passing and a bit cleaner ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Merge branch 'main' into fr/IRO-51 ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- all tests passing for app installation, detection and removal ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add tests for appCatalog requests, fixing same ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add requests for app info retrieval, installation and removal ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Merge remote-tracking branch 'origin/main' into api-module/wip-update-microsoft-teams ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))
- get tests working after change in .env format ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- WIP for storing and updating credentials based on `tenant_id` (and no user-related lookup) ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.8 (Tue Jun 20 2023)

:tada: This release contains work from a new contributor! :tada:

Thank you, null[@MichaelRyanWebber](https://github.com/MichaelRyanWebber), for all your work!

#### 🐛 Bug Fix

- Mw teams updates [#184](https://github.com/friggframework/frigg/pull/184) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Merge remote-tracking branch 'origin/main' into mw-teams-updates ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update tests to work with merged changes ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Mw teams updates [#136](https://github.com/friggframework/frigg/pull/136) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Merge branch 'main' into mw-teams-updates ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- rename env variable TEAMS_ID to TEAMS_TEAM_ID| ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- remove unnecessary timeout increase ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add super test that uses multiple sub-apis ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- fix typo ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- remove onInvokeActivity override and use handleTeamsCardActionInvoke instead, as this is the more idiomatic approach (which is all that really matters since it's just as an example). onInvokeActivity is actually implemented by the super class, and dispatches to the various handle* functions. ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add "hello world" example to router sample ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- move non-interactive methods into the botApi class ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))
- update redirect uri handling [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- remove Bot method that contained sample integration logic (confusing, shouldn't live there). [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add new sub-api to as a wrapper for a bot using the bot-builder SDK [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- move getTokenFromClientCredentials into the Api class, and for recieveNotification to only respond to the graphApi. The bot framework token lasts a day while the graph api token lasts an hour. [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- more updates to manager and manager test [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- bit closer with manager test [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update tests correspondingly [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update exports to be consistent [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- first pass at manager [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add/update entity and credentials [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add methods and tests to graphApi, add botFrameworkApi to be included in teams module. start work on manager [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- override getTokenFromClientCredentials() to allow for application based authentication. add modified tests api-cred.test.js for requests made as an application, since there are different restrictions. [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for listing channel members and use to confirm addUserToChannel in tests [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- added functions for creating and deleting channels, as well as adding a user to a channel [#134](https://github.com/friggframework/frigg/pull/134) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- no more probe [#134](https://github.com/friggframework/frigg/pull/134) ([@seanspeaks](https://github.com/seanspeaks))
- NPM will now work [#134](https://github.com/friggframework/frigg/pull/134) ([@seanspeaks](https://github.com/seanspeaks))
- Scaffolded up using Microsoft Auth [#134](https://github.com/friggframework/frigg/pull/134) ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.7 (Thu Jun 08 2023)

#### 🐛 Bug Fix

- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 1

- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.6 (Thu May 25 2023)

#### 🐛 Bug Fix

- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 1

- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.5 (Mon May 01 2023)

#### 🐛 Bug Fix

- microsoft teams updates [#153](https://github.com/friggframework/frigg/pull/153) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update name of method for creating conversation references to better indicate the functionality (and that it makes a number of requests) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- conversation references ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method to retrieve the primary channel for a team ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method to retrieve teams (technically a subset of groups) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update manager to correctly support code and client_credentials style auth in processAuthorizationCallback ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- fix typo to adminConsentUrl ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add grantConsent url to graphApi for now [#152](https://github.com/friggframework/frigg/pull/152) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add requests for teams scope app search, installation and removal [#152](https://github.com/friggframework/frigg/pull/152) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add requests for appCatalog and app uninstall [#152](https://github.com/friggframework/frigg/pull/152) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- added methods for retrieving joined teams, app retrieval and installation (for user). [#152](https://github.com/friggframework/frigg/pull/152) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.4 (Thu Apr 27 2023)

#### 🐛 Bug Fix

- add requests for app installation and removal [#152](https://github.com/friggframework/frigg/pull/152) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add grantConsent url to graphApi for now ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add requests for teams scope app search, installation and removal ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add requests for appCatalog and app uninstall ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- added methods for retrieving joined teams, app retrieval and installation (for user). ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.3 (Tue Apr 04 2023)

#### 🐛 Bug Fix

- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 1

- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.2 (Fri Mar 03 2023)

:tada: This release contains work from a new contributor! :tada:

Thank you, null[@MichaelRyanWebber](https://github.com/MichaelRyanWebber), for all your work!

#### 🐛 Bug Fix

- WIP for microsoft teams module [#134](https://github.com/friggframework/frigg/pull/134) ([@seanspeaks](https://github.com/seanspeaks) [@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update redirect uri handling ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- remove Bot method that contained sample integration logic (confusing, shouldn't live there). ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add new sub-api to as a wrapper for a bot using the bot-builder SDK ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- move getTokenFromClientCredentials into the Api class, and for recieveNotification to only respond to the graphApi. The bot framework token lasts a day while the graph api token lasts an hour. ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- more updates to manager and manager test ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- bit closer with manager test ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update tests correspondingly ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update exports to be consistent ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- first pass at manager ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add/update entity and credentials ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add methods and tests to graphApi, add botFrameworkApi to be included in teams module. start work on manager ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- override getTokenFromClientCredentials() to allow for application based authentication. add modified tests api-cred.test.js for requests made as an application, since there are different restrictions. ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for listing channel members and use to confirm addUserToChannel in tests ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- added functions for creating and deleting channels, as well as adding a user to a channel ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- no more probe ([@seanspeaks](https://github.com/seanspeaks))
- NPM will now work ([@seanspeaks](https://github.com/seanspeaks))
- Scaffolded up using Microsoft Auth ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))
