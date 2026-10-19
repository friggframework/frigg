# @friggframework/provider-netlify

Netlify provider plugin for the Frigg Framework: split-per-concern Netlify
Functions (auth, user, health, admin, docs, integration routes, webhooks, the
`worker-background` queue worker and the `scheduled-sync` cron), the
`netlify.toml` generator and deploy helpers.

```js
const { generateNetlifyToml, generateNetlifyEnvTemplate } = require('@friggframework/provider-netlify');
fs.writeFileSync('netlify.toml', generateNetlifyToml(appDefinition));
```

## Queue worker authentication

`worker-background` (and the `/api/queue` redirect to it) is a public URL, and
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

## Environment variables

| Variable | |
|---|---|
| `FRIGG_QUEUE_SIGNING_SECRET` | **Required.** Signs and verifies queue messages to `worker-background`. Generate with `openssl rand -hex 32`; set it in the site environment for all deploy contexts. |
| `FRIGG_QUEUE_ALLOW_UNSIGNED` | Local development only. `true` accepts unsigned queue messages when no secret is set and the environment is not production. Never set it on a deployed site. |
| `QSTASH_TOKEN` | QStash only: publish token. |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | QStash only, **required**: verify `Upstash-Signature`. |
| `DATABASE_URL`, `AES_KEY_ID`, `AES_KEY`, `STAGE`, `FRIGG_API_KEY`, `ADMIN_API_KEY`, … | See `generateNetlifyEnvTemplate(appDefinition)` for the full list for an app. |
