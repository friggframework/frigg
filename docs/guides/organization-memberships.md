# Organization memberships

A person can belong to more than one organization (ADR-056 §3.6). Every request acts in exactly one,
the **active organization**: the `org_id` claim of an adopter token, or `x-frigg-apporgid` on the
shared-secret path.

## What is stored

`OrganizationMembership { individualUserId, organizationUserId, orgRole, createdAt }`, unique on the
pair, in both Prisma schemas (migration `20261015000000_add_organization_membership` for PostgreSQL).
`orgRole` defaults to `MEMBER` and is the organization role the token carried when the membership was
created; the role of the current request always comes from the current token (`user.getOrgRole()`). That request role
decides who may manage organization-level entities and integrations: see "Organization roles" in `entity-scopes.md`.

`IndividualUser.organizationId` stays as a **legacy pointer**. It is set when a person is first
linked to an organization (the database repeats "only while it is still null" in the update, so two
concurrent first logins cannot overwrite each other) and is never changed afterwards, so it can name
an organization the request is not acting in. Do not read it to find the organization a request acts
in; use `user.getActiveOrganizationId()`.

If the organization the pointer names is deleted, the pointer dangles: the person is still read as a
member of that id, which resolves to no organization, and no code follows it. It is harmless; clear it
with `updateIndividualUser` if you need it gone.

## Backfill: read-time fallback, in the domain

Existing people have only the legacy pointer. Rather than copy it into membership rows (the ADR's
migration-writes-rows), the pointer is read as an implicit membership: `implicitMembership(person,
orgId)` in `packages/core/user/membership.js` answers `MEMBER` / `implicit: true` when the person's
`organizationId` is that org. The repositories are atomic (a stored row or nothing) and know nothing
of it; `EnsureOrganizationMembership` does
`(await repository.findMembership(...)) ?? implicitMembership(person, org)` with the person it already
holds. Reasons:

- Nothing has to be run against a live database, in either PostgreSQL or the Mongo-compatible
  stores, and a rollout cannot leave half-migrated data.
- Code that still writes `organizationId` (an older deploy, an app calling the repository) stays
  correct, which a one-time copy would not.
- A row appears only when something new happens (a login for a second organization), so the table
  holds exactly the memberships added since.

## How a request becomes a member

`EnsureOrganizationMembership` (injected into `GetUserFromAdopterJwt` and `GetUserFromXFriggHeaders`
by `buildUserAuthentication`):

1. If the person is already a member (row or legacy pointer), write nothing.
2. Otherwise add a membership (an idempotent upsert, so concurrent first logins for different
   organizations both succeed).
3. If the person has no `organizationId` yet, set it (their first link). Never overwrite it.

A create that loses a first-login race to a unique constraint (`database/unique-violation.js`:
Prisma `P2002`, or duplicate-key `11000`) re-reads once and uses the winner's row. This covers
individuals. Organizations have no unique index on `appOrgId` (MongoDB cannot express one that ignores
individuals), so there is no violation to recover from, and two simultaneous first logins for a
brand-new organization can still create it twice.

### Strict mode

`user.strictMembership: true` applies to `x-frigg` headers. The headers cannot make anyone a member of
an organization that **already existed**: a person who is not already a member (a row or the legacy
pointer) is refused with 400, a brand-new `appUserId` included. The one thing still allowed is naming
an organization this very request creates, so a first login can bootstrap its own organization. An app
that runs strict adds people to existing organizations itself, through the membership repository.
(The adopter-token path is unaffected: a verified token is the proof of membership.)

`strictUserValidation` is a **deprecated alias** and its meaning changed. It used to reject a
mismatched individual/organization pair; it now means `strictMembership`. A warning is logged once at
startup when it is set without `strictMembership`.

## Listing the people in an organization

`createUserCommands().findIndividualUsersByOrganizationId` unions the stored memberships with the
people the legacy pointer places in the organization (`FindIndividualUsersByOrganization`), each
once, so a person in two organizations is listed in both. The repositories stay atomic; the use case
composes them.

## What is not done here

- **Scoping of ownership by the active organization is done** (see [Entity scopes](./entity-scopes.md)):
  entities and integrations carry `organizationId` and lists follow the active organization.
  `GET /api/v2/me/organizations` and removing a member (which orphans that membership's integrations)
  are the next work packages.
- Deleting a user does not delete its memberships on MongoDB (no referential integrity); PostgreSQL
  cascades.
