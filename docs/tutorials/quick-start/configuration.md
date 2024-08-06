# Configuration

## Frontend

From your terminal, navigate to the Frontend Directory and set up your own config files for the frontend of your Frigg app. Copy the `.env.example` manually or with this command:

```
cd frontend
cp .env.example .env
```

## Backend

Configuration of the app is currently managed in two places for the backend. You can see the backend configuration here: `backend/src/configs/*.json` but you will also need a `.env` file in `/backend`. To set it up, use the following command:

```
cd backend
cp .env.example .env
```

### Start MongoDB with Docker

Within the backend directory of your project, now run the Docker command:

```
npm run docker:start
```

This will set up a MongoDB instance locally with the necessary configurations.

### Set up your HubSpot App

You also need to add your HubSpot credentials into the `dev.json` file. Go to your HubSpot account and create a new HubSpot App, and explore HubSpot if you're not familiar with it.\
Inside your HubSpot App, head to the "Auth" Tab, next to "App Info," where your can find your app settings.&#x20;

<figure><img src="../../.gitbook/assets/image (5).png" alt=""><figcaption><p>HubSpot's Auth tab for your app</p></figcaption></figure>

Now copy your Client ID and Client Secret into the  `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET` fields in the `dev.json` file.\
Add `oauth` to the HUBSPOT\_SCOPE array in `dev.json`. In the same tab, click the `+Add new scope` button, search for and add the scopes listed in your `dev.json` file.

<figure><img src="../../.gitbook/assets/image (6).png" alt=""><figcaption><p>Your scopes should look like this after adding them</p></figcaption></figure>

Next, under the "Redirect URLs" section in the "Auth" tab, add `http://localhost:3000/redirect/hubspot` as a redirect URI.

<figure><img src="../../.gitbook/assets/image (7).png" alt=""><figcaption><p>Here you can set up your redirect locations</p></figcaption></figure>

Save your changes in both the `dev.json` file and HubSpot Auth settings.

Finally, from HubSpot's Developer home, create a new developer test account. This will prepare your app for integration and testing.

With all these settings configured, you're now ready to  start your Frigg application.
