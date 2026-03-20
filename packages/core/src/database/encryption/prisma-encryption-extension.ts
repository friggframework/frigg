/**
 * Prisma Client Extension for transparent field-level encryption.
 * Intercepts Prisma queries to encrypt on write and decrypt on read.
 */

import { getEncryptedFields } from './encryption-schema-registry';
import { FieldEncryptionService } from './field-encryption-service';
import { Cryptor } from '../../encrypt';

interface CreateEncryptionExtensionOptions {
    cryptor: Cryptor;
    enabled?: boolean;
}

interface QueryArgs {
    model: string;
    args: Record<string, unknown>;
    query: (args: Record<string, unknown>) => Promise<unknown>;
}

type PrismaExtension = {
    name: string;
    query: {
        $allModels: Record<string, (params: QueryArgs) => Promise<unknown>>;
    };
} | ((client: unknown) => unknown);

export function createEncryptionExtension({ cryptor, enabled = true }: CreateEncryptionExtensionOptions): PrismaExtension {
    if (!enabled) {
        return (client: unknown) => client;
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
                async create({ model, args, query }: QueryArgs) {
                    if (args.data) {
                        args.data = await encryptionService.encryptFields(
                            model,
                            args.data as Record<string, unknown>
                        );
                    }
                    const result = await query(args);
                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result as Record<string, unknown>
                        );
                    }
                    return result;
                },

                async createMany({ model, args, query }: QueryArgs) {
                    if (args.data && Array.isArray(args.data)) {
                        args.data = await encryptionService.encryptFieldsInBulk(
                            model,
                            args.data as Record<string, unknown>[]
                        );
                    } else if (args.data) {
                        args.data = await encryptionService.encryptFields(
                            model,
                            args.data as Record<string, unknown>
                        );
                    }
                    return await query(args);
                },

                async update({ model, args, query }: QueryArgs) {
                    if (args.data) {
                        args.data = await encryptionService.encryptFields(
                            model,
                            args.data as Record<string, unknown>
                        );
                    }
                    const result = await query(args);
                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result as Record<string, unknown>
                        );
                    }
                    return result;
                },

                async updateMany({ model, args, query }: QueryArgs) {
                    if (args.data) {
                        args.data = await encryptionService.encryptFields(
                            model,
                            args.data as Record<string, unknown>
                        );
                    }
                    return await query(args);
                },

                async upsert({ model, args, query }: QueryArgs) {
                    if (args.create) {
                        args.create = await encryptionService.encryptFields(
                            model,
                            args.create as Record<string, unknown>
                        );
                    }
                    if (args.update) {
                        args.update = await encryptionService.encryptFields(
                            model,
                            args.update as Record<string, unknown>
                        );
                    }
                    const result = await query(args);
                    if (result) {
                        return await encryptionService.decryptFields(
                            model,
                            result as Record<string, unknown>
                        );
                    }
                    return result;
                },

                async findUnique({ model, args, query }: QueryArgs) {
                    const result = await query(args);
                    if (result) {
                        return await encryptionService.decryptFields(model, result as Record<string, unknown>);
                    }
                    return result;
                },

                async findFirst({ model, args, query }: QueryArgs) {
                    const result = await query(args);
                    if (result) {
                        return await encryptionService.decryptFields(model, result as Record<string, unknown>);
                    }
                    return result;
                },


                async findMany({ model, args, query }: QueryArgs) {
                    const results = await query(args);
                    if (results && Array.isArray(results)) {
                        return await encryptionService.decryptFieldsInBulk(
                            model,
                            results as Record<string, unknown>[]
                        );
                    }
                    return results;
                },

                async delete({ model, args, query }: QueryArgs) {
                    const result = await query(args);
                    if (result) {
                        return await encryptionService.decryptFields(model, result as Record<string, unknown>);
                    }
                    return result;
                },

                async deleteMany({ model: _model, args, query }: QueryArgs) {
                    return await query(args);
                },

                async count({ model: _model, args, query }: QueryArgs) {
                    return await query(args);
                },

                async aggregate({ model: _model, args, query }: QueryArgs) {
                    return await query(args);
                },

                async groupBy({ model: _model, args, query }: QueryArgs) {
                    return await query(args);
                },

                async findFirstOrThrow({ model, args, query }: QueryArgs) {
                    const result = await query(args);
                    if (result) {
                        return await encryptionService.decryptFields(model, result as Record<string, unknown>);
                    }
                    return result;
                },

                async findUniqueOrThrow({ model, args, query }: QueryArgs) {
                    const result = await query(args);
                    if (result) {
                        return await encryptionService.decryptFields(model, result as Record<string, unknown>);
                    }
                    return result;
                },
            },
        },
    };
}
