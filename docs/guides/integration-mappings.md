---
description: Claim an event exactly once with createMapping, and page through mappings with queryMappings.
---

# Store and query integration mappings

Mappings are the sticky notes of an integration: a `sourceId` on one side, any JSON you like on the other. Since 2.0.1 you can also use them as a lock and search them without loading every row.

This is a how-to guide. For every parameter and limit, see [Integration mapping API](../reference/integration-mapping-api.md).

## Before you start

* You have an integration class that extends `IntegrationBase` (from `@friggframework/core`).
* Your code runs inside an integration instance, so `this.id` is set.

## Claim an event so only one worker handles it

`getMapping` followed by `upsertMapping` is not atomic. Two workers can both read "nothing there" and both carry on. `createMapping` is insert-only. The second caller gets `MappingAlreadyExistsError`.

1. Pick a claim key that is unique per event, for example `claim:<event id>`.
2. Call `createMapping`. Catch `MappingAlreadyExistsError` and treat it as a duplicate.
3. If your processing fails, call `deleteMapping` to release the claim so a retry can take it.

```javascript
const { MappingAlreadyExistsError } = require('@friggframework/core');

async onWebhook({ data }) {
    const claimId = `claim:${data.body.id}`;
    try {
        await this.createMapping(claimId, { claimedAt: new Date() });
    } catch (error) {
        if (error instanceof MappingAlreadyExistsError) {
            return { processed: false, duplicate: true };
        }
        throw error;
    }

    try {
        await this.processEvent(data.body);
    } catch (error) {
        await this.deleteMapping(claimId);
        throw error;
    }
}
```

`deleteMapping` on a key that does not exist is not an error. Both methods throw `sourceId must be set` if you pass an empty `sourceId`.

## Find mappings by what is inside them

`queryMappings` returns one filtered, ordered page plus the total match count. It lives on the mapping repository. `IntegrationBase` has no wrapper for it yet, so call the repository that every integration instance holds:

```javascript
const { mappings, total } =
    await this.integrationMappingRepository.queryMappings(this.id, {
        where: [
            { path: 'mapping.outbound.status', op: 'in', value: ['failed', 'pending'] },
            { path: 'sourceId', op: 'notStartsWith', value: 'claim:' },
        ],
        orderBy: { path: 'mapping.updatedAt', direction: 'desc' },
        take: 100,
        skip: 0,
    });
```

Sane defaults: `where` is `[]` (all rows), `skip` is `0`, and rows come back by id ascending when you leave out `orderBy`. `take` is required, from 1 to 500.

To walk every match, add `take` to `skip` until `skip >= total`.

## Turn off encryption for the mapping field first

`queryMappings` filters inside the `mapping` JSON, so it refuses to run while field-level encryption still encrypts `IntegrationMapping.mapping` on write. Opt the field out in your app definition:

```javascript
encryption: {
    disable: { IntegrationMapping: ['mapping'] },
}
```

Also list any nested `mapping.…` path that your custom `encryption.schema` encrypts.

The opt-out applies to writes only. Rows written encrypted before it stay readable, but `queryMappings` does not match them until they are written again.

## Related

* [Integration mapping API](../reference/integration-mapping-api.md)
* [Encryption and Security](../reference/encryption-and-security.md)
