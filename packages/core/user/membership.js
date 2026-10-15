/**
 * Organization membership rules that are not persistence (ADR-056 §3.6). Pure.
 *
 * `IndividualUser.organizationId` is the legacy single-org pointer. It is not
 * copied into membership rows; it is read as an implicit membership here, in
 * the domain, so the repositories stay atomic (a row or nothing). See
 * docs/guides/organization-memberships.md for why this is a read-time
 * fallback rather than a data migration.
 */

/** The role a membership has when nothing says otherwise. */
const DEFAULT_ORG_ROLE = 'MEMBER';

const isPresent = (value) =>
    value !== undefined && value !== null && value !== '';

const idString = (value) => (isPresent(value) ? String(value) : null);

/** Ids compare as strings: stores return numbers or strings. */
const sameId = (a, b) => isPresent(a) && isPresent(b) && String(a) === String(b);

/**
 * The membership the legacy `organizationId` pointer stands for in
 * `organizationUserId`, or null when the person has no pointer or it names a
 * different organization.
 *
 * @param {Object|null} individual The individual user as the repository returns it.
 * @param {string|number} organizationUserId
 * @returns {{id: null, individualUserId: string|null, organizationUserId: string, orgRole: string, createdAt: *, implicit: true}|null}
 */
function implicitMembership(individual, organizationUserId) {
    if (!individual || !sameId(individual.organizationId, organizationUserId)) {
        return null;
    }
    return {
        id: null,
        individualUserId: idString(individual.id),
        organizationUserId: idString(individual.organizationId),
        orgRole: DEFAULT_ORG_ROLE,
        createdAt: individual.createdAt,
        implicit: true,
    };
}

module.exports = {
    DEFAULT_ORG_ROLE,
    isPresent,
    idString,
    sameId,
    implicitMembership,
};
