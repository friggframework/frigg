/**
 * Test helper: send one real HTTP request to an Express app on an ephemeral
 * port and return { status, headers, body }. Real HTTP (not a mocked req/res)
 * so body parsing, the error boundary and headers behave as in Lambda.
 */
async function request(app, { method = 'GET', path, headers = {}, body, rawBody } = {}) {
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
        const init = { method, headers: { ...headers } };
        if (rawBody !== undefined) {
            init.body = rawBody;
        } else if (body !== undefined) {
            init.body = JSON.stringify(body);
            init.headers['content-type'] = 'application/json';
        }
        const res = await fetch(
            `http://127.0.0.1:${server.address().port}${path}`,
            init
        );
        const text = await res.text();
        let parsed = text;
        try {
            parsed = text ? JSON.parse(text) : undefined;
        } catch {
            // not JSON; keep the text
        }
        return {
            status: res.status,
            headers: Object.fromEntries(res.headers.entries()),
            body: parsed,
        };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

module.exports = { request };
