# Contribute an API Module

Got a vendor Frigg does not wrap yet? Ship a connector the rest of the community can `frigg install`. This how-to covers contributing one package to **[api-module-library](https://github.com/friggframework/api-module-library)** on the `next` branch.

Missing something? Open a PR following the template below, or request a module / point a coding agent at the vendor docs and this page. Maintainers review and merge.

For field-level detail on `Definition`, see [API Module Definition](../reference/api-module-definition-and-functions.md).

## Before You Start

- Work against api-module-library **`next`**, under `packages/v1-ready/<name>/`.
- One module per pull request.
- PR title format: `feat(<slug>): add <DisplayName> API module`  
  Example: `feat(clio): add Clio API module`.
- Browse existing packages: [packages/v1-ready/](https://github.com/friggframework/api-module-library/tree/next/packages/v1-ready). Each package has its own README — use those, not the empty stubs under this docs site’s `module-list/`.

### Templates

| Auth style | Copy from |
|------------|-----------|
| API key / form (package layout, files, tests) | [`packages/v1-ready/fathom/`](https://github.com/friggframework/api-module-library/tree/next/packages/v1-ready/fathom) |
| OAuth2 + webhook extension patterns | [`packages/v1-ready/hubspot/`](https://github.com/friggframework/api-module-library/tree/next/packages/v1-ready/hubspot) — use HubSpot for OAuth and `extensions/webhooks` only; still prefer Fathom for the overall file/test layout |

Agent skill (frigg repo, **`next` branch**): [`.claude/skills/frigg-api-modules/SKILL.md`](https://github.com/friggframework/frigg/blob/next/.claude/skills/frigg-api-modules/SKILL.md). Auth CLI details: sibling [`references/auth-testing.md`](https://github.com/friggframework/frigg/blob/next/.claude/skills/frigg-api-modules/references/auth-testing.md). If your docs build publishes from `main` and that path 404s, open the links on the `next` branch of frigg.

## Package Basics

- npm name: `@friggframework/api-module-<name>`
- Depend on `@friggframework/core` at the library’s current `^2.0.0-next.*` range. Read a sibling `package.json` on api-module-library `next` for the exact range in use (Fathom recently used `^2.0.0-next.107`).
- Never commit secrets. Use `.env` locally; commit only `.env.example`.

### Required Files

Mirror Fathom’s layout:

| File | Role |
|------|------|
| `index.js` | Export `{ Api, Definition }` |
| `api.js` | Requester class |
| `definition.js` | Module `Definition` |
| `defaultConfig.json` | Name / default config |
| `<name>.openapi.yaml` | OpenAPI description of the wrapped API |
| `tests/api.test.js` | API unit tests |
| `tests/definition.test.js` | Definition tests |
| `tests/spec-sync.test.js` | Keeps the OpenAPI and client in sync |
| `package.json` | `@friggframework/api-module-<name>`, scripts, core dependency |
| `.env.example` | Documented env vars (no real secrets) |

HubSpot-style OAuth modules may also add `extensions/` (for example `extensions/webhooks`) when you need that pattern.

## Definition Checklist

Always provide:

- `API`, `getName`, `moduleName`
- `requiredAuthMethods`: `getEntityDetails`, `getCredentialDetails`, `apiPropertiesToPersist`, `testAuthRequest`
- `env`

Then by auth type:

| Auth | Also add | Do not require |
|------|----------|----------------|
| **OAuth2** | `getToken`. For `env.redirect_uri`, use the ternary below. | — |
| **API key / form** | `getAuthorizationRequirements` + `setAuthParams` (see Fathom). | `getToken`, unless there is also a token exchange |

`modelName` is fine in examples (Fathom/HubSpot set it) but optional — do not treat it as a hard requirement.

**`redirect_uri` ternary** (teach this; do not copy HubSpot’s always-on template string blindly):

```javascript
redirect_uri: process.env.REDIRECT_URI
    ? `${process.env.REDIRECT_URI}/<module>`
    : undefined,
```

**Do not** put `mappings` on `Definition`. Mapping helpers stay as files if you need them. `extensions.mapping` is out of scope for a minimal first contribution.

**Capabilities (ADR-020)** are emerging and optional — not a contribution gate. Do not block a first PR on a capability manifest or UI spec.

## Steps

1. Fork / clone [api-module-library](https://github.com/friggframework/api-module-library) and branch from `next`.
2. Copy `packages/v1-ready/fathom/` to `packages/v1-ready/<name>/` (or scaffold the same file set).
3. Rename the package to `@friggframework/api-module-<name>`, update `defaultConfig.json`, OpenAPI, and `Definition`.
4. Implement `api.js` against the vendor API; keep OpenAPI and `spec-sync` honest.
5. For OAuth + webhooks, crib patterns from HubSpot’s `definition.js` and `extensions/webhooks` — not its older `redirect_uri` line.
6. Add `.env.example` for every env key you read. Keep secrets out of git.
7. Run the gates below.
8. Open one PR into `next` with title `feat(<slug>): add <DisplayName> API module`.

## Gates You Can Run Today

```bash
cd packages/v1-ready/<name>
npm test          # includes spec-sync
```

Optionally, with real credentials in `.env`:

```bash
frigg auth test .
```

See the skill’s [auth-testing reference](https://github.com/friggframework/frigg/blob/next/.claude/skills/frigg-api-modules/references/auth-testing.md).

Do **not** require unreleased validate/canary gates for a first contribution. On frigg `next`, `frigg validate` checks an **app** definition; standalone module-package schema validation is still in review.

## Related

- [API Module Definition](../reference/api-module-definition-and-functions.md)
- [Library overview](overview.md)
- [v1-ready packages on GitHub](https://github.com/friggframework/api-module-library/tree/next/packages/v1-ready)
