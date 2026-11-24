---
description: Why concurrent 401s on one API module now share one token refresh.
---

# Single-flight token refresh

Picture five requests hitting an expired token at the same moment, and all five sprinting to the token endpoint. Since 2.0.1 (#636) only one of them goes. The rest wait for it.

This page explains what changed and why. The decision record is [ADR-042](../architecture-decisions/042-in-process-single-flight-token-refresh.md) (status: Proposed). Code: `packages/core/modules/requester/requester.js` and `oauth-2.js`.

## The problem

A sync step often sends a chunk of records through one API module instance with `Promise.all`. When the access token has expired, every request in the chunk gets a 401 at once. Before this change, each 401 started its own refresh. That caused two failures:

* **The retry budget ran out.** Each instance may start 3 refreshes (`MAX_AUTH_RETRIES`). The first three 401s spent it. The fourth and fifth found it empty and invalidated the credential, while the first refresh was about to succeed.
* **Refreshes cancelled each other.** With refresh-token rotation, the provider accepts the first refresh and kills the old refresh token. The other refreshes present the dead token and get `invalid_grant`. Some providers revoke the whole grant on that replay, which forces the user to reconnect.

## What happens now

Three rules in the 401 path of `Requester`:

| Rule | What it does |
|---|---|
| Single flight | The first 401 starts the refresh and stores its promise. Every 401 that arrives meanwhile awaits the same promise. Only that first request spends the retry budget. |
| Marked refresh flow | The refresh runs inside an `AsyncLocalStorage` context that names the requester. A 401 inside that flow, on the same requester, means the token endpoint rejected the credential, so Frigg invalidates it instead of waiting on itself forever. A second requester used inside a custom refresh is not affected. |
| Token generation | Each request remembers which token generation it used. A 401 from an older generation retries with the current token and does not start another refresh. |

Before refreshing, the instance first tries to adopt a newer credential that another invocation already stored (`_adoptNewerCredential()`). That check now sits in a wrapper that modules do not override, so a module with a custom `refreshAuth()` still gets it.

## What this means for module authors

* You do not need to change anything for a standard `OAuth2Requester` module.
* The retry budget now counts per refresh cycle, not per request.
* If your module wraps a vendor SDK, override `_adoptNewerCredential()`, call `super`, and copy the adopted tokens into the SDK client.

## Measured effect

From the ADR's test harness: one instance, 5 concurrent 401s, rotation enabled.

| | Before | After |
|---|---|---|
| Refresh calls to the provider | 3 | 1 |
| Self-inflicted `invalid_grant` | 2 | 0 |
| Requests rejected (of 5) | 4 | 0 |

These numbers come from the ADR. We did not re-run the harness.
