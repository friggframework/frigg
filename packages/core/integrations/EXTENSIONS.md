# Integration Extensions Quick Start

Tier 3 **Integration Extensions** let an API module ship reusable handler bundles — receiver routes, event handlers, queues, workers — that an integration consumes declaratively via `Definition.extensions`. See [ADR-EXTENSIONS](../../../docs/architecture/ADR-EXTENSIONS.md) for the full taxonomy.

## When to use this vs `Definition.webhooks: true`

| Use `webhooks: true` ([WEBHOOK-QUICKSTART](./WEBHOOK-QUICKSTART.md)) | Use `extensions: {...}` |
|---|---|
| Per-account webhooks scoped to one integration record | App-level webhooks fanned out to many account records by external ID lookup |
| You'll write the receiver, signature check, and queue dispatch yourself | The API module ships the receiver, signature check, and queue dispatch already |
| One pattern, one endpoint | Multiple bundles (webhooks + CRM cards + timeline) declared together |

## Step 1: Bind the extension on your Integration's Definition

```javascript
const hubspot = require('@friggframework/api-module-hubspot');

class HubSpotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot',
        version: '1.0.0',
        modules: { hubspot: { definition: hubspot.Definition } },
        extensions: {
            hubspotWebhooks: {
                extension: hubspot.extensions.webhooks,
                handlers: { HUBSPOT_WEBHOOK: 'onHubSpotEvent' },
            },
        },
    };

    async onHubSpotEvent({ data }) {
        // pure business logic — signature verification, portalId lookup,
        // and queue dispatch are all done by the extension's default handlers
        const { subscriptionType, objectId } = data.body;
        if (subscriptionType === 'contact.creation') {
            await this.upsertContact(objectId);
        }
    }
}
```

The binding key (`hubspotWebhooks`) is your local name. The extension reference (`hubspot.extensions.webhooks`) is whatever the API module exports.

## Step 2: Deploy

The framework auto-mounts each extension's routes at the integration's base path. Boot logs show:

```
│ Configuring routes for hubspot Integration:
│ POST /api/hubspot-integration/webhooks  (extension: hubspot-webhooks)
│
```

Hit that URL and the bound method (`onHubSpotEvent`) fires on the resolved per-account integration instance.

## How handler binding works

Each binding can map extension event names to method names on your integration:

```javascript
extensions: {
    hubspotWebhooks: {
        extension: hubspot.extensions.webhooks,
        handlers: {
            HUBSPOT_WEBHOOK: 'onHubSpotEvent',          // method on `this`
        },
    },
},
```

Resolution priority per event:

1. `binding.handlers[eventName]` → resolves to `this[methodName]`, bound to the instance
2. Extension's own default handler from `extension.events[eventName].handler`, bound to the instance
3. Otherwise → `initialize()` throws with a message naming the integration, binding, and event

Strings (not function refs) are intentional: it dodges the `this`-in-static-Definition bootstrapping problem and centralizes binding inside the framework. The framework resolves the method against the live integration instance at startup.

## Event-name conflicts (and binding the same extension twice)

If two bindings in your integration's `extensions` map declare the same event name, the framework **throws at `initialize()`** with a clear conflict error — no silent first/last-writer pick, no surprise routing. The fix is to use distinct event names per binding.

This means **binding the same extension twice only works if the extension itself defines disjoint event sets per use-case** (rare). For the common "two webhooks, two handlers" pattern, an API module should ship two distinct extensions instead — for example `hubspot.extensions.webhooks` and `hubspot.extensions.sandboxWebhooks`, each with its own event names.

Subclass overrides via `this.events[eventName]` (set in the constructor) take precedence over extension-declared events. If a binding tried to wire a handler that's now shadowed, the framework logs a warning naming the integration, binding, and ignored method.

Route path conflicts (two extensions declaring the same `method + path`, or an extension colliding with a `Definition.routes` entry) also throw at boot.

## Authoring an extension (for API module authors)

An extension bundle is a plain object exported from your api-module:

```javascript
// @friggframework/api-module-hubspot/extensions/webhooks/index.js
module.exports = {
    name: 'hubspot-webhooks',
    routes: [
        { path: '/webhooks', method: 'POST', event: 'HUBSPOT_WEBHOOK_RECEIVED' },
    ],
    events: {
        HUBSPOT_WEBHOOK_RECEIVED: {
            type: 'LIFE_CYCLE_EVENT',
            handler: async function ({ req, res }) {
                // verify signature, look up integration by portalId, queue
                await verifyHubSpotSignature(req);
                for (const evt of req.body) {
                    const integrationId = await this.findIntegrationByPortalId(
                        evt.portalId,
                        'hubspot'
                    );
                    if (!integrationId) continue;
                    await this.queueWebhook({
                        integrationId,
                        body: evt,
                        event: 'HUBSPOT_WEBHOOK',
                    });
                }
                res.status(200).json({ received: req.body.length });
            },
        },
        HUBSPOT_WEBHOOK: {
            type: 'LIFE_CYCLE_EVENT',
            handler: async function ({ data }) {
                // default no-op; integrations override via binding.handlers
            },
        },
    },
};
```

Then expose it on your api-module's index:

```javascript
// @friggframework/api-module-hubspot/index.js
module.exports = {
    Definition: require('./api-module-definition'),
    extensions: {
        webhooks: require('./extensions/webhooks'),
        crmCards: require('./extensions/crm-cards'),
        timeline: require('./extensions/timeline'),
    },
};
```

## Contract enforced by the framework

At `initialize()`, the framework validates each binding:

- `extension` must be an object with a `name`
- `extension.events` must be an object keyed by event name (if present)
- `extension.routes` must be an array (if present)
- Every route's `event` must exist in `extension.events`
- Every route's `method` must be a known HTTP verb
- For each event, either `binding.handlers[eventName]` resolves to an instance method, OR `extension.events[eventName].handler` is a function

Validation failures throw at boot with a message identifying the integration, binding, and field.

## Reverse-lookup helper

For app-level webhooks (HubSpot, Slack, etc.) where one URL serves many accounts, extension default handlers commonly need to resolve the inbound external ID (portalId, team_id, workspace_id) to a Frigg integration record. Use the inherited helper:

```javascript
const integrationId = await this.findIntegrationByPortalId(externalId, 'hubspot');
```

Returns the integration ID (or `null`) for the first matching entity. The second arg disambiguates when multiple modules in the same app could carry colliding external IDs.

## See also

- [ADR-EXTENSIONS](../../../docs/architecture/ADR-EXTENSIONS.md) — the three-tier taxonomy (Core Plugins / Application Extensions / Integration Extensions)
- [WEBHOOK-QUICKSTART](./WEBHOOK-QUICKSTART.md) — per-account `Definition.webhooks: true` pattern
- `extension.js` — the validation + flattening helpers (`validateExtensionBinding`, `getExtensionRoutes`, `getExtensionWorkers`)
