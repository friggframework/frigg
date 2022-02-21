const crypto = require('crypto');

const algorithm = 'aes-256-ctr';

function encrypt(text, key) {
    const iv = crypto.randomBytes(16);
    const randomString = iv.toString('hex');

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let crypted = cipher.update(text, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return `${randomString}:${crypted}`;
}

function decrypt(text, key) {
    const parts = text.toString().split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let dec = decipher.update(parts[1], 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
}

module.exports = {
    encrypt,
    decrypt,
};
