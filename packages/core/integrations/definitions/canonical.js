/** Canonical JSON (sorted keys, no whitespace) and its sha256: the checksum a published version is stored under. */
const crypto = require('crypto');
function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    return JSON.stringify(v);
}
const checksum = (doc) => 'sha256:' + crypto.createHash('sha256').update(canonical(doc)).digest('hex');
module.exports = { canonical, checksum };
