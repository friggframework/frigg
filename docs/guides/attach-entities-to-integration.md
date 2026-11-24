---
description: Add or remove connected accounts on an integration that already exists.
---

# Add or remove entities on an existing integration

Your user just connected a second workspace and wants it in the same integration. No need to tear anything down. Since 2.0.1 (#689) the integration commands can attach and detach entities in place.

## Before you start

* The entities already exist (the user finished authorizing them).
* You have an integration class. These two commands exist only when you pass `integrationClass`.

## Attach entities

1. Build the commands for your integration class.
2. Call `addEntitiesToIntegration` with the integration id and the entity ids.
3. Check the result for an `error` field before you use it.

```javascript
const { createIntegrationCommands } = require('@friggframework/core');

const commands = createIntegrationCommands({ integrationClass: MyIntegration });

const result = await commands.addEntitiesToIntegration({
    integrationId,
    entityIds: [newEntityId],
});
if (result.error) {
    // { error: <HTTP status>, reason: <message>, code: <error code> }
}
```

Every entity must exist, belong to the integration's user, and be of a module the integration already holds. Entities that are already attached are left as they are.

## Detach entities

```javascript
const result = await commands.removeEntitiesFromIntegration({
    integrationId,
    entityIds: [oldEntityId],
});
```

Entities that are not attached are ignored. Detached entities are not deleted. Each module must keep at least one entity.

## Errors

The commands do not throw. They return `{ error, reason, code }`, where `error` is the HTTP status.

| `code` | `error` | When |
|---|---|---|
| `INVALID_INTEGRATION_DATA` | 400 | `integrationId` or `entityIds` is missing, or `entityIds` is not a non-empty array |
| `INTEGRATION_NOT_FOUND` | 404 | No integration with that id |
| `ENTITIES_NOT_FOUND` | 404 | One or more entity ids do not exist (add only) |
| `ENTITY_USER_MISMATCH` | 403 | An entity belongs to another user (add only) |
| `ENTITY_MODULE_MISMATCH` | 400 | An entity's module is not one the integration holds (add only) |
| `LAST_ENTITY_OF_MODULE` | 409 | Removing would leave a module with no entity (remove only) |

Any other failure returns `error: 500`.

## Related

* [Core Concepts](../reference/core-concepts.md)
* [API Reference](../reference/api-reference.md)
