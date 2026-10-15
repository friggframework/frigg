/**
 * Shape and legacy-pointer rules shared by the three membership adapters
 * (ADR-056 §3.6). Pure: no I/O.
 *
 * A membership as the application sees it:
 * `{ id, individualUserId, organizationUserId, role, createdAt, implicit }`,
 * every id a string whatever the database stores. `implicit: true` marks the
 * answer synthesised from the legacy `IndividualUser.organizationId` pointer
 * when no membership row exists (see docs/guides/organization-memberships.md).
 */

const isPresent = (value) =>
    value !== undefined && value !== null && value !== '';

const idString = (value) => (isPresent(value) ? String(value) : null);

const sameId = (a, b) => isPresent(a) && isPresent(b) && String(a) === String(b);

function toMembership(row) {
    return {
        id: idString(row.id ?? row._id),
        individualUserId: idString(row.individualUserId),
        organizationUserId: idString(row.organizationUserId),
        role: row.role ?? null,
        createdAt: row.createdAt,
        implicit: false,
    };
}

/**
 * The membership a legacy `organizationId` stands for, or null when the
 * person has no legacy pointer (or it names a different organization than
 * `organizationUserId`, when one is given).
 */
function implicitMembership(individual, organizationUserId) {
    if (!individual || !isPresent(individual.organizationId)) return null;
    if (
        organizationUserId !== undefined &&
        !sameId(individual.organizationId, organizationUserId)
    ) {
        return null;
    }
    return {
        id: null,
        individualUserId: idString(individual.id ?? individual._id),
        organizationUserId: idString(individual.organizationId),
        role: null,
        createdAt: individual.createdAt,
        implicit: true,
    };
}

/** Rows plus the legacy pointer's organization, unless a row already names it. */
function withLegacyMembership(memberships, individual) {
    const legacy = implicitMembership(individual);
    if (
        !legacy ||
        memberships.some((m) =>
            sameId(m.organizationUserId, legacy.organizationUserId)
        )
    ) {
        return memberships;
    }
    return [legacy, ...memberships];
}

module.exports = {
    isPresent,
    idString,
    sameId,
    toMembership,
    implicitMembership,
    withLegacyMembership,
};
