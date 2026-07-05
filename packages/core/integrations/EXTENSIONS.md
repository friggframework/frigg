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
                // optional: override the extension's declared useDatabase
                // useDatabase: true,
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

The binding key (`hubspotWebhooks`) is your local name. It is also the **URL namespace** for the extension's routes (see below), so pick something readable — `hubspot` yields a cleaner URL than `hubspotWebhooks`. The extension reference (`hubspot.extensions.webhooks`) is whatever the API module exports.

## Step 2: Deploy

Each extension binding is mounted under its **binding key**, on its own dedicated handler/Lambda function. This means two modules' extensions (e.g. a HubSpot and a Clockwork webhooks extension on the same integration) never collide — each lives at a distinct namespaced path. Boot logs show:

```
│ Configuring routes for hubspot Integration:
│ POST /api/hubspot-integration/hubspotWebhooks/webhooks  (extension: hubspot-webhooks, useDatabase: false)
│
```

So the full URL is `/api/{integration-name}-integration/{bindingKey}{route.path}`. Register that URL with the upstream provider (e.g. paste it into your HubSpot app's webhook settings). Hit it and the bound method (`onHubSpotEvent`) fires on the resolved per-account integration instance.

> **⚠️ Breaking:** extension routes used to mount un-namespaced (`/api/{x}-integration/webhooks`). They are now namespaced under the binding key. Any provider webhook already registered against the old path must be re-pointed at the new `/{bindingKey}` URL — and for signature schemes that sign the full URL (e.g. HubSpot v3), the old registration will also fail verification until updated.

## `useDatabase` — does the receiver open a DB connection?

Each extension declares whether its route handler should open a database connection:

```javascript
// in the extension bundle (api-module side)
module.exports = {
    name: 'hubspot-webhooks',
    useDatabase: false,   // default — the receiver is DB-free
    routes: [ /* ... */ ],
    events: { /* ... */ },
};
```

- **Default is `false`** — a webhook receiver that only verifies a signature and enqueues should not pay for a DB connection (faster cold start; at build time its Lambda doesn't get the Prisma layer).
- Set `useDatabase: true` at the **extension level** if the receiver itself needs the DB. A binding may override it locally (`extensions: { x: { extension, useDatabase: true } }`), though that's rarely needed.
- Resolution order: `binding.useDatabase ?? extension.useDatabase ?? false`.
- Scope note: `false` is the default **for extension routes**. `createHandler` itself still defaults `shouldUseDatabase: true` for the integration's own catch-all handler and the legacy `Definition.webhooks: true` path — those connect as before. The `false` default applies only to the per-binding extension handler.

If `useDatabase` is `false`, the receiver must not touch the database. Work that needs the DB (e.g. resolving `portalId → integrationId`) belongs in the queue worker that processes the dispatched event, not in the receiver.

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

**Routes do not collide across bindings** — each binding's routes are namespaced under its binding key (`/{bindingKey}{route.path}`), so two extensions can both declare `POST /webhooks` and live at distinct URLs. A route conflict only throws at boot if a *single* binding declares two routes with the same `method + path` (or a `Definition.routes` entry exactly matches an extension's namespaced path). Note this is independent of event-name conflicts above: namespacing disambiguates URLs, but two bindings still must use distinct **event** names since events are merged into one `this.events` map.

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
                    // Reverse-lookup is exposed via friggCommands, the
                    // canonical access pattern for cross-cutting lookups.
                    // The HubSpot-named wrapper lives in the api-module's
                    // extension package.
                    const integrationId =
                        await this.commands.findIntegrationByEntityExternalId(
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

## Reverse-lookup helpers

For app-level webhooks (HubSpot, Slack, Asana, Microsoft Teams, etc.) where one URL serves many accounts, extension default handlers need to resolve the inbound external ID (HubSpot `portalId`, Slack `team_id`, Asana `workspace_id`, Teams `tenant_id`) to a Frigg integration record. Two helpers are exposed via [`createFriggCommands`](../application/index.js) — the canonical access pattern for cross-cutting lookups:

```javascript
// inside an integration class
this.commands = createFriggCommands({ integrationClass: MyIntegration });

// Throws on ambiguous resolution. Use when one externalId is expected
// to map to exactly one integration.
const integrationId = await this.commands.findIntegrationByEntityExternalId(
    externalId,
    'hubspot' // optional moduleName
);

// Returns array. Use when one externalId may legitimately fan out to
// multiple integrations (e.g. one upstream account broadcasting to
// several Frigg integration records).
const integrationIds = await this.commands.listIntegrationsByEntityExternalId(
    externalId,
    'hubspot'
);
```

`findIntegrationByEntityExternalId` throws if:
- the (externalId, moduleName) tuple matches more than one Entity row, OR
- the matched entity is owned by more than one Integration record

A silent first-match at either layer is a cross-tenant routing risk; the command refuses to pick. The second argument (moduleName) disambiguates when multiple modules in the same app could carry colliding external IDs — pass it whenever an api-module knows its own moduleName.

### Where platform-named wrappers belong

The commands are intentionally platform-neutral. Platform-vocabulary wrappers (`findIntegrationByPortalId`, `findIntegrationByTeamId`, `findIntegrationByWorkspaceId`, etc.) belong **inside the api-module's own extension**, not in core:

```javascript
// inside @friggframework/api-module-hubspot/extensions/webhooks
async function findIntegrationByPortalId(integration, portalId) {
    // thin wrapper — reads as self-documenting HubSpot code,
    // delegates to the platform-neutral command
    return integration.commands.findIntegrationByEntityExternalId(
        portalId,
        'hubspot'
    );
}
```

This keeps core platform-neutral and reusable while keeping the api-module code self-documenting for the platform's developers. The same rule applies to any helper that can be named in a single platform's vocabulary.

## See also

- [ADR-EXTENSIONS](../../../docs/architecture/ADR-EXTENSIONS.md) — the three-tier taxonomy (Core Plugins / Application Extensions / Integration Extensions)
- [WEBHOOK-QUICKSTART](./WEBHOOK-QUICKSTART.md) — per-account `Definition.webhooks: true` pattern
- `extension.js` — the validation + flattening helpers (`validateExtensionBinding`, `getExtensionRoutes`, `getExtensionWorkers`)
