# ADR-033: Aurora Serverless v2 scale-to-zero + NAT-free Lambda connectivity

**Status**: Proposed
**Date**: 2026-08-20
**Deciders**: Sean Matthews

## Context

When Frigg provisions its own database (`database.postgres.enable: true`, `ownership: 'stack'`), it creates an Aurora Serverless v2 cluster and attaches the app's Lambdas to a VPC so they can reach it privately. Two costs make this untenable for demos and small production apps that should idle at ~$0:

1. **Aurora never scales to zero.** `aurora-builder.js` sets `ServerlessV2ScalingConfiguration.MinCapacity` from `dbConfig.minCapacity || 0.5` and the validator rejects `minCapacity < 0.5`. So the cluster idles at **0.5 ACU (~$43/mo)** even with zero traffic. AWS added true Aurora Serverless v2 scale-to-zero (`MinCapacity: 0`, with auto-pause after inactivity) in **November 2024**; Frigg has not wired it.

2. **The VPC forces a NAT Gateway.** Aurora must live in a VPC (an AWS constraint — a VPC itself is free). But Frigg attaches the Lambda to that VPC to reach Aurora, and a VPC-attached Lambda loses default internet egress. A Frigg app is an *integration* app: it calls external SaaS APIs (Gong, Fireflies, Salesforce, …). Reaching them from an in-VPC Lambda requires a **NAT Gateway (~$32/mo + data)**, always on.

Together that is **~$75/mo just to idle** a Frigg-owned database — which pushes every cost-sensitive deploy to an external DB (Neon/Atlas) instead of using Frigg's own Aurora support.

There is a well-known topology that removes both costs: put Aurora in **public** subnets with a public endpoint, keep the **Lambda outside the VPC** (so it retains normal internet egress and needs no NAT), and let the Lambda connect to Aurora over its public endpoint with TLS and a security-group allowlist. Frigg already has a `database.postgres.publiclyAccessible` flag, but it still force-attaches the Lambda to the VPC and points the Aurora ingress rule at the Lambda's VPC security group — so the NAT cost remains and the public endpoint is unreachable from the (now VPC-less) intent. This ADR closes that gap.

## Decision

Introduce two independent, opt-in capabilities on `database.postgres`. Each is off by default; existing app definitions are byte-for-byte unaffected.

### 1. Scale-to-zero (`minCapacity: 0`)

- The validator accepts `minCapacity` of **`0`** (scale-to-zero) **or** a value in **`[0.5, 128]`**. Values in `(0, 0.5)` remain invalid.
- The scaling config reads `MinCapacity: dbConfig.minCapacity ?? 0.5` (nullish coalescing — the current `|| 0.5` silently turns a requested `0` back into `0.5`, the bug this fixes).
- When `minCapacity === 0`, emit `ServerlessV2ScalingConfiguration.SecondsUntilAutoPause` from a new optional `dbConfig.secondsUntilAutoPause` (default **300**, AWS-valid range **300–86400**). Below that idle window the cluster pauses to 0 ACU.
- Scale-to-zero requires a supported engine version (Aurora PostgreSQL 13.15+/14.12+/15.7+/16.3+). Frigg's default `engineVersion` (15.13) qualifies; document the constraint and warn if a user pins an older version with `minCapacity: 0`.

### 2. Connectivity mode (`connectivity: 'vpc' | 'public'`)

A new `database.postgres.connectivity` selector (default **`'vpc'`** = today's behavior):

- **`'vpc'`** (default, unchanged): Aurora in private subnets, Lambda attached to the VPC, ingress from the Lambda security group. Requires a NAT (or VPC endpoints) for the Lambda's external egress.
- **`'public'`** (NAT-free): 
  - Aurora is placed in **public** subnets with `PubliclyAccessible: true` (implies the existing `publiclyAccessible` behavior).
  - The app's **Lambdas are NOT attached to the VPC** — the composer does not set `provider.vpc`, so they keep default internet egress. **No NAT Gateway and no VPC endpoints are provisioned.**
  - The Aurora ingress rule opens **5432 to `database.postgres.allowedCidrs`** (a new option; default **`['0.0.0.0/0']`**) via `CidrIp`, instead of `SourceSecurityGroupId` pointing at the Lambda SG (which no longer exists on the Lambda side). A VPC-less Lambda has dynamic egress IPs, so a demo typically needs `0.0.0.0/0`; production should narrow it.
  - **TLS is required.** The generated `DATABASE_URL` / connection params must carry `sslmode=require` (or stricter). Public Postgres without TLS is not an allowed configuration.

The two combine: `connectivity: 'public'` + `minCapacity: 0` yields a **Frigg-owned Aurora that idles at $0 with no NAT** — the goal.

## Security posture

`connectivity: 'public'` exposes the database endpoint to the internet. This is an explicit, opt-in trade and the builder must make it loud:

- Emit a validation **warning** whenever `connectivity: 'public'` is set, and a stronger one when `allowedCidrs` includes `0.0.0.0/0`.
- Require TLS (above). Credentials stay in Secrets Manager with rotation, never in the definition.
- Recommend narrowing `allowedCidrs` to known egress ranges where the deployment can (e.g. a fixed NAT/proxy, office IPs, or a CI runner range). Document that a VPC-less Lambda cannot be pinned to a stable IP without extra infra, which is why the demo default is open.
- The default stays `'vpc'`: nobody gets a public database unless they ask for one.

## Consequences

- **Cold-resume latency.** After auto-pause, the first query pays a resume penalty (~seconds to low tens of seconds). Acceptable for demos and low-traffic apps; document it so it is not mistaken for a hang.
- **No behavior change by default.** `'vpc'` connectivity and `minCapacity` defaulting to 0.5 mean every existing definition composes an identical template. New behavior is strictly additive and opt-in.
- **Two supported "$0 idle" paths, clearly separated.** External serverless DB (Neon/Atlas via `DATABASE_URL`) remains the zero-framework path and is cheapest for tiny apps (Atlas M0 is free even while active). This ADR makes *Frigg-owned* Aurora a viable $0-idle option for teams that want Frigg to own the whole stack.

## Scope of the implementing change

- `packages/devtools/infrastructure/domains/database/aurora-builder.js` — validator, scaling config (`?? 0.5`, `SecondsUntilAutoPause`), public-mode subnet/PubliclyAccessible selection, and SG ingress via `CidrIp`.
- `packages/devtools/infrastructure/domains/networking/vpc-builder.js` + `infrastructure-composer.js` — in `public` connectivity, provision the public subnets/subnet-group Aurora needs but **do not** emit the Lambda `vpcConfig` and **do not** create a NAT Gateway.
- `packages/devtools/infrastructure/domains/shared/types/app-definition.js` — document `minCapacity: 0`, `secondsUntilAutoPause`, `connectivity`, `allowedCidrs`.
- Tests asserting the generated template: `MinCapacity: 0` + `SecondsUntilAutoPause` present; public mode → no `provider.vpc`/function VPC config, no `AWS::EC2::NatGateway` resource, Aurora ingress `CidrIp`, `PubliclyAccessible: true` in public subnets; and default (`vpc`, no `minCapacity`) composes unchanged.

**Note:** end-to-end AWS deployment validation is out of scope for the implementing PR's automated tests (it requires a live account); the PR validates template *shape* via unit tests and documents the manual deploy check.
