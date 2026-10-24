const { toV2ErrorBody } = require('../../error-response');

/**
 * POST /api/v2/entities/:entityId/proxy (ADR-052). The HTTP status follows the
 * upstream status. Proxy failures answer in the api-proxy.schema.json error
 * shape, which is also the v2 error shape plus `success` and `status`.
 */
function createProxyHandlers({ executeEntityProxyRequest }) {
    return {
        async proxyEntityRequest(req, res, user) {
            try {
                const result = await executeEntityProxyRequest.execute(
                    req.params.entityId,
                    user,
                    req.body
                );
                res.status(result.status).json(result.body);
            } catch (error) {
                if (!error?.isBoom || !error.data?.proxy) throw error;
                const status = error.output.statusCode;
                if (error.data.retryAfter) {
                    res.set('Retry-After', String(error.data.retryAfter));
                }
                res.status(status).json({
                    success: false,
                    status,
                    ...toV2ErrorBody(error),
                });
            }
        },
    };
}

module.exports = { createProxyHandlers };
