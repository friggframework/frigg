function logInfo(message) {
    console.log(message);
}

function logError(message, error) {
    console.error(message, error);
}

module.exports = {
    logInfo,
    logError,
};