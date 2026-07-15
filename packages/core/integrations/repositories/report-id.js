/**
 * Strict integer-id coercion for Postgres report reads.
 *
 * Unlike a plain parseInt, this rejects partially-numeric input ('12abc',
 * '12.9') instead of coercing it to 12 and silently reporting the wrong
 * record. Shared by the Postgres report read methods (integration
 * findAllForReport and mapping countByIntegrationIds) so both validate ids
 * with one semantics rather than diverging.
 *
 * @param {string|number} id
 * @returns {number}
 * @throws {TypeError} if id is not an exact integer
 */
function strictIntId(id) {
    const str = String(id).trim();
    if (!/^-?\d+$/.test(str)) {
        throw new TypeError(`Invalid ID: ${id} cannot be converted to integer`);
    }
    return Number.parseInt(str, 10);
}

module.exports = { strictIntId };
