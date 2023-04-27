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
