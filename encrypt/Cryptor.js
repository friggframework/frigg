const crypto = require('crypto');
const AWS = require('aws-sdk');
const { get, set } = require('lodash');
const aes = require('./aes');

const hasValue = (a) => a !== undefined && a !== null && a !== '';

class Cryptor {
    constructor({ fields, shouldUseAws }) {
        this.shouldUseAws = shouldUseAws;
        this.fields = fields;

        this.permutationsByField = {};

        for (const field of fields) {
            this.permutationsByField[field] = this.calculatePermutations(
                field.split('.')
            );
        }
    }

    async generateDataKey() {
        if (this.shouldUseAws) {
            const kmsClient = new AWS.KMS();
            const dataKey = await kmsClient
                .generateDataKey({
                    KeyId: process.env.KMS_KEY_ARN,
                    KeySpec: 'AES_256',
                })
                .promise();

            const keyId = Buffer.from(dataKey.KeyId).toString('base64');
            const encryptedKey = dataKey.CiphertextBlob.toString('base64');
            const plaintext = dataKey.Plaintext;
            return { keyId, encryptedKey, plaintext };
        }

        const { AES_KEY, AES_KEY_ID } = process.env;
        const randomKey = crypto.randomBytes(32).toString('hex').slice(0, 32);

        return {
            keyId: Buffer.from(AES_KEY_ID).toString('base64'),
            encryptedKey: Buffer.from(aes.encrypt(randomKey, AES_KEY)).toString(
                'base64'
            ),
            plaintext: randomKey,
        };
    }

    getKeyFromEnvironment(keyId) {
        const availableKeys = {
            [process.env.AES_KEY_ID]: process.env.AES_KEY,
            [process.env.DEPRECATED_AES_KEY_ID]: process.env.DEPRECATED_AES_KEY,
        };

        const key = availableKeys[keyId];

        if (!key) {
            throw new Error(`No encryption key found with ID "${keyId}"`);
        }

        return key;
    }

    async decryptDataKey(keyId, encryptedKey) {
        if (this.shouldUseAws) {
            const kmsClient = new AWS.KMS();
            const dataKey = await kmsClient
                .decrypt({
                    KeyId: keyId,
                    CiphertextBlob: encryptedKey,
                })
                .promise();

            return dataKey.Plaintext;
        }

        const key = this.getKeyFromEnvironment(keyId);
        return aes.decrypt(encryptedKey, key);
    }

    // If the field has a value in the document, apply async function f to that field.
    async setInDocument(doc, f) {
        // Use the Mongoose document get/set when available (not for insertMany)
        if (doc.get) {
            for (const field of this.fields) {
                const value = doc.get(field);
                if (hasValue(value)) {
                    doc.set(field, await f(value));
                }
            }
            return;
        }

        // Otherwise use permutations.
        for (const field of this.fields) {
            const updatedDoc = await this.applyAll(doc, field, f);
            Object.assign(doc, updatedDoc);
        }
    }

    // Calculate all possible permutations for a nested field.  For example a
    // field "deeply.nested.field" might be referred to in a Mongo query as
    // { deeply: { 'nested.field': {} } } or { 'deeply.nested.field': {} }
    // etc.  For a given path, this gives all path parts to check in a format
    // that lodash understands when using get and set with an array of path
    // parts e.g. get(o, ['deeply', 'nested.parts'])
    calculatePermutations = (parts) => {
        if (!parts.length) return [];
        if (parts.length === 1) return [parts];

        const combos = [];

        for (let i = 0; i < parts.length; i += 1) {
            const frontPath = parts.slice(0, i + 1).join('.');
            const rest = parts.slice(i + 1);

            if (rest.length) {
                combos.push(
                    ...this.calculatePermutations(rest).map((child) => [
                        frontPath,
                        ...child,
                    ])
                );
            } else {
                combos.push([frontPath]);
            }
        }

        return combos;
    };

    // Encrypt all possible permutations of a field (possibly nested), if there
    // is a value at that path permutation.
    async applyAll(o, field, f) {
        const clone = { ...o };
        const permutations = this.permutationsByField[field];

        for (const path of permutations) {
            const value = get(o, path);
            if (hasValue(value)) {
                set(clone, path, await f(value));
            }
        }

        return clone;
    }

    async processFieldsInDocuments(docs, f) {
        const promises = docs
            .filter(Boolean)
            .flatMap((doc) => this.setInDocument(doc, f));

        return Promise.all(promises);
    }

    async encryptFieldsInDocuments(docs) {
        await this.processFieldsInDocuments(docs, this.encrypt.bind(this));
    }

    async decryptFieldsInDocuments(docs) {
        await this.processFieldsInDocuments(docs, this.decrypt.bind(this));
    }

    async encryptFieldsInQuery(query) {
        for (const field of this.fields) {
            const originalUpdate = query.getUpdate();
            const updatedUpdate = await this.applyAll(
                originalUpdate,
                field,
                this.encrypt.bind(this)
            );

            if (originalUpdate.$set) {
                const updatedSetUpdate = await this.applyAll(
                    originalUpdate.$set,
                    field,
                    this.encrypt.bind(this)
                );
                updatedUpdate.$set = { ...updatedSetUpdate };
            }

            if (originalUpdate.$setOnInsert) {
                const updatedSetOnInsertUpdate = await this.applyAll(
                    originalUpdate.$setOnInsert,
                    field,
                    this.encrypt.bind(this)
                );
                updatedUpdate.$setOnInsert = { ...updatedSetOnInsertUpdate };
            }

            query.setUpdate(updatedUpdate);
        }
    }

    expectNotToUpdateManyEncrypted(update) {
        for (const field of this.fields) {
            if (update.$set && hasValue(update.$set[field])) {
                throw new Error(
                    'Attempted to update encrypted field of multiple documents'
                );
            }

            if (update.$setOnInsert && hasValue(update.$setOnInsert[field])) {
                throw new Error(
                    'Attempted to update encrypted field of multiple documents'
                );
            }

            if (hasValue(update[field])) {
                throw new Error(
                    'Attempted to update encrypted field of multiple documents'
                );
            }
        }
    }

    async encrypt(text) {
        const { keyId, encryptedKey, plaintext } = await this.generateDataKey();
        const encryptedText = aes.encrypt(text, plaintext);

        return `${keyId}:${encryptedText}:${encryptedKey}`;
    }

    async decrypt(text) {
        const split = text.split(':');
        const keyId = Buffer.from(split[0], 'base64').toString();
        const encryptedText = `${split[1]}:${split[2]}`;
        const encryptedKey = Buffer.from(split[3], 'base64');
        const plaintext = await this.decryptDataKey(keyId, encryptedKey);

        return aes.decrypt(encryptedText, plaintext);
    }
}

module.exports = { Cryptor };
