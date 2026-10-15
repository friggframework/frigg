# Core Concepts

Understanding these core concepts will help you get the most out of the Frigg framework:

## Integration

**Extends `@friggframework/integration-base`.**\
An "integration" is how Frigg connects (usually 2) modules for the connection of data and actions. Each service has its own API Module to represent its API to the middleware; use case-specific business logic will also be required.

## API Module

**Composed of an API Class (generally extending a subclass of `@friggframework/requester`) and a Module Definition.**\
The API Class handles the requests to external APIs, i.e. authentication, identification, and data retrieval. The Module Definition lets the @friggframework know how to use this API Class as an API Module, such that tokens and other metadata the connection to an external api, can be stored (and refreshed).

## Entity (authorizing entity)

**A mongoose model extending `@friggframework/module-plugin/entity`:**\
For a given API Module, the entity is a kind of handle, linking to the relevant credentials, and storing metadata about who/what is authorizing. Retrieving these for a given user is an important gateway to accessing an integration, as most integration actions require one or more authorized API Modules. Most generally, an API Module will be instantiated by passing in an Entity.

## Credential

**A mongoose model extending `@friggframework/module-plugin/credential`:**\
For a given API Module, the credential generally stores the tokens or data necessary for making authenticated requests. Multiple Entities can reference the same credential, although 1:1:1 User:Entity:Credential is common.

## Data Handling

Frigg manages data securely and efficiently, ensuring it can scale as needed without compromising performance. The framework includes built-in support for:

- **Encryption**: Automatic KMS integration for field-level encryption
- **Configuration Management**: SSM Parameter Store for secure config and secrets
- **Network Security**: VPC support for network isolation and compliance

## Infrastructure Automation

Frigg provides automatic AWS infrastructure configuration:

- **VPC Configuration**: Automatic VPC setup with AWS Discovery or infrastructure creation
- **Security**: KMS encryption and SSM Parameter Store integration
- **Cost Optimization**: VPC endpoints and intelligent resource discovery
- **Compliance**: Network isolation and encryption for regulated environments

## Customization

Frigg is highly customizable, letting you tailor modules and integrations to fit your specific needs. Infrastructure features can be enabled independently:

```javascript
const appDefinition = {
    integrations: [/* your integrations */],
    vpc: { enable: true },              // Network isolation
    encryption: { fieldLevelEncryptionMethod: 'kms' }, // Data encryption  
    ssm: { enable: true }               // Configuration management
};
```

## Entity registry

An app offers the entity types (API modules) its integrations bind. To let people connect a module that no integration binds, such as an agent's tools, a "Connect HubSpot" step before any sync, or a global service account, register it under `entities`:

```javascript
const appDefinition = {
    entities: {
        google:  { definition: GoogleWorkspaceDefinition, scope: 'individual' },
        hubspot: { definition: HubSpotDefinition },
        twilio:  { definition: TwilioDefinition, scope: 'global' },
    },
    integrations: [HubSpotSyncIntegration],
};
```

- The key is the entity type name and must equal the definition's `moduleName`, and its `getName()` when it has one. Case matters. A mismatch stops the app at load.
- Each value is `{ definition, scope?, proxy?, display? }`. `scope` is `individual`, `organization` or `global`, or `{ default, allow: [...] }`.
- Modules bound by `integrations` are still inferred, so an app without `entities` behaves as before. The offered set is the registry entries plus every bound module, and the same set feeds `/api/authorize`, `/api/v2/entities/types`, the health checks and the workers.
- **Backward compatibility.** With no `entities` key, nothing new can fail: if two integrations bind different definition objects under one `moduleName`, the first is kept and a warning is logged (`frigg.modules.entity_registry.duplicate_definition`). The strict rules below apply once `entities` is present, even as `{}`.
- With `entities` present, the same name must always mean the same definition: the same object, or the same `packageName` and `version`. A registry entry and an integration (or two integrations) that supply different definitions under one name stop the app at load, naming both sources. Two integrations sharing one definition is fine.
- `entities: { $infer: false, ... }` turns inference off. Every module an integration binds must then be registered, and the app lists the ones that are not when it fails to load.
- **Fail fast.** `loadAppDefinition()` builds the registry once, so every error above surfaces when the app definition loads, not on the first request. The loaded definition carries it as `entityTypeRegistry` and `moduleDefinitions`; handlers and workers read those.
- A bound definition with no `moduleName` and no `getName()` is still offered (de-duplicated by identity) while `$infer` is true. With `$infer: false` it cannot be registered, so the app fails to load.
- `GET /api/v2/entities/types` lists each type with `usedBy`, the integrations that bind it (empty for a registry-only type).

In code, `getEntityTypeRegistry(appDefinition)` (`packages/core/modules/entity-type-registry.js`, exported from `@friggframework/core`) returns `name -> { definition, sources, settings }`. `sources` holds `{ kind: 'app' }` and one `{ kind: 'integration', name }` per binding integration. Invalid registries throw `EntityRegistryError` (`code: 'ENTITY_REGISTRY_INVALID'`). `createFriggCommands` takes an optional `moduleDefinitions`; without it the commands hydrate with the integration's own modules only.

Decision record: ADR-059, app-level entity registry.

## Testing

Frigg supports automated testing with tools like Jest to maintain reliability and performance.

## Contribution

Frigg is open-source and thrives on community contributions. Whether you're fixing bugs, writing documentation, or developing new modules, your input is valuable. We encourage users to get involved through our GitHub repository, participate in discussions, and submit pull requests. Every bit of help makes Frigg better for everyone.
