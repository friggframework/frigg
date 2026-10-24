const { validateProxyResponse, validateProxyRequest } = require('../index');

describe('api-proxy schema: Management API v2 entity proxy (ADR-052)', () => {
    it('accepts a relayed upstream 4xx', () => {
        expect(
            validateProxyResponse({ success: false, status: 404, headers: {}, data: { message: 'no' } }).valid
        ).toBe(true);
    });

    it('accepts a base64 binary body', () => {
        expect(
            validateProxyResponse({ success: true, status: 200, data: 'AQI=', dataEncoding: 'base64' }).valid
        ).toBe(true);
    });

    it.each([
        ['PROXY_NOT_ALLOWED', 403],
        ['INVALID_PROXY_REQUEST', 400],
        ['RESPONSE_TOO_LARGE', 502],
        ['UPSTREAM_ERROR', 502],
        ['TIMEOUT', 504],
    ])('accepts the %s error (%s)', (code, status) => {
        expect(
            validateProxyResponse({
                success: false,
                status,
                error: { code, message: 'safe message' },
            }).valid
        ).toBe(true);
    });

    it('still requires a path starting with /', () => {
        expect(validateProxyRequest({ method: 'GET', path: 'v3/contacts' }).valid).toBe(false);
        expect(validateProxyRequest({ method: 'GET', path: '/v3/contacts' }).valid).toBe(true);
    });
});
