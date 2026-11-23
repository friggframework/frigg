const MESSAGE_TYPES = Object.freeze(['errors', 'warnings', 'info', 'logs']);

const messagesOfType = (record, messageType) =>
    Array.isArray(record[messageType]) ? record[messageType] : [];

const sameRateLimitMessage = ({ code, module }, { retryAtFrom, retryAtTo }) => ({
    $elemMatch: {
        code,
        module,
        retryAt: { $gte: retryAtFrom, $lte: retryAtTo },
    },
});

module.exports = { MESSAGE_TYPES, messagesOfType, sameRateLimitMessage };
