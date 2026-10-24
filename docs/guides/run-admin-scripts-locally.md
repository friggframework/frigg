---
description: Register admin scripts in your app definition and get their queues running on frigg start.
---

# Run admin scripts and reports locally

Admin scripts are your app's maintenance crew: repair a sync, backfill a field, run a report. Since 2.0.1 (#675) the app schema accepts the admin keys, and `frigg start` creates the admin queues in LocalStack for you.

This guide covers local setup only. To write a script, see the `@friggframework/admin-scripts` package README (`packages/admin-scripts/README.md` in the Frigg repo).

## Before you start

* A Frigg app that runs with `frigg start`.
* LocalStack running and reachable. The plugin uses `AWS_ENDPOINT`, default `http://localhost:4566`. `frigg start` does not start LocalStack for you.
* At least one script class that extends `AdminScriptBase` from `@friggframework/admin-scripts`.

## Steps

1. Add your scripts, and optionally reports, to the app definition:

   ```javascript
   const appDefinition = {
       // ...integrations, user, database, etc.
       adminScripts: [MyRepairScript],
       reports: [],
       admin: {
           enableScheduling: false,       // default
           includeBuiltinReports: false,  // default
       },
   };
   ```

2. Set `ADMIN_API_KEY` in your local environment. Every `/admin` route checks it in the `x-frigg-admin-api-key` header. The builder does not generate it.
3. Run `frigg start`.
4. Check the log. For each queue it creates, the plugin prints `Set <ENV_VAR> to <LocalStack URL>`, for example for `ADMIN_SCRIPT_QUEUE_URL`.
5. List your scripts:

   ```bash
   curl http://localhost:3001/admin/scripts \
     -H "x-frigg-admin-api-key: $ADMIN_API_KEY"
   ```

   The port is the `frigg start` default, 3001. The admin router mounts at `/admin` (`admin-script-router.js`). We have not run this request against a fresh app.

## What the keys do

| Key | Type | Default | Effect |
|---|---|---|---|
| `adminScripts` | array of classes | `[]` | Scripts served under `/admin/scripts` |
| `reports` | array of classes | `[]` | Reports served by the admin report runner |
| `admin.enableScheduling` | boolean | `false` | Provisions the EventBridge Scheduler group and role so scripts and reports can run on a schedule |
| `admin.includeBuiltinReports` | boolean | `false` | Serves the built-in reports next to your own |

The admin infrastructure is added only when `adminScripts` or `reports` is non-empty, or `admin.includeBuiltinReports` is `true`.

## What happens offline

The admin builder registers `AdminScriptQueue` and `ReportQueue` under `custom` in the generated serverless config. When it runs offline, the Frigg serverless plugin creates every `custom` key that ends in `Queue` in LocalStack. Deployed, an env var holding `{ Ref: <Queue> }` resolves to the queue URL. Offline it would stay an object, so the plugin swaps in the LocalStack URL, at provider and function scope. That covers `ADMIN_SCRIPT_QUEUE_URL` and `REPORT_QUEUE_URL`.

{% hint style="warning" %}
Unverified: we have not confirmed that async (`mode: 'async'`) executions are picked up by a local worker. Use `mode: 'sync'` locally if a queued execution stays `PENDING`.
{% endhint %}

Without AWS, the scheduler uses an in-memory local adapter, so schedules do not survive a restart.

## Related

* [Architecture](../reference/architecture.md)
