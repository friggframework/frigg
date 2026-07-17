/**
 * Coerces an id to an integer, rejecting partially-numeric input ('12abc',
 * '12.9') that parseInt would silently truncate to 12 and read the wrong record.
 */
function strictIntId(id) {
    const str = String(id).trim();
    if (!/^-?\d+$/.test(str)) {
        throw new TypeError(`Invalid ID: ${id} cannot be converted to integer`);
    }
    return Number.parseInt(str, 10);
}

module.exports = { strictIntId };
