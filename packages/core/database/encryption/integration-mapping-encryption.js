const { getEncryptionConfig } = require('../prisma');
const { Cryptor } = require('../../encrypt/Cryptor');
const {
    getFieldsToDecryptOnRead,
    getFieldsToEncryptOnWrite,
    loadCustomEncryptionSchema,
} = require('./encryption-schema-registry');
const {
    createFieldEncryptionService,
} = require('./prisma-encryption-extension');

let plainMappingEncryption = null;

/**
 * The `IntegrationMapping` fields, `mapping` itself or a nested `mapping.*`
 * path, that field-level encryption encrypts on write. An empty result is
 * kept for the life of the process.
 *
 * @returns {string[]} Empty when every mapping path is written as plain JSON
 */
function getMappingFieldsEncryptedOnWrite() {
    return mappingEncryption().encryptedOnWrite;
}

/**
 * @throws {Error} When field-level encryption still encrypts `mapping`, or a
 *   nested `mapping.*` path, on write, naming the opt-out that lifts it
 */
function assertMappingWrittenUnencrypted() {
    const fields = getMappingFieldsEncryptedOnWrite();
    if (fields.length === 0) return;

    const encrypted = fields
        .map((field) => `IntegrationMapping.${field}`)
        .join(', ');
    const optOut = fields.map((field) => `'${field}'`).join(', ');
    throw new Error(
        `queryMappings: field-level encryption still encrypts ${encrypted} on write, so it cannot be queried. Opt out by adding ${optOut} to appDefinition.encryption.disable.IntegrationMapping.`
    );
}

/**
 * Decrypts rows that `queryMappings` read around the Prisma encryption
 * extension, the way reads through the extension do: every
 * `IntegrationMapping` field the schema lists, opted-out paths included, so a
 * path written encrypted before its opt-out comes back plain.
 *
 * @param {Object[]} rows - Rows whose `mapping` is a JSON object
 * @returns {Promise<Object[]>} `rows` itself when encryption is off or the
 *   schema lists no field besides `mapping`
 */
async function decryptQueriedMappings(rows) {
    const { decryptor } = mappingEncryption();
    if (!decryptor) return rows;
    return decryptor.decryptFieldsInBulk('IntegrationMapping', rows);
}

function mappingEncryption() {
    if (plainMappingEncryption) return plainMappingEncryption;

    const encryption = currentMappingEncryption();
    if (encryption.encryptedOnWrite.length === 0) {
        plainMappingEncryption = encryption;
    }
    return encryption;
}

function currentMappingEncryption() {
    const config = getEncryptionConfig();
    if (!config.enabled) return { encryptedOnWrite: [], decryptor: null };

    loadCustomEncryptionSchema();
    const encryptedOnWrite = getFieldsToEncryptOnWrite(
        'IntegrationMapping'
    ).filter((field) => field === 'mapping' || field.startsWith('mapping.'));
    const decryptsBesidesMapping = getFieldsToDecryptOnRead(
        'IntegrationMapping'
    ).some((field) => field !== 'mapping');
    const decryptor = decryptsBesidesMapping
        ? createFieldEncryptionService(
              new Cryptor({ shouldUseAws: config.method === 'kms' })
          )
        : null;
    return { encryptedOnWrite, decryptor };
}

/** Test helper: forget a kept result. */
function resetMappingEncryptionCheck() {
    plainMappingEncryption = null;
}

module.exports = {
    assertMappingWrittenUnencrypted,
    decryptQueriedMappings,
    getMappingFieldsEncryptedOnWrite,
    resetMappingEncryptionCheck,
};
