/**
 * The Prisma `where` fragment for an `organizationId` on MongoDB (ADR-056
 * §3.6), shared by the entity and integration adapters.
 *
 * Prisma on MongoDB: `null` matches only an explicit null and `isSet: false`
 * only a missing field. A row written before the column existed is the common
 * "no organization" case, so `null` here means both.
 */
function organizationWhere(organizationId) {
    if (organizationId === null) {
        return {
            OR: [{ organizationId: null }, { organizationId: { isSet: false } }],
        };
    }
    return { organizationId };
}

module.exports = { organizationWhere };
