# v1.2.2 (Fri Aug 09 2024)

#### 🐛 Bug Fix

- Add support for secrets loading from SECRET_ARN [#327](https://github.com/friggframework/frigg/pull/327) ([@seanspeaks](https://github.com/seanspeaks))
- Adding support for secrets loading ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 1

- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.2.1 (Thu Aug 08 2024)

#### 🐛 Bug Fix

- Fix bug during local running [#326](https://github.com/friggframework/frigg/pull/326) ([@seanspeaks](https://github.com/seanspeaks))
- Adding toJSON so that the descriminator decorator will be evaluated/added to the mongoose model (currently undefined on initialization and first invocation) ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 1

- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.2.0 (Tue Aug 06 2024)

:tada: This release contains work from a new contributor! :tada:

Thank you, Daniel Klotz ([@d-klotz](https://github.com/d-klotz)), for all your work!

#### 🐛 Bug Fix

- Add READMEs that will need updating, but for version releasing [#324](https://github.com/friggframework/frigg/pull/324) ([@seanspeaks](https://github.com/seanspeaks))
- Add READMEs that will need updating, but for version releasing ([@seanspeaks](https://github.com/seanspeaks))
- small update to integration testing / tooling [#304](https://github.com/friggframework/frigg/pull/304) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- chore: bump deprecated npm package versions [#323](https://github.com/friggframework/frigg/pull/323) ([@d-klotz](https://github.com/d-klotz) [@seanspeaks](https://github.com/seanspeaks))
- chore: bump deprecated package versions ([@d-klotz](https://github.com/d-klotz))
- Bump version to: v1.1.8 \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))
- remove comment ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- use the factory methods for creating the mock integration so that everything is set up (mostly events and userActions) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- fix imports to not inadvertently call loadInstalledModules ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump version to: v1.1.5 \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 3

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Daniel Klotz ([@d-klotz](https://github.com/d-klotz))
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.1.8 (Thu Jul 18 2024)

#### 🐛 Bug Fix

- Revert open to support commonjs [#319](https://github.com/friggframework/frigg/pull/319) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump version to: v1.1.6 \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.1.7 (Mon Jul 15 2024)

#### 🐛 Bug Fix

- getAuthorizationRequirements() async [#318](https://github.com/friggframework/frigg/pull/318) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- getAuthorizationRequirements should be async, though it will only occasionally need to make requests ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump version to: v1.1.6 \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.1.6 (Fri Apr 26 2024)

#### 🐛 Bug Fix

- Small fix to validation errors and cleanup [#307](https://github.com/friggframework/frigg/pull/307) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- remove excess files to centralize jest config and cleanup ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump version to: v1.1.5 \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.1.5 (Tue Apr 09 2024)

#### 🐛 Bug Fix

- update router to include options and refresh [#301](https://github.com/friggframework/frigg/pull/301) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- consistent spacing ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add back the /api/entity POST of a credential with a tentative adjustment to implementation ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- be consistent about not using redundant variables for the response json ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- remove accidental newline ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- fixes to router and stubs ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- update router to include options and refresh for entities, integration config, and integration user actions ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump version to: v1.1.4 \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))
- Bump version to: v1.1.3 \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.1.4 (Fri Apr 05 2024)

#### 🐛 Bug Fix

- Socket hang up / ECONNRESET error retry for requester [#297](https://github.com/friggframework/frigg/pull/297) ([@seanspeaks](https://github.com/seanspeaks))
- Check linear task description for offending error. Unclear if this is the best approach. ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 1

- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.1.3 (Tue Apr 02 2024)

#### 🐛 Bug Fix

- test release [#296](https://github.com/friggframework/frigg/pull/296) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add a commit to fix canary and workaround auto bug ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- bump to test release ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))

#### Authors: 1

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)

---

# v2.0.0 (Sat Mar 30 2024)

#### 🚀 Enhancement

- Package redo [#294](https://github.com/friggframework/frigg/pull/294) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))

#### 🐛 Bug Fix

- update test related imports in core ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- missed one ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- create test, eslint-config and prettier-config packages as base shared dependencies ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Publish ([@seanspeaks](https://github.com/seanspeaks))
- Bump node and npm version for the whole repo (Fix CI) [#274](https://github.com/friggframework/frigg/pull/274) ([@seanspeaks](https://github.com/seanspeaks))
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v1.1.0 (Wed Mar 20 2024)

:tada: This release contains work from new contributors! :tada:

Thanks for all your work!

:heart: Nicolas Leal ([@nicolasmelo1](https://github.com/nicolasmelo1))

:heart: nmilcoff ([@nmilcoff](https://github.com/nmilcoff))

#### 🚀 Enhancement


#### 🐛 Bug Fix

- correct some bad automated edits, though they are not in relevant files ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 4

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Nicolas Leal ([@nicolasmelo1](https://github.com/nicolasmelo1))
- nmilcoff ([@nmilcoff](https://github.com/nmilcoff))
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))
