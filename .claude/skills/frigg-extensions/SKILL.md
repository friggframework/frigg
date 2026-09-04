---
name: frigg-extensions
description: "Frigg Tier 3 Integration Extensions — reusable handler bundles (receiver routes, event handlers, queues, workers) that an API module ships and an integration consumes declaratively via Definition.extensions. Covers binding an extension, route namespacing under the binding key, the useDatabase flag, handler-to-method binding and resolution order, event-name conflicts, authoring an extension on the api-module side, the framework contract, and the reverse-lookup helpers for app-level webhooks (findIntegrationByEntityExternalId). Use when consuming or authoring a Frigg integration extension, or wiring app-level webhooks fanned out to many accounts. For simple per-account webhooks, use Definition.webhooks instead."
---

# Frigg Integration Extensions

Tier 3 **Integration Extensions** let an API module ship reusable handler bundles — receiver routes, event handlers, queues, workers — that an integration consumes declaratively via `Definition.extensions`. Canonical docs: `packages/core/integrations/EXTENSIONS.md` and `docs/architecture-decisions/015-extensions-taxonomy.md` (the extensions taxonomy). For the per-account `Definition.webhooks: true` pattern, see `packages/core/integrations/WEBHOOK-QUICKSTART.md`.

## Extensions vs `Definition.webhooks: true`

| `webhooks: true` | `extensions: {...}` |
| --- | --- |
| Per-account webhooks scoped to one integration record | App-level webhooks fanned out to many accounts by external-ID lookup |
| You write the receiver, signature check, and queue dispatch | The API module ships receiver, signature check, and dispatch |
| One pattern, one endpoint | Multiple bundles (webhooks + CRM cards + timeline) declared together |

## Consuming an extension

```javascript
const hubspot = require('@friggframework/api-module-hubspot');

class HubSpotIntegration extends IntegrationBase {
  static Definition = {
    name: 'hubspot',
    version: '1.0.0',
    modules: { hubspot: { definition: hubspot.Definition } },
    extensions: {
      hubspotWebhooks: {                         // binding key = local name + URL namespace
        extension: hubspot.extensions.webhooks,  // whatever the api-module exports
        handlers: { HUBSPOT_WEBHOOK: 'onHubSpotEvent' },  // event → method name (string)
        // useDatabase: true,                    // optional per-binding override
      },
    },
  };

  async onHubSpotEvent({ data }) {
    // pure business logic — signature verification, ID lookup, and queue
    // dispatch are handled by the extension's default handlers
    const { subscriptionType, objectId } = data.body;
    if (subscriptionType === 'contact.creation') await this.upsertContact(objectId);
  }
}
```

**Route namespacing:** each binding mounts on its own Lambda under the binding key. Full URL is `/api/{integration-name}-integration/{bindingKey}{route.path}` — register *that* URL with the upstream provider. Two modules' extensions never collide because each is namespaced.

> ⚠️ Breaking change: extension routes used to mount un-namespaced (`/api/{x}-integration/webhooks`); they are now under `/{bindingKey}`. Re-point any provider webhook registered against the old path (and for URL-signed schemes like HubSpot v3, the old registration fails verification until updated).

**Handler resolution priority per event:** (1) `binding.handlers[eventName]` → `this[methodName]`; (2) the extension's own default `extension.events[eventName].handler`; (3) otherwise `initialize()` throws. Handlers are **strings**, not function refs, to dodge the `this`-in-static-`Definition` problem. Subclass `this.events[eventName]` set in the constructor takes precedence over extension-declared events.

**`useDatabase`** (does the receiver open a DB connection?): defaults to **`false`** for extension routes — a receiver that only verifies a signature and enqueues shouldn't pay for a DB connection (faster cold start, no Prisma layer). Set `useDatabase: true` at the extension level (or override per binding) only if the receiver itself needs the DB. Resolution: `binding.useDatabase ?? extension.useDatabase ?? false`. DB-dependent work (e.g. resolving `portalId → integrationId`) belongs in the queue **worker**, not the receiver.

**Event-name conflicts:** if two bindings declare the same event name, the framework throws at `initialize()` (no silent winner). Binding the same extension twice only works if it defines disjoint event sets; otherwise an api-module should ship two distinct extensions. Routes do *not* collide across bindings (they're namespaced) — only a single binding declaring two routes with the same `method + path` throws.

## Authoring an extension (api-module side)

An extension bundle is a plain object exported from the api-module:

```javascript
// @friggframework/api-module-hubspot/extensions/webhooks/index.js
module.exports = {
  name: 'hubspot-webhooks',
  useDatabase: false,
  routes: [{ path: '/webhooks', method: 'POST', event: 'HUBSPOT_WEBHOOK_RECEIVED' }],
  events: {
    HUBSPOT_WEBHOOK_RECEIVED: {
      type: 'LIFE_CYCLE_EVENT',
      handler: async function ({ req, res }) {
        await verifyHubSpotSignature(req);
        for (const evt of req.body) {
          const integrationId = await this.commands.findIntegrationByEntityExternalId(evt.portalId, 'hubspot');
          if (!integrationId) continue;
          await this.queueWebhook({ integrationId, body: evt, event: 'HUBSPOT_WEBHOOK' });
        }
        res.status(200).json({ received: req.body.length });
      },
    },
    HUBSPOT_WEBHOOK: { type: 'LIFE_CYCLE_EVENT', handler: async function ({ data }) { /* default no-op; integrations override */ } },
  },
};

// @friggframework/api-module-hubspot/index.js
module.exports = {
  Definition: require('./api-module-definition'),
  extensions: { webhooks: require('./extensions/webhooks'), crmCards: require('./extensions/crm-cards') },
};
```

**Framework contract** (validated at `initialize()`): `extension` is an object with a `name`; `extension.events` is keyed by event name; `extension.routes` is an array; every route's `event` exists in `extension.events`; every route `method` is a known HTTP verb; each event has either a resolvable `binding.handlers[eventName]` or a function `extension.events[eventName].handler`. Failures throw at boot, naming the integration, binding, and field.

## Reverse-lookup helpers (app-level webhooks)

When one URL serves many accounts, default handlers resolve the inbound external ID (HubSpot `portalId`, Slack `team_id`, etc.) to a Frigg integration via `createFriggCommands`:

```javascript
this.commands = createFriggCommands({ integrationClass: MyIntegration });

// Throws on ambiguous resolution — use when one externalId maps to exactly one integration
const integrationId = await this.commands.findIntegrationByEntityExternalId(externalId, 'hubspot');

// Returns an array — use when one externalId may fan out to multiple integrations
const integrationIds = await this.commands.listIntegrationsByEntityExternalId(externalId, 'hubspot');
```

`findIntegrationByEntityExternalId` throws (rather than silently first-matching) if the tuple matches multiple Entity rows or the entity is owned by multiple integrations — a silent match would be a cross-tenant routing risk. Keep the commands platform-neutral; platform-vocabulary wrappers (`findIntegrationByPortalId`, etc.) belong inside the api-module's own extension, not in core.
