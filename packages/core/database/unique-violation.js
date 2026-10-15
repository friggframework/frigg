/** Mongo/DocumentDB duplicate-key error code. */
const DUPLICATE_KEY_CODE = 11000;
/** Prisma's unique-constraint error code (PostgreSQL and MongoDB). */
const PRISMA_UNIQUE_CODE = 'P2002';

/**
 * Whether `error` is a unique-constraint violation, however the database
 * layer raised it: a Prisma `P2002`, or a duplicate-key `11000`
 * (`documentdb-utils` `insertOne` sets `code` on the error it throws).
 * Matches on the code only, never on message text.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isUniqueViolation(error) {
    return (
        error?.code === PRISMA_UNIQUE_CODE || error?.code === DUPLICATE_KEY_CODE
    );
}

module.exports = {
    isUniqueViolation,
    DUPLICATE_KEY_CODE,
    PRISMA_UNIQUE_CODE,
};
