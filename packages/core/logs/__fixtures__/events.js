const { SECRETS } = require('./secrets');

function httpApiV2Event() {
    return {
        version: '2.0',
        routeKey: 'GET /api/authorize',
        rawPath: '/api/authorize',
        rawQueryString: `code=${SECRETS.oauthCode}&state=abc123&api_key=${SECRETS.apiKeyQuery}`,
        cookies: [`session=${SECRETS.cookie}`],
        headers: {
            'x-frigg-api-key': SECRETS.friggApiKey,
            authorization: `Bearer ${SECRETS.bearer}`,
            cookie: `session=${SECRETS.cookie}`,
            'content-type': 'application/json',
        },
        queryStringParameters: {
            code: SECRETS.oauthCode,
            state: 'abc123',
            api_key: SECRETS.apiKeyQuery,
        },
        requestContext: {
            http: { method: 'GET', path: '/api/authorize', sourceIp: '203.0.113.9' },
            requestId: 'req-v2-1',
        },
        body: JSON.stringify({
            code: SECRETS.oauthCode,
            code_verifier: SECRETS.codeVerifier,
            client_secret: SECRETS.clientSecret,
        }),
        isBase64Encoded: false,
    };
}

function restV1Event() {
    return {
        resource: '/api/{proxy+}',
        path: '/api/integrations',
        httpMethod: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`user:${SECRETS.password}`).toString('base64')}`,
            'X-Frigg-Api-Key': SECRETS.friggApiKey,
            Cookie: `session=${SECRETS.cookie}`,
        },
        multiValueHeaders: {
            Authorization: [`Basic ${Buffer.from(`user:${SECRETS.password}`).toString('base64')}`],
            'Set-Cookie': [`session=${SECRETS.cookie}`],
        },
        queryStringParameters: { access_token: SECRETS.accessToken },
        multiValueQueryStringParameters: { access_token: [SECRETS.accessToken] },
        requestContext: { requestId: 'req-v1-1', stage: 'dev' },
        body: JSON.stringify({ password: SECRETS.password, refresh_token: SECRETS.refreshToken }),
        isBase64Encoded: false,
    };
}

function sqsEvent() {
    return {
        Records: [
            {
                messageId: 'msg-1',
                receiptHandle: 'receipt-1',
                attributes: { ApproximateReceiveCount: '1' },
                body: JSON.stringify({
                    event: 'PROCESS_BATCH',
                    data: {
                        processId: 'proc-1',
                        integrationId: 'int-1',
                        access_token: SECRETS.accessToken,
                        credentials: { client_secret: SECRETS.clientSecret },
                    },
                }),
            },
            {
                messageId: 'msg-2',
                attributes: { ApproximateReceiveCount: '3' },
                body: `not json Authorization: Bearer ${SECRETS.bearer}`,
            },
        ],
    };
}

module.exports = { httpApiV2Event, restV1Event, sqsEvent };
