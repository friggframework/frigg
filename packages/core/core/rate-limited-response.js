const isValidDate = (value) =>
    value instanceof Date && !Number.isNaN(value.getTime());

function rateLimitedResponse(error, now = Date.now()) {
    if (error?.isRateLimited !== true) return null;
    if (!isValidDate(error.retryAt)) {
        return {
            statusCode: 429,
            headers: {},
            body: { error: 'Too Many Requests' },
        };
    }
    const retryAfterSeconds = Math.max(
        0,
        Math.ceil((error.retryAt.getTime() - now) / 1000)
    );
    return {
        statusCode: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
        body: {
            error: 'Too Many Requests',
            retryAt: error.retryAt.toISOString(),
        },
    };
}

module.exports = { rateLimitedResponse };
