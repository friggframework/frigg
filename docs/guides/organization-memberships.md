# Organization memberships

A person can belong to more than one organization (ADR-056 §3.6). Every request acts in exactly one,
the **active organization**: the `org_id` claim of an adopter token, or `x-frigg-apporgid` on the
shared-secret path.

## What is stored

`OrganizationMembership { individualUserId, organizationUserId, role?, createdAt }`, unique on the
pair, in both Prisma schemas (migration `20261015000000_add_organization_membership` for PostgreSQL).
`role` is the organization role the token carried when the membership was created; the role of the
current request always comes from the current token (`user.getOrgRole()`).

`IndividualUser.organizationId` stays as a **legacy pointer**. It is set when a person is first
linked to an organization and is never changed afterwards, so it can name an organization the request
is not acting in. Do not read it to find the organization a request acts in; use
`user.getActiveOrganizationId()`.

## Backfill: read-time fallback, no data migration

Existing people have only the legacy pointer. Rather than copy it into membership rows, every
adapter reads it as an implicit membership: `findMembership(person, org)` answers (with
`implicit: true`) when the person's `organizationId` is that org and no row exists, and
`listMembershipsForIndividual` appends it unless a row already names it. Reasons:

- Nothing has to be run against a live database, in either PostgreSQL or the Mongo-compatible
  stores, and a rollout cannot leave half-migrated data.
- Code that still writes `organizationId` (an older deploy, an app calling the repository) stays
  correct, which a one-time copy would not.
- A row appears only when something new happens (a login for a second organization), so the table
  holds exactly the memberships added since.

## How a request becomes a member

`EnsureOrganizationMembership` (used by `GetUserFromAdopterJwt` and `GetUserFromXFriggHeaders`):

1. If the person is already a member (row or legacy pointer), write nothing.
2. Otherwise add a membership (an idempotent upsert, so concurrent first logins for different
   organizations both succeed). With `user.strictMembership: true` (alias `strictUserValidation`),
   the `x-frigg` path answers 400 instead.
3. If the person has no `organizationId` yet, set it (their first link). Never overwrite it.

A create that loses a first-login race to a unique constraint re-reads once and uses the winner's
row. Organizations have no unique index on `appOrgId` (MongoDB cannot express one that ignores
individuals), so two simultaneous first logins for a brand-new organization can still create it twice.

## Not done here

Scope ownership and list filtering by active organization, `organizationId` on `Entity` and
`Integration`, `GET /api/v2/me/organizations`, and removing a member are the next work packages
(F5 onward). Deleting a user does not delete its memberships on MongoDB (no referential integrity);
PostgreSQL cascades.
