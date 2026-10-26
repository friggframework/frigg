---
description: Bind an API module's ready-made bundle of routes and events to your integration with Definition.extensions.
---

# Use integration extensions

Why write the same webhook receiver twice? An integration extension is a bundle of routes, events, and queue dispatch that an API module ships once and every integration reuses. You bind it in one block and write only the business logic.

Status: implemented (PR #590 and PR #596). The design record is [ADR-018](../architecture-decisions/018-integration-extensions.md). The full author guide is `packages/core/integrations/EXTENSIONS.md` in the Frigg repo.

## When to use it

| Use `Definition.webhooks: true` | Use `Definition.extensions` |
|---|---|
| Per-account webhooks scoped to one integration record | App-level webhooks fanned out to many records by external id |
| You write the receiver, signature check, and queue dispatch | The API module ships them |
| One endpoint | Several bundles declared together |

## Bind an extension

1. Find the extension your API module exports. The name depends on the module, for example `someModule.extensions.webhooks`.
2. Add a binding under `static Definition.extensions`. The key is your local name and also the URL namespace, so keep it short.
3. Map the extension's event names to method names on your class, as strings.
4. Write those methods.

```javascript
const someModule = require('@friggframework/api-module-example'); // placeholder package

class ExampleIntegration extends IntegrationBase {
    static Definition = {
        name: 'example',
        version: '1.0.0',
        modules: { example: { definition: someModule.Definition } },
        extensions: {
            example: {
                extension: someModule.extensions.webhooks,
                handlers: { EXAMPLE_WEBHOOK: 'onExampleEvent' },
                // useDatabase: true, // optional override
            },
        },
    };

    async onExampleEvent({ data }) {
        // business logic only
    }
}
```

5. Run `frigg start` and read the boot log. Each extension route prints its full path, for example:

   ```
   POST /api/example-integration/example/webhooks  (extension: example-webhooks, useDatabase: false)
   ```

6. Register that URL with the provider.

## Rules the framework enforces

| Topic | Rule |
|---|---|
| Route URL | `/api/{integration name}-integration/{binding key}{route.path}`. Each binding gets its own handler. |
| Handler resolution | 1. `binding.handlers[event]` (method on the instance). 2. The extension's default `handler`. 3. Otherwise `initialize()` throws. |
| Missing method | A `handlers` entry that names a method your class lacks throws at `initialize()`. |
| Event conflicts | Two bindings that declare the same event name throw at `initialize()`. |
| Route conflicts | Throws at boot only when one binding declares the same method and path twice, or a `Definition.routes` entry matches an extension's namespaced path. |
| Subclass override | An event you set in `this.events` in the constructor wins over the extension. Frigg logs a warning naming the shadowed method. |
| `useDatabase` | `binding.useDatabase ?? extension.useDatabase ?? false`. When `false`, the receiver must not touch the database; do lookups in the queue worker. |

{% hint style="warning" %}
Breaking change from earlier pre-releases: extension routes used to mount without the binding key. If you registered a provider webhook against `/api/{x}-integration/webhooks`, point it at the new `/{binding key}` path. Signature schemes that sign the full URL fail until you do.
{% endhint %}

## Related

* [ADR-018: Integration Extensions](../architecture-decisions/018-integration-extensions.md)
