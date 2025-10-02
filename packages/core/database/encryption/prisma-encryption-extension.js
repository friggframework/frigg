/**
 * Prisma Client Extension for transparent field-level encryption.
 * Intercepts Prisma queries to encrypt on write and decrypt on read.
 */

const { getEncryptedFields } = require('./encryption-schema-registry');
const { FieldEncryptionService } = require('./field-encryption-service');

function createEncryptionExtension({ cryptor, enabled = true }) {
    if (!enabled) {
        return (client) => client;
    }

    if (!cryptor) {
        throw new Error(
            'Cryptor instance required for encryption extension'
        );
    }

    const encryptionService = new FieldEncryptionService({
        cryptor,
        schema: { getEncryptedFields },
    });

    return {
        name: 'frigg-field-encryption',
        query: {
            $allModels: {
                async create({ model, args, query }) {
                    if (args.data) {
                        args.data = await encryptionService.encryptFields(
                            model,
                            args.data
                        );
                    }

                    const result = await query(args);

                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result
                        );
                    }

                    return result;
                },

                async createMany({ model, args, query }) {
                    if (args.data && Array.isArray(args.data)) {
                        args.data =
                            await encryptionService.encryptFieldsInBulk(
                                model,
                                args.data
                            );
                    } else if (args.data) {
                        args.data = await encryptionService.encryptFields(
                            model,
                            args.data
                        );
                    }

                    return await query(args);
                },

                async update({ model, args, query }) {
                    if (args.data) {
                        args.data = await encryptionService.encryptFields(
                            model,
                            args.data
                        );
                    }

                    const result = await query(args);

                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result
                        );
                    }

                    return result;
                },

                async updateMany({ model, args, query }) {
                    if (args.data) {
                        args.data = await encryptionService.encryptFields(
                            model,
                            args.data
                        );
                    }

                    return await query(args);
                },

                async upsert({ model, args, query }) {
                    if (args.create) {
                        args.create = await encryptionService.encryptFields(
                            model,
                            args.create
                        );
                    }

                    if (args.update) {
                        args.update = await encryptionService.encryptFields(
                            model,
                            args.update
                        );
                    }

                    const result = await query(args);

                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result
                        );
                    }

                    return result;
                },

                async findUnique({ model, args, query }) {
                    const result = await query(args);

                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result
                        );
                    }

                    return result;
                },

                async findFirst({ model, args, query }) {
                    const result = await query(args);

                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result
                        );
                    }

                    return result;
                },

                async findMany({ model, args, query }) {
                    const results = await query(args);

                    if (results && Array.isArray(results)) {
                        return await encryptionService.decryptFieldsInBulk(
                            model,
                            results
                        );
                    }

                    return results;
                },

                async delete({ model, args, query }) {
                    const result = await query(args);

                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result
                        );
                    }

                    return result;
                },

                async deleteMany({ model, args, query }) {
                    return await query(args);
                },

                async count({ model, args, query }) {
                    return await query(args);
                },

                async aggregate({ model, args, query }) {
                    return await query(args);
                },

                async groupBy({ model, args, query }) {
                    return await query(args);
                },

                async findFirstOrThrow({ model, args, query }) {
                    const result = await query(args);

                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result
                        );
                    }

                    return result;
                },

                async findUniqueOrThrow({ model, args, query }) {
                    const result = await query(args);

                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result
                        );
                    }

                    return result;
                },
            },
        },
    };
}

module.exports = { createEncryptionExtension };
