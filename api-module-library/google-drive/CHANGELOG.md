# v0.1.0 (Wed Sep 06 2023)

#### 🐛 Bug Fix

- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 1

- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.11 (Mon Aug 14 2023)

#### 🐛 Bug Fix

- Push comment hoping for module to be released! [#214](https://github.com/friggframework/frigg/pull/214) ([@roboli](https://github.com/roboli))
- Push comment hoping for module to be released! ([@roboli](https://github.com/roboli))
- Return full response when fetching file [ci skip] [#213](https://github.com/friggframework/frigg/pull/213) ([@roboli](https://github.com/roboli))
- Return full response when fetching file [ci skip] ([@roboli](https://github.com/roboli))

#### Authors: 1

- Roberto Oliveros ([@roboli](https://github.com/roboli))

---

# v0.0.10 (Sat Jun 24 2023)

#### 🐛 Bug Fix

- Fix save entity if user removes GD permissions and attempt to connect again [#186](https://github.com/friggframework/frigg/pull/186) ([@leofmds](https://github.com/leofmds))
- Fix save entity if user removes GD permissions and attempt to connect again ([@leofmds](https://github.com/leofmds))

#### Authors: 1

- Leonardo Ferreira ([@leofmds](https://github.com/leofmds))

---

# v0.0.9 (Thu Jun 08 2023)

#### 🐛 Bug Fix

- Fr/gdrive lef 280 [#175](https://github.com/friggframework/frigg/pull/175) (michael.webber@lefthook.com [@seanspeaks](https://github.com/seanspeaks))
- set refresh_token on instance retrieval. [#174](https://github.com/friggframework/frigg/pull/174) ([@seanspeaks](https://github.com/seanspeaks))
- set refresh_token on instance retrieval. ([@seanspeaks](https://github.com/seanspeaks))
- Google Drive update ([@seanspeaks](https://github.com/seanspeaks))
- added simple upload style method (michael.webber@lefthook.com)
- add helper method that checks status of a file upload session, which is a special case of the content upload request (PUT to session uri) [#170](https://github.com/friggframework/frigg/pull/170) (michael.webber@lefthook.com)
- add methods for resumable file upload [#170](https://github.com/friggframework/frigg/pull/170) (michael.webber@lefthook.com)
- update debug log message to indicate the correct externalId [#170](https://github.com/friggframework/frigg/pull/170) (michael.webber@lefthook.com)
- fixes to credential model and db upsert [#170](https://github.com/friggframework/frigg/pull/170) (michael.webber@lefthook.com)
- Add test for the refresh_token (and access_token) [#170](https://github.com/friggframework/frigg/pull/170) (michael.webber@lefthook.com)
- google auth spec wants the default behavior of getTokenFromCode, even though the AuthHeader style was working. [#170](https://github.com/friggframework/frigg/pull/170) (michael.webber@lefthook.com)
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 2

- Michael Webber (michael.webber@lefthook.com)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.8 (Wed Jun 07 2023)

#### 🐛 Bug Fix

- google drive - auth fixes [#170](https://github.com/friggframework/frigg/pull/170) (michael.webber@lefthook.com [@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add helper method that checks status of a file upload session, which is a special case of the content upload request (PUT to session uri) (michael.webber@lefthook.com)
- add methods for resumable file upload (michael.webber@lefthook.com)
- update debug log message to indicate the correct externalId (michael.webber@lefthook.com)
- fixes to credential model and db upsert (michael.webber@lefthook.com)
- Add test for the refresh_token (and access_token) (michael.webber@lefthook.com)
- google auth spec wants the default behavior of getTokenFromCode, even though the AuthHeader style was working. (michael.webber@lefthook.com)
- Bump independent versions \[skip ci\] ([@seanspeaks](https://github.com/seanspeaks))

#### Authors: 3

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Michael Webber (michael.webber@lefthook.com)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.7 (Fri May 26 2023)

#### 🐛 Bug Fix

- Trailing Slash removal for Google Drive [#166](https://github.com/friggframework/frigg/pull/166) ([@seanspeaks](https://github.com/seanspeaks))
- trailing slash removal ([@seanspeaks](https://github.com/seanspeaks))
- Use the method [#164](https://github.com/friggframework/frigg/pull/164) ([@seanspeaks](https://github.com/seanspeaks))
- Live state retrieval (getAuthorizationUri method override) [#163](https://github.com/friggframework/frigg/pull/163) ([@seanspeaks](https://github.com/seanspeaks))
- Add support for state param [#162](https://github.com/friggframework/frigg/pull/162) ([@seanspeaks](https://github.com/seanspeaks))
- Need to add publishConfig for public first time publishing [#159](https://github.com/friggframework/frigg/pull/159) ([@seanspeaks](https://github.com/seanspeaks))
- allow root request to pass query (in case verbose data is needed) [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving the root folder of My Drive [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving drives [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add convenience function for listing folders [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic functionality for google-drive api module complete [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial manager and manager.test working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- individual file details and data retrieval [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- lint fixes [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- folder search test working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic files request working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- auth is working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial commit of google-drive api module from generator [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.6 (Fri May 26 2023)

#### 🐛 Bug Fix

- :face-palm: [#164](https://github.com/friggframework/frigg/pull/164) ([@seanspeaks](https://github.com/seanspeaks))
- Use the method ([@seanspeaks](https://github.com/seanspeaks))
- Live state retrieval (getAuthorizationUri method override) [#163](https://github.com/friggframework/frigg/pull/163) ([@seanspeaks](https://github.com/seanspeaks))
- Add support for state param [#162](https://github.com/friggframework/frigg/pull/162) ([@seanspeaks](https://github.com/seanspeaks))
- Need to add publishConfig for public first time publishing [#159](https://github.com/friggframework/frigg/pull/159) ([@seanspeaks](https://github.com/seanspeaks))
- allow root request to pass query (in case verbose data is needed) [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving the root folder of My Drive [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving drives [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add convenience function for listing folders [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic functionality for google-drive api module complete [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial manager and manager.test working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- individual file details and data retrieval [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- lint fixes [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- folder search test working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic files request working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- auth is working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial commit of google-drive api module from generator [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.5 (Fri May 26 2023)

#### 🐛 Bug Fix

- Override getAuthorizationUri [#163](https://github.com/friggframework/frigg/pull/163) ([@seanspeaks](https://github.com/seanspeaks))
- Live state retrieval (getAuthorizationUri method override) ([@seanspeaks](https://github.com/seanspeaks))
- Add support for state param [#162](https://github.com/friggframework/frigg/pull/162) ([@seanspeaks](https://github.com/seanspeaks))
- Need to add publishConfig for public first time publishing [#159](https://github.com/friggframework/frigg/pull/159) ([@seanspeaks](https://github.com/seanspeaks))
- allow root request to pass query (in case verbose data is needed) [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving the root folder of My Drive [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving drives [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add convenience function for listing folders [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic functionality for google-drive api module complete [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial manager and manager.test working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- individual file details and data retrieval [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- lint fixes [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- folder search test working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic files request working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- auth is working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial commit of google-drive api module from generator [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.4 (Fri May 26 2023)

#### 🐛 Bug Fix

- Add state param support for google drive [#162](https://github.com/friggframework/frigg/pull/162) ([@seanspeaks](https://github.com/seanspeaks))
- Add support for state param ([@seanspeaks](https://github.com/seanspeaks))
- Need to add publishConfig for public first time publishing [#159](https://github.com/friggframework/frigg/pull/159) ([@seanspeaks](https://github.com/seanspeaks))
- allow root request to pass query (in case verbose data is needed) [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving the root folder of My Drive [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving drives [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add convenience function for listing folders [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic functionality for google-drive api module complete [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial manager and manager.test working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- individual file details and data retrieval [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- lint fixes [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- folder search test working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic files request working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- auth is working [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial commit of google-drive api module from generator [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.3 (Thu May 25 2023)

#### 🐛 Bug Fix

- Support calling localhost for ironclad api [#160](https://github.com/friggframework/frigg/pull/160) ([@debbie-yu](https://github.com/debbie-yu))

#### Authors: 1

- [@debbie-yu](https://github.com/debbie-yu)

---

# v0.0.2 (Wed May 24 2023)

#### 🐛 Bug Fix

- Need to add publishConfig for public first time publishing [#159](https://github.com/friggframework/frigg/pull/159) ([@seanspeaks](https://github.com/seanspeaks))
- Need to add publishConfig for public first time publishing ([@seanspeaks](https://github.com/seanspeaks))
- Google Drive API module [#154](https://github.com/friggframework/frigg/pull/154) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- allow root request to pass query (in case verbose data is needed) ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving the root folder of My Drive ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add method for retrieving drives ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- add convenience function for listing folders ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic functionality for google-drive api module complete ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial manager and manager.test working ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- individual file details and data retrieval ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- lint fixes ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- folder search test working ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- basic files request working ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- auth is working ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))
- initial commit of google-drive api module from generator ([@MichaelRyanWebber](https://github.com/MichaelRyanWebber))

#### Authors: 2

- [@MichaelRyanWebber](https://github.com/MichaelRyanWebber)
- Sean Matthews ([@seanspeaks](https://github.com/seanspeaks))

---

# v0.0.1 (May 02 2023)

#### Generated
- Initialized from template
