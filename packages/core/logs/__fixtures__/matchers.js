const WINDOW = 8;

function forms(secret) {
    return [
        secret,
        encodeURIComponent(secret),
        Buffer.from(secret).toString('base64'),
    ];
}

function windows(value) {
    if (value.length <= WINDOW) return [value];
    const result = [];
    for (let i = 0; i + WINDOW <= value.length; i += 1) {
        result.push(value.slice(i, i + WINDOW));
    }
    return result;
}

function findSecretWindow(received, secrets) {
    const haystack =
        typeof received === 'string' ? received : JSON.stringify(received);
    for (const secret of secrets) {
        for (const form of forms(secret)) {
            for (const w of windows(form)) {
                if (haystack.includes(w)) return { secret, window: w };
            }
        }
    }
    return null;
}

function toContainNoSecretWindow(received, secrets) {
    const list = Array.isArray(secrets) ? secrets : Object.values(secrets);
    const hit = findSecretWindow(received, list);
    return {
        pass: hit === null,
        message: () =>
            hit
                ? `expected no ${WINDOW}-char window of a secret, found "${hit.window}" (from a secret of length ${hit.secret.length})`
                : 'expected a secret window, found none',
    };
}

module.exports = { toContainNoSecretWindow, findSecretWindow, WINDOW };
