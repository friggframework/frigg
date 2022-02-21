const crypto = require('crypto');

const encrypt = async (string, secret) => {
    const hash = crypto
        .createHmac('sha256', secret)
        .update(string)
        .digest('hex');
    return hash;
};

const createHash = async (string) => {
    const hash = crypto.createHash('sha256').update(string).digest('hex');
    return hash;
};

module.exports = {
    encrypt,
    createHash,
};
