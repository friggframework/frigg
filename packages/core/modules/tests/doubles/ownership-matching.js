/**
 * Test double helper: answers an owner/organization clause the way a database
 * does, so in-memory repositories run the clauses a use case hands them.
 * `clause.organizationId === null` matches a row with no organization (unset
 * or null).
 */
const same = (a, b) =>
    a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

const matchesClause = (row, clause) =>
    same(row.userId, clause.userId) &&
    (clause.organizationId === null
        ? row.organizationId === null || row.organizationId === undefined
        : same(row.organizationId, clause.organizationId));

const matchesAnyClause = (row, clauses) => clauses.some((clause) => matchesClause(row, clause));

module.exports = { same, matchesClause, matchesAnyClause };
