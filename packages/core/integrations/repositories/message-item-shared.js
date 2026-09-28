const isItem = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The stored shape of a message, for IntegrationRepository
 * .updateIntegrationMessages(). The method takes the positional form (title,
 * body, timestamp) or one item object. The keys of an item object are stored
 * as they are, so a caller can attach what a client acts on, like a code or
 * a list of actions.
 * @param {string|Object} titleOrItem - The title, or the whole item.
 * @param {string} [messageBody] - Ignored when an item is given.
 * @param {number|Date} [messageTimestamp] - Ignored when an item is given.
 * @returns {Object} A new object; the given item is never returned itself.
 */
function toMessageItem(titleOrItem, messageBody, messageTimestamp) {
    if (isItem(titleOrItem)) return { ...titleOrItem };
    return {
        title: titleOrItem,
        message: messageBody,
        timestamp: messageTimestamp,
    };
}

module.exports = { toMessageItem };
