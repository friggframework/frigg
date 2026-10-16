/**
 * Test double for Cryptor output. Same shape as the real thing
 * (`keyId:iv:ciphertext:encryptedKey`: base64, 16-byte hex, hex, base64) so
 * FieldEncryptionService._isEncrypted accepts it, with the plaintext
 * recoverable for the fake decrypt.
 */
const fakeCiphertext = (plain) =>
    `a2V5SWQ=:${'0'.repeat(32)}:${Buffer.from(String(plain)).toString(
        'hex'
    )}:ZW5jS2V5`;

const fakePlaintext = (ciphertext) =>
    Buffer.from(String(ciphertext).split(':')[2], 'hex').toString();

module.exports = { fakeCiphertext, fakePlaintext };
