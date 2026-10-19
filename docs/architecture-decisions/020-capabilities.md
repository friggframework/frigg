# ADR-020: Capabilities

**Status**: Proposed
**Date**: 2026-06-09
**Deciders**: Sean Matthews

## Context

A Frigg `static Definition` block today carries mechanical metadata (`name`, `version`, `modules`, `routes`, `webhooks`). It does not carry a structured statement of what the piece of Frigg can do. Answering "what does this app, integration, or API module do?" today requires reading the class methods, event registrations, route handlers, and constructor wiring.

Two consumers want a structured answer instead:

1. An agent working on the codebase. Adding a new workflow requires knowing what already exists. The current answer is "read all the source," which is expensive and produces the kind of mistakes that surface in PR review (e.g. declaring four routes for something that should have been one route plus two config options plus one user action).
2. Humans wanting visibility into an app's surface. Dashboards, docs, change-impact analysis, and UI auto-rendering all want a structured answer to "what does this thing expose." Today they reverse-engineer it from code.

This ADR introduces **Capabilities** as a structured surface that serves both.

## Decision

A **Capability** is a typed declaration on a Frigg `Definition` that names a piece of behavior and points at the spec describing it and the code implementing it. The capability is metadata about the code, not the code.

Capabilities exist at three Frigg levels and compose from the level below:

| Level | Lives on | Answers |
|---|---|---|
| **API Module Capabilities** | `apiModule.Definition.capabilities` | What can this provider's API do that has been wired up? (list contacts, watch deal changes, send a message) |
| **Integration Capabilities** | `IntegrationBase.Definition.capabilities` | What workflow does this integration expose? (sync contacts bidirectionally, route inbound webhooks to a destination, surface a dashboard) |
| **Application Capabilities** | `appDefinition.capabilities` | What does the whole app expose? (a top-level view computed from the integrations it loads and any app-level extensions) |

Each capability declares:

- A **name**: stable identifier (`crm.contact.sync`, `notifications.slack.send`)
- A **surface**: the kind of capability (sync, action, webhook, ui, lifecycle, ai-inference, mcp-tool, config, cron)
- A pointer to its **spec**: OpenAPI, AsyncAPI, Arazzo, Fenestra, or a free-form schema reference
- A pointer to its **implementation**: code location, or a reference to a Tier 3 extension, template, or artifact
- Optional **dependencies**: other capabilities (typically lower-level) it composes from

## Two consumers

### Agentic consumption

An agent queries the capability graph instead of reading source. For a task like "add bidirectional contact sync between HubSpot and the adopter's CRM," the resolver returns:

- HubSpot module has capability `crm.contact.list` (spec: `hubspot-openapi#/contacts.list`)
- HubSpot module has capability `crm.contact.watch` (spec: `hubspot-asyncapi#/contact.changed`)
- No adopter-side module exists; the agent scaffolds one using [INTEGRATION-TEMPLATES](./023-integration-templates.md)
- Integration capability `crm.contact.sync.bidir` composes from both modules' capabilities

The [Agent Harness](./025-agent-harness.md) wires this query into session start. The [Ontology](./021-ontology.md) provides the convention layer for interpreting the graph.

### Visibility consumption

The capability graph renders for humans without anyone reading source:

- `GET /api/capabilities` on a deployed Frigg app returns the composed graph (api modules → integrations → app)
- The management UI renders the graph with drill-down to spec and implementation pointers
- Docs generators produce API, integration, and app reference pages from capabilities
- Change-impact analysis flags downstream consumers when a low-level capability changes shape

## Composition across levels

```mermaid
flowchart BT
    subgraph AM["API Module level"]
        AM1["crm.contact.list<br/><i>HubSpot</i>"]
        AM2["crm.contact.watch<br/><i>HubSpot</i>"]
        AM3["crm.contact.upsert<br/><i>Adopter CRM</i>"]
    end
    subgraph IN["Integration level"]
        IN1["crm.contact.sync.bidir<br/><i>composes AM1 + AM2 + AM3</i>"]
        IN2["notifications.deal.won<br/><i>composes Slack send + HubSpot deal.changed</i>"]
    end
    subgraph AP["Application level"]
        AP1["app: full HubSpot ⇄ Adopter sync<br/><i>composes IN1 + IN2</i>"]
    end
    AM1 --> IN1
    AM2 --> IN1
    AM3 --> IN1
    IN1 --> AP1
    IN2 --> AP1
```

A capability at one level points down to the lower-level capabilities it composes from. The graph is acyclic and queryable bottom-up ("what uses this API module capability?") and top-down ("what does this app expose?").

## Shape (worked example)

API module level:

```javascript
// @friggframework/api-module-hubspot/definition.js
module.exports = {
    name: 'hubspot',
    capabilities: {
        'crm.contact.list': {
            surface: 'data-read',
            spec: { kind: 'openapi', ref: './specs/hubspot-openapi.yaml#/paths/~1crm~1v3~1objects~1contacts/get' },
            implementedBy: { kind: 'api-class-method', ref: 'HubSpotApi.listContacts' },
        },
        'crm.contact.watch': {
            surface: 'webhook-source',
            spec: { kind: 'asyncapi', ref: './specs/hubspot-asyncapi.yaml#/channels/contact.changed' },
            implementedBy: { kind: 'extension', ref: 'extensions.webhooks', extensionEvent: 'CONTACT_CHANGED' },
        },
    },
};
```

Integration level:

```javascript
// in MyIntegration's Definition
capabilities: {
    'crm.contact.sync.bidir': {
        surface: 'sync',
        spec: { kind: 'arazzo', ref: './specs/bidir-sync.arazzo.yaml' },
        implementedBy: { kind: 'template', ref: '@friggframework/integration-templates/sync-bidir' },
        dependsOn: [
            { module: 'hubspot', capability: 'crm.contact.list' },
            { module: 'hubspot', capability: 'crm.contact.watch' },
            { module: 'adopter', capability: 'crm.contact.upsert' },
        ],
    },
},
```

App level capabilities are usually computed (the union of declared integration capabilities) rather than declared explicitly. An app can override or annotate, but the default is the union of what its integrations expose.

## Cross-references

- [PLUGINS](./016-plugins.md): plugins are not capabilities (they swap infrastructure), but capabilities can declare `requires` against plugin types (e.g. a capability that needs an AWS deployment)
- [EXTENSIONS-TAXONOMY](./015-extensions-taxonomy.md), [CORE-EXTENSIONS](./017-core-extensions.md), [INTEGRATION-EXTENSIONS](./018-integration-extensions.md), [API-MODULE-EXTENSIONS](./019-api-module-extensions.md): extensions are referenced by `implementedBy`
- [INTEGRATION-TEMPLATES](./023-integration-templates.md): templates are referenced by `implementedBy` and typically declare the capability set the template promises
- [ARTIFACTS](./022-artifacts.md): artifacts are referenced by `implementedBy` when a capability requires outside-Frigg code (HubSpot Project, Slack manifest)
- [ONTOLOGY](./021-ontology.md): the ontology contains capability naming and surface-kind conventions
- [AGENT-HARNESS](./025-agent-harness.md): the harness compiles and injects the capability graph at session start

## Amendment (ADR-063)

[ADR-063](./063-integration-definitions-as-data.md) (Proposed) adds integrations that are published as data and checks them against a per-module **capability manifest**. If it is accepted, this ADR is amended as follows. It records how the two meet, and does not change the three levels or the surfaces above.

- **The manifest is the serialised form of a module's `Definition.capabilities`.** The manifest's `capabilities` map (read and write verbs, each naming a method on the module's `Api`) is the module level of this ADR, written as a JSON file a validator and the runtime can read without loading the module. It is not a second source of truth: it should be generated from `Definition.capabilities`, or at minimum checked against the module's `Api` and its `Definition.capabilities` in the module's own tests, so the two cannot drift.
- **Key convention.** Manifest keys are `<object>.<verb>` (`contact.list`). Names in this ADR are `<domain>.<object>.<verb>` (`crm.contact.list`), and Open question 1 leaves namespacing open. For now the domain is implied by the module: a CRM module's `contact.list` is `crm.contact.list`. The target is the full `crm.contact.list` form once a module declares its domain, so a manifest key and a capability name map to each other without a lookup beyond the module's domain.
- **Webhook events are webhook-source capabilities.** A manifest `events` entry (a topic the module can deliver) is a capability with surface `webhook-source`, like `crm.contact.watch` above. How a delivery is verified, answered and split into events comes from the webhook-source's extension, which for a one-file integration is [ADR-054](./054-one-file-integrations.md) extension contract 2 (`verify`, `handshake`, `receive`, `emits`, `normalize`), not from a second description in the manifest.
- **The endpoint is versioned.** `GET /api/capabilities` becomes `GET /api/v2/capabilities`, since [ADR-053](./053-management-api-versioning.md) puts every new Management API resource under `/api/v2/`.
- **Naming clash with `/api/meta`.** ADR-053 §4's `GET /api/meta` already returns a `capabilities` array. Its entries are server feature flags (`multiStepAuthorize`, `entityProxy`, `credentials`), not this ADR's graph. Two things called "capabilities" with different meanings on one API will confuse clients and docs. Not decided here: the choice is between renaming the meta field (for example to `features`) and giving the graph its own name. It should be settled before either ships.

## Open questions

1. **Capability namespacing.** `crm.contact.sync.bidir` vs `crm/contact/sync.bidir` vs `crm:contact:sync:bidir`. Lean dot-notation for filesystem-safety and grep-ability.
2. **App-level capability computation.** Always computed from integrations, or sometimes explicitly declared (e.g. for app-level capabilities that don't belong to a single integration, like global webhooks or dashboards)?
3. **Surface enum scope.** Initial set: `sync, data-read, data-write, action, webhook-source, webhook-sink, ui, lifecycle, ai-inference, mcp-tool, config, cron`. Open to additions; closed to free-form strings so the rendering UI can be exhaustive.
4. **Spec-kind enum scope.** Initial set: `openapi, asyncapi, arazzo, fenestra, json-schema, free-form`. Same closed-set treatment.
5. **Versioning.** Do capabilities carry their own version, or inherit from their parent Definition's version?

## References

- Mike Amundsen's writing on the API resource graph as the unit of agent reasoning
- The OpenAPI, AsyncAPI, and Arazzo specs that capabilities point at
- ShadCN's component-ownership philosophy, applied at the capability level
