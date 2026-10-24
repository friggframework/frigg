# @friggframework/provider-netlify

Netlify provider plugin for the Frigg Framework: split-per-concern Netlify
Functions (auth, user, health, integration routes, webhooks, the
`worker-background` queue worker and the `scheduled-sync` cron), the
`netlify.toml` generator and deploy helpers.

```js
const { generateNetlifyToml, generateNetlifyEnvTemplate } = require('@friggframework/provider-netlify');
fs.writeFileSync('netlify.toml', generateNetlifyToml(appDefinition));
```

## Routes

`generateNetlifyToml()` takes its redirects from core's route registry
(`@friggframework/core/management-api/route-registry`, `getGatewayRoutes`), the
same source devtools builds the AWS API Gateway routes from:

| Path | Function |
|---|---|
| Management API v1 (`/api/integrations`, …) and v2 (`/api/v2/…`) | `auth` |
| `/api/meta`, `/api/meta/openapi/v{n}.json`, and `/api/docs` (302 to the v2 document) | `health` |
| Core extension admin routes, `/admin/<name>` and below (e.g. db-credentials' `/admin/oauth-credentials`), behind the admin API key | `auth` |
| `/admin/queue` (signed queue deliveries, the QStash destination) | `worker-background` |

A core extension's (`appDefinition.coreExtensions[]`) `routes.path` must be `/admin/<segment>…`; `/admin/scripts`,
`/admin/db-migrate` and `/admin/queue` are reserved. Admin routes are never served
under `/api`.

## Ongoing sync ticks (`scheduled-sync`)

Every tick, `scheduled-sync` dispatches `ONGOING_SYNC` to `worker-background` for
each integration that implements `startOngoingSync`, as its
`Definition.schedule.scope` says (core `DispatchOngoingSyncs`):

```js
static Definition = {
    name: 'crm',
    schedule: {
        // 'class' (default): one message per integration class, data: {}.
        // 'installation': one per ENABLED integration record, data: { integrationId },
        //   so the worker hydrates that installation.
        scope: 'installation',
        // Optional ('installation' only): return true to dispatch this tick.
        isDue: (integration, { now }) => true,
    },
};
```

A mistyped scope stops the app at load (`ScheduleConfigError`). Without `isDue`
every installation is dispatched on every tick.

## Queue worker authentication

`worker-background` (and the `/admin/queue` redirect to it) is a public URL, and
Netlify does not authenticate the caller of a Background Function. The worker
therefore runs a message only when it can prove Frigg sent it:

- **Frigg-signed messages** (the default `netlify-background` queue,
  `scheduled-sync`, the Netlify scheduler adapter):
  `NetlifyBackgroundProvider.send()` adds
  - `x-frigg-queue-timestamp`: seconds since the epoch
  - `x-frigg-queue-signature`: `v1=` + hex HMAC-SHA256 of
    `` `${timestamp}.${rawBody}` `` with `FRIGG_QUEUE_SIGNING_SECRET`

  The worker recomputes it over the raw body, compares in constant time and
  refuses a timestamp more than 5 minutes from its clock.
- **QStash deliveries** (`queue.provider: 'qstash'`): the `Upstash-Signature`
  JWT is verified with `QSTASH_CURRENT_SIGNING_KEY`, then
  `QSTASH_NEXT_SIGNING_KEY` (HS256, issuer `Upstash`; `exp`, `nbf`, `sub` and
  `body` required and checked: inside its `nbf`/`exp` window, `sub` equal to the
  URL the request arrived on (Netlify's `rawUrl`), `body` = base64url SHA-256
  of the raw body). A delivery published to another URL is refused, so the
  QStash destination must be the worker's public URL exactly. Frigg-signed messages are still
  accepted, because `scheduled-sync` always posts through the Netlify provider.

An unverified message is not parsed, connects no database and dispatches
nothing. The worker answers it 401 internally (the caller still sees Netlify's
202) and logs one WARN with `eventName: 'frigg.netlify.queue.rejected'` and the
`reasons`.

**Fail closed.** With no secret (or, for QStash, no signing keys) every message
is refused and `send()` throws. The only exception is local development:
`FRIGG_QUEUE_ALLOW_UNSIGNED=true` accepts unsigned messages when the
environment is not production (`STAGE` is `dev`/`test`/`local`, `NODE_ENV` is
`development`/`test`, or `NETLIFY_DEV=true`). An unset `STAGE` and `NODE_ENV`
count as production, and so does any deployed function whatever `STAGE` says.

## Runtime detection

Core decides "deployed or local" with `isDeployedRuntime()`
(`@friggframework/core/providers/runtime-detection`): AWS Lambda's variables, or
the active provider's `detect()`. A Netlify Function sets none of the AWS
variables, and Netlify documents `NETLIFY`, `SITE_ID`, `CONTEXT` and the deploy
URLs as build-time variables, so the generated function entry points declare the
platform themselves: their preamble sets `FRIGG_PROVIDER=netlify` (unless already
set), and this package's `detect()` returns true for it (or for `NETLIFY`).
`netlify dev` (`NETLIFY_DEV=true`), serverless-offline and Jest count as local
runs.

**A hand-written function entry point must set it too.** Only the generated
entry points set `FRIGG_PROVIDER=netlify`. A function you write yourself that
loads Frigg without that preamble, and without `NETLIFY` in its runtime
environment, is treated as local: unsigned queue messages are accepted when
`FRIGG_QUEUE_ALLOW_UNSIGNED=true` and `STAGE` is `dev`, and field-level
encryption is skipped on a `dev`/`test`/`local` stage. Set
`process.env.FRIGG_PROVIDER ??= 'netlify'` before requiring Frigg, or set
`FRIGG_PROVIDER=netlify` in the site's environment variables, which covers
every function at once.

A deployed function therefore follows core's fail-closed field-level encryption
rule: with no `KMS_KEY_ARN` or `AES_KEY_ID` + `AES_KEY` it refuses to start,
whatever `STAGE` says. `encryption: { fieldLevelEncryptionMethod: 'none' }` in the
app definition is the explicit plaintext opt-out: the preamble turns it into
`FRIGG_ENCRYPTION_DISABLED=true` (unless the site sets that variable), as the AWS
environment builder does.

## Environment variables

| Variable | |
|---|---|
| `FRIGG_QUEUE_SIGNING_SECRET` | **Required.** Signs and verifies queue messages to `worker-background`. Generate with `openssl rand -hex 32`; set it in the site environment for all deploy contexts. |
| `FRIGG_QUEUE_ALLOW_UNSIGNED` | Local development only. `true` accepts unsigned queue messages when no secret is set and the environment is not production. Never set it on a deployed site. |
| `QSTASH_TOKEN` | QStash only: publish token. |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | QStash only, **required**: verify `Upstash-Signature`. |
| `DATABASE_URL`, `AES_KEY_ID`, `AES_KEY`, `STAGE`, `FRIGG_API_KEY`, `ADMIN_API_KEY`, … | See `generateNetlifyEnvTemplate(appDefinition)` for the full list for an app. |
