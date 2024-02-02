const { Cryptor } = require('./Cryptor');

const updateOneEvents = [
    'updateOne',
    'replaceOne',
    'findOneAndUpdate',
    'findOneAndReplace',
];
const findOneEvents = [
    'findOne',
    'findOneAndDelete',
    'findOneAndRemove',
    'findOneAndUpdate',
    'findOneAndReplace',
];

const shouldBypassEncryption = (STAGE) => {
    if (!process.env.BYPASS_ENCRYPTION_STAGE) {
        return false;
    }

    const bypassStages = process.env.BYPASS_ENCRYPTION_STAGE.split(',').map((stage) => stage.trim());
    return bypassStages.indexOf(STAGE) > -1;
};

// The Mongoose plug-in function
function Encrypt(schema, options) {
    const { STAGE, KMS_KEY_ARN, AES_KEY_ID } = process.env;

    if (shouldBypassEncryption(STAGE)) {
        return;
    }

    if (KMS_KEY_ARN && AES_KEY_ID) {
        throw new Error(
            'Local and AWS encryption keys are both set in the environment.'
        );
    }

    const fields = Object.values(schema.paths)
        .map(({ path, options }) => (options.lhEncrypt === true ? path : ''))
        .filter(Boolean);

    if (!fields.length) {
        return;
    }

    const cryptor = new Cryptor({
        // Use AWS if the CMK is present
        shouldUseAws: !!KMS_KEY_ARN,
        // Find all the fields in the schema with lhEncrypt === true
        fields: fields,
    });

    // ---------------------------------------------
    // ### Encrypt fields before save/update/insert.
    // ---------------------------------------------

    schema.pre('save', async function encryptionPreSave() {
        // `this` will be a doc
        await cryptor.encryptFieldsInDocuments([this]);
    });

    schema.pre(
        'insertMany',
        async function encryptionPreInsertMany(_, docs, options) {
            // `this` will be the model
            if (options?.rawResult) {
                throw new Error(
                    'Raw result not supported for insertMany with Encrypt plugin'
                );
            }

            await cryptor.encryptFieldsInDocuments(docs);
        }
    );

    schema.pre(updateOneEvents, async function encryptionPreUpdateOne() {
        // `this` will be a query
        await cryptor.encryptFieldsInQuery(this);
    });

    schema.pre('updateMany', async function encryptionPreUpdateMany() {
        // `this` will be a query
        cryptor.expectNotToUpdateManyEncrypted(this.getUpdate());
    });

    schema.pre('update', async function encryptionPreUpdate() {
        // `this` will be a query
        const { multiple } = this.getOptions();

        if (multiple) {
            cryptor.expectNotToUpdateManyEncrypted(this.getUpdate());
            return;
        }

        await cryptor.encryptFieldsInQuery(this);
    });

    // --------------------------------------------
    // ### Decrypt documents after they are loaded.
    // --------------------------------------------
    schema.post('save', async function encryptionPreSave() {
        // `this` will be a doc
        await cryptor.decryptFieldsInDocuments([this]);
    });

    schema.post(findOneEvents, async function encryptionPostFindOne(doc) {
        // `this` will be a query
        const { rawResult } = this.getOptions();

        if (rawResult) {
            return;
        }

        await cryptor.decryptFieldsInDocuments([doc]);
    });

    schema.post('find', async function encryptionPostFind(docs) {
        // `this` will be a query
        await cryptor.decryptFieldsInDocuments(docs);
    });

    schema.post('insertMany', async function encryptionPostInsertMany(docs) {
        // `this` will be the model
        await cryptor.decryptFieldsInDocuments(docs);
    });
}

module.exports = { Encrypt };
