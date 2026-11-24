const { addDeniedKeys } = require('./redact');
const { getLogger } = require('./logger');

const warnedKeys = new Set();

// addDeniedKeys plus one WARN per record-contract key it had to skip, so a
// credential field named like a record field is visible wherever it is set.
function registerDeniedKeys(keys) {
    const ignored = addDeniedKeys(keys);
    for (const key of ignored) {
        if (warnedKeys.has(key)) continue;
        warnedKeys.add(key);
        getLogger('frigg.logger').warn(
            'Credential field name is a record field; it stays visible in logs',
            { eventName: 'frigg.logger.denied_key_ignored', key }
        );
    }
    return ignored;
}

module.exports = { registerDeniedKeys };
