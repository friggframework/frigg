const { idString } = require('../membership');

/**
 * A stored membership row as the application sees it: every id a string
 * whatever the database holds. `implicit` is always false here: only the
 * domain (`user/membership.js`) produces an implicit membership.
 */
function toMembership(row) {
    return {
        id: idString(row.id ?? row._id),
        individualUserId: idString(row.individualUserId),
        organizationUserId: idString(row.organizationUserId),
        orgRole: row.orgRole,
        createdAt: row.createdAt,
        implicit: false,
    };
}

module.exports = { toMembership };
