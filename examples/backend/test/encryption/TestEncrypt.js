const mongoose = require('mongoose');
const crypto = require('crypto');
const LHEncrypt = require('../../src/utils/encryption/LHEncrypt');
const chai = require('chai');

const { expect } = chai;
const hexPattern = /^[a-f0-9]+$/i; // match hex strings of length >= 1

// Test that an encrypted secret value appears to have valid values (without actually decrypting it).
function expectValidSecret(secret) {
    const parts = secret.split(':');
    const keyId = Buffer.from(parts[0], 'base64').toString();
    const iv = parts[1];
    const encryptedText = parts[2];
    const encryptedKey = Buffer.from(parts[3], 'base64').toString();

    expect(iv).to.have.length(32);
    expect(iv).to.match(hexPattern);
    expect(encryptedText).to.have.length(14);
    expect(encryptedText).to.match(hexPattern);

    // Keys from AWS start with Karn and have a different format.
    if (encryptedKey.startsWith('Karn')) {
        expect(keyId).to.equal(
            `arn:aws:kms:us-east-1:000000000000:key/${process.env.KMS_KEY_ARN}`
        );
        // The length here is a sanity check.  Seems they are always within this range.
        expect(encryptedKey.length).to.be.gte(130);
        expect(encryptedKey.length).to.be.lte(140);
    } else {
        const { AES_KEY_ID, DEPRECATED_AES_KEY_ID } = process.env;
        expect([AES_KEY_ID, DEPRECATED_AES_KEY_ID]).to.contain(keyId);

        const encryptedKeyParts = encryptedKey.split(':');
        const iv2 = encryptedKeyParts[0];
        const encryptedKeyPart = encryptedKeyParts[1];

        expect(iv2).to.have.length(32);
        expect(iv2).to.match(hexPattern);
        expect(encryptedKeyPart).to.have.length(64);
        expect(encryptedKeyPart).to.match(hexPattern);
    }
}

// Load and validate a raw test document compared to a Mongoose document object.
async function expectValidRawDoc(Model, doc) {
    const rawDoc = await expectValidRawDocById(Model, doc._id);

    expect(rawDoc.notSecret.toString()).to.equal(doc.notSecret.toString());
    expect(rawDoc).not.to.have.property('secret', doc.secret);

    return rawDoc;
}

// Load and validate a raw test document by ID.
async function expectValidRawDocById(Model, _id) {
    const rawDoc = await Model.collection.findOne({ _id });

    expect(rawDoc).to.have.property('notSecret');
    expect(rawDoc).to.have.property('secret');
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

    schema.plugin(LHEncrypt);

    const Model = mongoose.model(`LHEncryptTest_${randomHex}`, schema);
    return { schema, Model };
}

// Save and validate a test doc.
async function saveTestDocument(Model) {
    const notSecret = new mongoose.Types.ObjectId();
    const secret = 'abcdefg';
    const doc = new Model({ notSecret, secret });

    expect(doc).to.have.property('notSecret');
    expect(doc.notSecret.toString()).to.equal(notSecret.toString());
    expect(doc).to.have.property('secret');
    expect(doc.secret).to.equal(secret);

    await doc.save();

    expect(doc).to.have.property('notSecret');
    expect(doc.notSecret.toString()).to.equal(notSecret.toString());
    expect(doc).to.have.property('secret');
    expect(doc.secret).to.equal(secret);

    return { doc, secret, notSecret };
}

// Generate tests for each type of Mongoose query and other scenarios.  This is
// used to run each test with the local encryption methods, and then the same
// tests are run using KMS.
function generateTests() {
    let Model;

    before(() => {
        Model = createModel().Model;
    });

    it('can instantiate the model', async () => {
        new Model();
    });

    it('works when no document is found with findOne', async () => {
        const notSecret = new mongoose.Types.ObjectId();
        const doc = await Model.findOne({ notSecret });
        expect(doc).to.equal(null);
    });

    it('works when no documents are found with find', async () => {
        const notSecret = new mongoose.Types.ObjectId();
        const docs = await Model.find({ notSecret });
        expect(docs).to.have.length(0);
    });

    it('can be saved', async function () {
        await saveTestDocument(Model);
    });

    it('can be reloaded', async function () {
        const { doc, notSecret } = await saveTestDocument(Model);

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('notSecret');
        expect(reloaded.notSecret.toString()).to.equal(notSecret.toString());
    });

    it('can be reloaded (nested field)', async function () {
        const notSecret = new mongoose.Types.ObjectId();
        const secret = 'abcdefg';
        const doc = new Model({ notSecret, 'deeply.nested.secret': secret });

        expect(doc).to.have.property('notSecret');
        expect(doc.notSecret.toString()).to.equal(notSecret.toString());
        expect(doc).to.have.property('deeply');
        expect(doc.deeply).to.have.property('nested');
        expect(doc.deeply.nested).to.have.property('secret', secret);

        await doc.save();

        expect(doc).to.have.property('notSecret');
        expect(doc.notSecret.toString()).to.equal(notSecret.toString());
        expect(doc).to.have.property('deeply');
        expect(doc.deeply).to.have.property('nested');
        expect(doc.deeply.nested).to.have.property('secret', secret);

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('notSecret');
        expect(reloaded.notSecret.toString()).to.equal(notSecret.toString());
        expect(reloaded).to.have.property('deeply');
        expect(reloaded.deeply).to.have.property('nested');
        expect(reloaded.deeply.nested).to.have.property('secret', secret);
    });

    it('automatically encrypts a secret field when saved', async () => {
        const { doc, secret, notSecret } = await saveTestDocument(Model);
        const rawDoc = await expectValidRawDoc(Model, doc);

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('notSecret');
        expect(reloaded.notSecret.toString()).to.equal(notSecret.toString());
        expect(reloaded).to.have.property('secret');
        expect(reloaded.secret).to.equal(secret);
    });

    it('automatically encrypts a secret field when using updateOne', async () => {
        const { doc, notSecret } = await saveTestDocument(Model);
        const rawDoc = await expectValidRawDoc(Model, doc);

        await Model.updateOne({ _id: doc._id }, { secret: 'hijklmn' });

        const updatedRawDoc = await expectValidRawDoc(Model, doc);
        expect(updatedRawDoc.secret).not.to.equal(rawDoc.secret);

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('secret');
        expect(reloaded.secret).to.equal('hijklmn');
    });

    it('automatically encrypts a secret field when using updateOne and $set', async () => {
        const { doc, notSecret } = await saveTestDocument(Model);
        const rawDoc = await expectValidRawDoc(Model, doc);

        await Model.updateOne(
            { _id: doc._id },
            { $set: { secret: 'hijklmn' } }
        );

        const updatedRawDoc = await expectValidRawDoc(Model, doc);
        expect(updatedRawDoc.secret).not.to.equal(rawDoc.secret);

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('secret');
        expect(reloaded.secret).to.equal('hijklmn');
    });

    it('automatically encrypts a secret field when using updateOne on document', async () => {
        const { doc, notSecret } = await saveTestDocument(Model);
        const rawDoc = await expectValidRawDoc(Model, doc);

        await doc.updateOne({ secret: 'hijklmn' });

        const updatedRawDoc = await expectValidRawDoc(Model, doc);
        expect(updatedRawDoc.secret).not.to.equal(rawDoc.secret);

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('secret');
        expect(reloaded.secret).to.equal('hijklmn');
    });

    it('automatically encrypts and decrypts secret field when using findOneAndUpdate', async () => {
        const { doc, secret } = await saveTestDocument(Model);
        const reloaded = await Model.findOneAndUpdate(
            { _id: doc._id },
            { secret: 'beets' }
        );

        expect(reloaded).to.have.property('secret', secret);

        const updatedDoc = await Model.findOne({ _id: doc._id });
        expect(updatedDoc).to.have.property('secret', 'beets');
    });

    it('handles findOneAndUpdate with `new: true` option', async () => {
        const { doc, secret } = await saveTestDocument(Model);
        const updatedDoc = await Model.findOneAndUpdate(
            { _id: doc._id },
            { secret: 'beets' },
            { new: true }
        );
        expect(updatedDoc).to.have.property('secret', 'beets');

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('secret', 'beets');
    });

    it('automatically encrypts and decrypts secret field when using findOneAndReplace', async () => {
        const { doc, secret } = await saveTestDocument(Model);
        const reloaded = await Model.findOneAndReplace(
            { _id: doc._id },
            { secret: 'beets' }
        );

        expect(reloaded).to.have.property('secret', secret);

        const updatedDoc = await Model.findOne({ _id: doc._id });
        expect(updatedDoc).to.have.property('secret', 'beets');
    });

    it('automatically decrypts secret field when using findOneAndDelete', async () => {
        const { doc, secret, notSecret } = await saveTestDocument(Model);

        const deleted = await Model.findOneAndDelete({ _id: doc._id });
        expect(deleted).to.have.property('secret', secret);

        const docsForUser = await Model.find({ notSecret });
        expect(docsForUser).to.have.length(0);
    });

    it('correctly handles `rawResult: true` option when using findOneAndDelete', async () => {
        const { doc, secret } = await saveTestDocument(Model);
        const deleted = await Model.findOneAndDelete(
            { _id: doc._id },
            { rawResult: true }
        );

        expect(deleted).to.have.property('value');
        expectValidSecret(deleted.value.secret);
    });

    it('automatically decrypts secret field when using findOneAndRemove', async () => {
        const { doc, secret, notSecret } = await saveTestDocument(Model);

        const deleted = await Model.findOneAndRemove({ _id: doc._id });
        expect(deleted).to.have.property('secret', secret);

        const docsForUser = await Model.find({ notSecret });
        expect(docsForUser).to.have.length(0);
    });

    it('correctly handles `rawResult: true` option when using findOneAndRemove', async () => {
        const { doc, secret } = await saveTestDocument(Model);
        const rawDoc = await Model.findOneAndRemove(
            { _id: doc._id },
            { rawResult: true }
        );

        expect(rawDoc).to.have.property('value');
        expectValidSecret(rawDoc.value.secret);
    });

    it('automatically encrypts a secret field when using insertMany', async () => {
        // First create documents with secret values
        const notSecret = new mongoose.Types.ObjectId();
        const insertedDocs = await Model.insertMany([
            { notSecret, secret: 'qwerty' },
            { notSecret, secret: 'zxcvbn' },
        ]);

        expect(insertedDocs).to.have.length(2);
        expect(insertedDocs[0]).to.have.property('secret', 'qwerty');
        expect(insertedDocs[1]).to.have.property('secret', 'zxcvbn');

        const rawDocs = await Model.collection.find({
            notSecret: notSecret.toString(),
        });

        for (const rawDoc of await rawDocs.toArray()) {
            expectValidSecret(rawDoc.secret);
        }

        // Finally, reload the docs with Mongoose, and ensure that the values
        // were successfully decrypted.
        const reloadedDocs = await Model.find({ notSecret });
        expect(reloadedDocs).to.have.length(2);
        expect(reloadedDocs[0]).to.have.property('secret', 'qwerty');
        expect(reloadedDocs[1]).to.have.property('secret', 'zxcvbn');
    });

    it('throws if rawResult is used with insertMany', async () => {
        const notSecret = new mongoose.Types.ObjectId();

        try {
            await Model.insertMany([{ notSecret, secret: 'qwerty' }], {
                rawResult: true,
            });
            throw new Error('Expected error did not occurr.');
        } catch (error) {
            expect(error).to.have.property(
                'message',
                'Raw result not supported for insertMany with LHEncrypt plugin'
            );
        }
    });

    it('automatically encrypts a secret field when using updateOne', async () => {
        const { doc, secret } = await saveTestDocument(Model);
        const rawDoc = await expectValidRawDoc(Model, doc);

        await Model.updateOne({ _id: doc._id }, { secret: 'hijklmn' });

        const updatedRawDoc = await expectValidRawDoc(Model, doc);
        expect(updatedRawDoc.secret).not.to.equal(rawDoc.secret);

        const reloadedDoc = await Model.findOne({ _id: doc._id });
        expect(reloadedDoc).to.have.property('secret');
        expect(reloadedDoc.secret).to.equal('hijklmn');
    });

    it('automatically encrypts a secret field when using replaceOne', async () => {
        const { doc, secret } = await saveTestDocument(Model);

        await Model.replaceOne({ _id: doc._id }, { secret: '012a457' });

        const rawDoc = await Model.collection.findOne({ _id: doc._id });
        expect(rawDoc).to.have.property('secret');
        expect(rawDoc).not.to.have.property('secret', secret);
        expectValidSecret(rawDoc.secret);

        const reloadedDoc = await Model.findOne({ _id: doc._id });
        expect(reloadedDoc).to.have.property('secret');
        expect(reloadedDoc.secret).to.equal('012a457');
    });

    it('automatically encrypts a secret field when using update and $set', async () => {
        const { doc, notSecret } = await saveTestDocument(Model);
        const rawDoc = await expectValidRawDoc(Model, doc);

        await Model.update({ _id: doc._id }, { $set: { secret: 'hijklmn' } });

        const updatedRawDoc = await expectValidRawDoc(Model, doc);
        expect(updatedRawDoc.secret).not.to.equal(rawDoc.secret);

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('secret');
        expect(reloaded.secret).to.equal('hijklmn');
    });

    it('automatically encrypts a secret field when using $setOnInsert', async () => {
        const { doc, notSecret, secret } = await saveTestDocument(Model);
        const rawDoc = await expectValidRawDoc(Model, doc);

        const updateResult = await Model.update(
            { notSecret },
            { $setOnInsert: { secret: 'hijklmn' } },
            { upsert: true }
        );

        expect(updateResult).not.to.have.property('upserted');

        const notUpdatedRawDoc = await expectValidRawDoc(Model, doc);
        expect(notUpdatedRawDoc.secret).to.equal(rawDoc.secret);

        const reloadedNotUpdated = await Model.findOne({ _id: doc._id });
        expect(reloadedNotUpdated).to.have.property('secret', secret);

        const notSecret2 = new mongoose.Types.ObjectId();
        const updateResult2 = await Model.update(
            { notSecret: notSecret2 },
            { $setOnInsert: { secret: 'hijklmn' } },
            { upsert: true }
        );

        expect(updateResult2).to.have.property('upserted');
        expect(updateResult2.upserted).to.have.length(1);
        expect(updateResult2.upserted[0]).to.have.property('_id');
        expect(updateResult2.upserted[0]).not.to.have.property(
            '_id',
            doc._id.toString()
        );

        const upsertedRawDoc = await expectValidRawDocById(
            Model,
            updateResult2.upserted[0]._id
        );
        expect(upsertedRawDoc.secret).not.to.equal(rawDoc.secret);

        const reloaded = await Model.findOne({ _id: upsertedRawDoc._id });
        expect(reloaded).to.have.property('secret', 'hijklmn');
    });

    it('throws an error if update uses an encrypted field with `multi: true`', async () => {
        const { doc, secret, notSecret } = await saveTestDocument(Model);

        try {
            await Model.update(
                { notSecret },
                { secret: 'change all passwords' },
                { multiple: true }
            );
        } catch (error) {
            expect(error).to.have.property('message');
            expect(error.message).to.equal(
                'Attempted to update encrypted field of multiple documents'
            );

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).to.have.property('secret', secret);

            return;
        }

        throw new Error('Did not catch expected error');
    });

    it('throws an error if updateMany uses an encrypted field', async () => {
        const { doc, secret, notSecret } = await saveTestDocument(Model);

        try {
            await Model.updateMany(
                { notSecret },
                { secret: 'change all passwords' }
            );
        } catch (error) {
            expect(error).to.have.property('message');
            expect(error.message).to.equal(
                'Attempted to update encrypted field of multiple documents'
            );

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).to.have.property('secret', secret);

            return;
        }

        throw new Error('Did not catch expected error');
    });

    it('automatically encrypts a nested field when using updateOne', async () => {
        const { doc, secret } = await saveTestDocument(Model);

        await Model.updateOne(
            { _id: doc._id },
            { 'deeply.nested.secret': 'hij2lmn' }
        );

        const updatedRawDoc = await expectValidRawDoc(Model, doc);
        expectValidSecret(updatedRawDoc.deeply.nested.secret);

        const reloadedDoc = await Model.findOne({ _id: doc._id });
        expect(reloadedDoc).to.have.property('deeply');
        expect(reloadedDoc.deeply).to.have.property('nested');
        expect(reloadedDoc.deeply.nested).to.have.property('secret', 'hij2lmn');
    });

    it('automatically encrypts a nested field when using update and $set', async () => {
        const { doc, notSecret } = await saveTestDocument(Model);

        await Model.update(
            { _id: doc._id },
            {
                $set: { deeply: { nested: { secret: 'h3jklmn' } } },
            }
        );

        const updatedRawDoc = await expectValidRawDoc(Model, doc);
        expectValidSecret(updatedRawDoc.deeply.nested.secret);

        const reloaded = await Model.findOne({ _id: doc._id });
        expect(reloaded).to.have.property('deeply');
        expect(reloaded.deeply).to.have.property('nested');
        expect(reloaded.deeply.nested).to.have.property('secret', 'h3jklmn');
    });

    it('automatically encrypts a secret field when using $setOnInsert', async () => {
        const { doc, notSecret, secret } = await saveTestDocument(Model);

        const updateResult = await Model.update(
            { notSecret },
            { $setOnInsert: { deeply: { 'nested.secret': 'hijkl4n' } } },
            { upsert: true }
        );

        expect(updateResult).not.to.have.property('upserted');

        const notUpdatedRawDoc = await expectValidRawDoc(Model, doc);
        expect(notUpdatedRawDoc).not.to.have.property('deeply');

        const notSecret2 = new mongoose.Types.ObjectId();
        const updateResult2 = await Model.update(
            { notSecret: notSecret2 },
            { $setOnInsert: { deeply: { 'nested.secret': 'hijkl4n' } } },
            { upsert: true }
        );

        expect(updateResult2).to.have.property('upserted');
        expect(updateResult2.upserted).to.have.length(1);
        expect(updateResult2.upserted[0]).to.have.property('_id');
        expect(updateResult2.upserted[0]).not.to.have.property(
            '_id',
            doc._id.toString()
        );

        const upsertedRawDoc = await Model.collection.findOne({
            _id: updateResult2.upserted[0]._id,
        });
        expectValidSecret(upsertedRawDoc.deeply.nested.secret);

        const reloaded = await Model.findOne({ _id: upsertedRawDoc._id });
        expect(reloaded).to.have.property('deeply');
        expect(reloaded.deeply).to.have.property('nested');
        expect(reloaded.deeply.nested).to.have.property('secret', 'hijkl4n');
    });
}

module.exports = {
    expectValidSecret,
    expectValidRawDoc,
    expectValidRawDocById,
    createModel,
    saveTestDocument,
    generateTests,
};
