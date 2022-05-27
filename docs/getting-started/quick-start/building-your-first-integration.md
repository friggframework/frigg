# Building your first integration

* HubSpotIntegrationManager.js
* `getExample` function, add

```
const contacts = await this.targetInstance.api.listContacts()
return contacts.results
```

* Go to HubSpot, sign up for a developer account
* Create an Application
* Navigate to Settings
* OAuth
* Copy Client ID and Secret into `/config/dev.json` under `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET` respectively
* Add `http://localhost:3000/redirect/hubspot` to the redirect URI
* Navigate to backend, run `npm start`
* Go to the dashboard and reload if you haven't yet. Tada!  Your first integration
