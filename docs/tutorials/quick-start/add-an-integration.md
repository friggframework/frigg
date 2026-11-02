# Add an Integration

A backend with zero integrations is a very tidy, very quiet backend. Let's give it something to talk to. We'll use HubSpot as the example.

## 1. Install the API module

From your app folder:

```bash
npx frigg install hubspot
```

This does three things:

1. Runs `npm install` for `@friggframework/api-module-hubspot` (the `@next` release while your app is on a Frigg 2.x prerelease).
2. Writes `src/integrations/HubSpotIntegration.js`.
3. Adds `HubSpotIntegration` to the `integrations` array in `index.js`.

If `index.js` no longer has a single `integrations: [...]` array, `frigg install` leaves the file alone and prints the two lines to add yourself.

## 2. Fill in the environment variables

The command finishes by listing the variables the module needs:

```
Missing environment variables: HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET, HUBSPOT_SCOPE, REDIRECT_URI
Set these in .env for local development: HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET, HUBSPOT_SCOPE, REDIRECT_URI
```

Add them to `.env`. The client ID and secret come from an app you create in your HubSpot developer account.

## 3. Have a look at the integration

Open `src/integrations/HubSpotIntegration.js`. It's an `IntegrationBase` subclass with a `static Definition`:

* `modules` lists the API modules this integration uses. Each key becomes `this.<key>` on an instance, so you'll reach HubSpot's client as `this.hubspot.api`.
* `routes` declares HTTP routes, served under `/api/hubspot-integration/...`.
* `this.events` in the constructor maps event names to handlers.

Both `routes` and `events` start empty, with commented examples to copy.

## 4. Restart

Stop `npm start` with `Ctrl+C` and start it again so the backend picks up the new integration and `.env` values.

Next (optional): [look around with `frigg ui`](management-ui.md).
