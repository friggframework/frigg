const messagesOfType = (record, messageType) =>
    Array.isArray(record[messageType]) ? record[messageType] : [];

module.exports = { messagesOfType };
