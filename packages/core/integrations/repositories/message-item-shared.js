const isItem = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

function toMessageItem(titleOrItem, messageBody, messageTimestamp) {
    if (isItem(titleOrItem)) return { ...titleOrItem };
    return {
        title: titleOrItem,
        message: messageBody,
        timestamp: messageTimestamp,
    };
}

module.exports = { toMessageItem };
