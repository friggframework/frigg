const AWS = require('aws-sdk');
const { mongoose } = require('../database/mongoose');
const crypto = require('crypto');
const { Encrypt } = require('./encrypt');

const hexPattern = /^[a-f0-9]+$/i; // match hex strings of length >= 1

// Test that an encrypted secret value appears to have valid values (without actually decrypting it).
function expectValidSecret(secret) {
    const parts = secret.split(':');
    const keyId = Buffer.from(parts[0], 'base64').toString();
    const iv = parts[1];
    const encryptedText = parts[2];
    const encryptedKey = Buffer.from(parts[3], 'base64').toString();

    expect(iv).toHaveLength(32);
    expect(iv).toMatch(hexPattern);
    expect(encryptedText).toHaveLength(14);
    expect(encryptedText).toMatch(hexPattern);

    // Keys from AWS start with Karn and have a different format.
    if (keyId.startsWith('arn:aws')) {
        expect(keyId).toBe(
            `arn:aws:kms:us-east-1:000000000000:key/${process.env.KMS_KEY_ARN}`
        );
        // The length here is a sanity check.  Seems they are always within this range.
        expect(encryptedKey.length).toBeGreaterThanOrEqual(85);
        expect(encryptedKey.length).toBeLessThanOrEqual(140);
    } else {
        const { AES_KEY_ID, DEPRECATED_AES_KEY_ID } = process.env;
        expect([AES_KEY_ID, DEPRECATED_AES_KEY_ID]).toContain(keyId);

        const encryptedKeyParts = encryptedKey.split(':');
        const iv2 = encryptedKeyParts[0];
        const encryptedKeyPart = encryptedKeyParts[1];

        expect(iv2).toHaveLength(32);
        expect(iv2).toMatch(hexPattern);
        expect(encryptedKeyPart).toHaveLength(64);
        expect(encryptedKeyPart).toMatch(hexPattern);
    }
}

// Load and validate a raw test document compared to a Mongoose document object.
async function expectValidRawDoc(Model, doc) {
    const rawDoc = await expectValidRawDocById(Model, doc._id);

    expect(rawDoc.notSecret.toString()).toBe(doc.notSecret.toString());
    expect(rawDoc).not.toHaveProperty('secret', doc.secret);

    return rawDoc;
}

// Load and validate a raw test document by ID.
async function expectValidRawDocById(Model, _id) {
    const rawDoc = await Model.collection.findOne({ _id });

    expect(rawDoc).toHaveProperty('notSecret');
    expect(rawDoc).toHaveProperty('secret');
    expectValidSecret(rawDoc.secret);

    return rawDoc;
}

// Create a clean test model, so that the plug-in can be reinitialized.
function createModel() {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const schema = new mongoose.Schema({
        secret: { type: String, lhEncrypt: true },
        notSecret: { type: mongoose.Schema.Types.ObjectId },
        'deeply.nested.secret': { type: String, lhEncrypt: true },
    });

    schema.plugin(Encrypt);

    const Model = mongoose.model(`EncryptTest_${randomHex}`, schema);
    return { schema, Model };
}

// Save and validate a test doc.
async function saveTestDocument(Model) {
    const notSecret = new mongoose.Types.ObjectId();
    const secret = 'abcdefg';
    const doc = new Model({ notSecret, secret });

    expect(doc).toHaveProperty('notSecret');
    expect(doc.notSecret.toString()).toBe(notSecret.toString());
    expect(doc).toHaveProperty('secret');
    expect(doc.secret).toBe(secret);

    await doc.save();

    expect(doc).toHaveProperty('notSecret');
    expect(doc.notSecret.toString()).toBe(notSecret.toString());
    expect(doc).toHaveProperty('secret');
    expect(doc.secret).toBe(secret);

    return { doc, secret, notSecret };
}

module.exports = {
    expectValidSecret,
    expectValidRawDoc,
    expectValidRawDocById,
    createModel,
    saveTestDocument,
};
