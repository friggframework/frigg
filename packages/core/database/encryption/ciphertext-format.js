/**
 * Recognises values produced by Cryptor.encrypt():
 *   keyId:iv:ciphertext:encryptedKey
 * keyId and encryptedKey are base64, iv and ciphertext are hex, so all four
 * parts match the base64 alphabet. Real envelopes are well over 50
 * characters (the encrypted data key alone is longer).
 *
 * Shared by the Prisma (FieldEncryptionService) and DocumentDB paths so a
 * plaintext value that happens to contain colons (`a:b:c:d`, a URL with
 * userinfo and a port) is never mistaken for ciphertext: on write it gets
 * encrypted, on read it is returned as plaintext.
 */
const BASE64_PART = /^[A-Za-z0-9+/=]+$/;
const MIN_ENVELOPE_LENGTH = 50;

function isEncryptedEnvelope(value) {
    if (typeof value !== 'string' || value.length < MIN_ENVELOPE_LENGTH) {
        return false;
    }
    const parts = value.split(':');
    return parts.length === 4 && parts.every((part) => BASE64_PART.test(part));
}

module.exports = { isEncryptedEnvelope };
