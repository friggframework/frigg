const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

exports.handler = async function (event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
        }
    }

    try {
        const store = getStore('roadmap-votes');
        const { blobs } = await store.list();

        const counts = {};
        if (blobs) {
            for (const b of blobs) {
                const value = await store.get(b.key, { type: 'text' });
                counts[b.key] = parseInt(value, 10) || 0;
            }
        }

        return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify(counts),
        }
    } catch (e) {
        console.log(e);
        return {
            statusCode: 500,
            headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ error: 'read failed' }),
        }
    }
}
