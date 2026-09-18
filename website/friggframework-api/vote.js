const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

const ID_REGEX = /^(api|adr):[a-z0-9._-]+$/i;

exports.handler = async function (event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
        }
    }

    try {
        const payload = JSON.parse(event.body || '{}');
        const id = payload.id;

        if (!id || !ID_REGEX.test(id)) {
            return {
                statusCode: 400,
                headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
                body: JSON.stringify({ error: 'invalid id' }),
            }
        }

        const store = getStore('roadmap-votes');
        const cur = await store.get(id, { type: 'text' });
        const next = (parseInt(cur, 10) || 0) + 1;
        await store.set(id, String(next));

        return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ id, count: next }),
        }
    } catch (e) {
        console.log(e);
        return {
            statusCode: 500,
            headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ error: 'vote failed' }),
        }
    }
}
