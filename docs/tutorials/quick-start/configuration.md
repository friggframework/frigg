# Configuration

We've streamlined the setup process to make it as smooth as possible. We've pre-configured several environment variables that apply universally to all Frigg users upon installation. All that's left for you to do is to add your personal HubSpot credentials to connect to your app:

### Set up your HubSpot App

To add your HubSpot credentials, open the `.env` file located in `backend/*.env` with your IDE and have it ready to paste the information we'll gather in the next steps.

Go to your HubSpot account and create a new HubSpot App, and explore HubSpot if you're not familiar with it. Inside your HubSpot App, head to the "Auth" Tab, next to "App Info," where your can find your app settings.

<figure><img src="../../.gitbook/assets/image (5).png" alt=""><figcaption><p>HubSpot's Auth tab for your app</p></figcaption></figure>

Now copy your Client ID and Client Secret into the `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET` fields in the `.env` file. In the same file, add `oauth` to the HUBSPOT\_SCOPE array.\\

In HubSpot's tab, click the `+Add new scope` button, search for and add the scopes listed in your `.env` file.

<figure><img src="../../.gitbook/assets/image (6).png" alt=""><figcaption><p>Your scopes should look like this after adding them</p></figcaption></figure>

Next, under the "Redirect URLs" section in the "Auth" tab, add `http://localhost:3000/redirect/hubspot` as a redirect URI.

<figure><img src="../../.gitbook/assets/image (7).png" alt=""><figcaption><p>Here you can set up your redirect locations</p></figcaption></figure>

Save your changes in both the `.env` file and HubSpot Auth settings.

Finally, from HubSpot's Developer home, create a new developer test account. This will prepare your app for integration and testing.

With all these settings configured, you're now ready to start your Frigg application.
