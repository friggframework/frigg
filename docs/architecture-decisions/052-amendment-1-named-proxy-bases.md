# ADR-052 Amendment 1: Named proxy base URLs

**Status**: Accepted
**Date**: 2026-10-18
**Amends**: ADR-052, Entity Proxy Security (§4 target, §5 allow-list)

**Problem.** §4 joins the caller's path onto ONE module-declared base URL. Google's
APIs are served from several hosts (`www.googleapis.com`, `docs.googleapis.com`,
`sheets.googleapis.com`, `analyticsdata.googleapis.com`, `googleads.googleapis.com`),
so one Google entity could reach none of Docs, Sheets, GA Data or Ads.

**Decision.** A module may declare `proxy.baseUrls: { [name]: url }`.

- `proxy.baseUrl` is unchanged and means `{ default: baseUrl }`. Declaring both is a
  load error.
- Names match `^[a-z][a-z0-9-]*$`. Each URL is an absolute `https` URL with no
  credentials, query or fragment. Strings only: a function could return nothing and fall back to the requester's host, which would send the module's token to a host the module never named. Checked at load; a bad one stops the app. A declared base never falls back to the requester; only a module that declares nothing keeps that fallback for `default`.
- The proxy request gains an optional `base`, **a name, never a URL or host**. Omitted
  means `default`. A value that is not shaped like a name (`https://evil.example`,
  `evil.example`, `../x`, `default/../x`) is `400 INVALID_PROXY_REQUEST`; a well-formed
  name the module does not declare is `400 PROXY_UNKNOWN_BASE`, whose message lists
  the module's names. The §4 property holds: the host comes only from the module, so
  the SSRF class stays removed. A module with `baseUrls` and no `default` has no base
  to send an omitted `base` to; that is `PROXY_UNKNOWN_BASE` too.
- Allow-list rules (§5), both the module's `proxy.allow` and the app's
  `managementApi.proxy.modules.<module>.allow`, gain an optional `base` (default
  `default`). A rule matches only its own base, so a path allowed on `default` is
  refused on `docs`. A rule naming a base the module does not declare, or a rule
  with no `base` on a module that has no `default`, is a load error naming the
  module, base and rule: it could never match, and an allow rule that silently
  does nothing reads as permission.
- A redirect is followed only if the same base's rules allow its target (§8 already
  limits it to the base's origin and path).
- `PROXY_NOT_ALLOWED` carries `details.base`, and its message names the base when the module declares more than one (single-base messages are unchanged); the audit record carries `base`, including for `PROXY_UNKNOWN_BASE` denials.

**Consequences.** One entity (one credential) can reach every host its provider
needs, each with its own allow-list. Existing modules are unaffected: `baseUrl`
behaves as before and `base` may be omitted or `"default"`.
