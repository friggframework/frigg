const { prisma, getEncryptionConfig } = require('../../database/prisma');
const {
    getFieldsToEncryptOnWrite,
    loadCustomEncryptionSchema,
} = require('../../database/encryption/encryption-schema-registry');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');
const { strictIntId } = require('./report-id');
const { validateMappingQuery } = require('./integration-mapping-query');

/**
 * PostgreSQL Integration Mapping Repository Adapter
 * Handles persistence of integration mappings used for data transformation
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 */
class IntegrationMappingRepositoryPostgres extends IntegrationMappingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Convert string ID to integer for PostgreSQL queries
     * @private
     * @param {string|number|null|undefined} id - ID to convert
     * @returns {number|null|undefined} Integer ID or null/undefined
     * @throws {Error} If ID cannot be converted to integer
     */
    _stringToInt(id) {
        if (id === null || id === undefined) return id;
        const parsed = parseInt(id, 10);
        if (isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Convert any value to string (handles null/undefined)
     * @private
     * @param {*} value - Value to convert
     * @returns {string|null|undefined} String value or null/undefined
     */
    _toString(value) {
        if (value === null || value === undefined) return value;
        return String(value);
    }

    /**
     * Convert integer to string for application layer
     * @private
     * @param {number|null|undefined} id - Integer ID from database
     * @returns {string|null|undefined} String ID or null/undefined
     */
    _intToString(id) {
        if (id === null || id === undefined) return id;
        return id.toString();
    }

    /**
     * Legacy alias for _stringToInt (for backward compatibility)
     * @private
     */
    _convertId(id) {
        return this._stringToInt(id);
    }

    /**
     * Convert mapping object IDs to strings
     * @private
     * @param {Object|null} mapping - Mapping object from database
     * @returns {Object|null} Mapping with string IDs
     */
    _convertMappingIds(mapping) {
        if (!mapping) return mapping;
        return {
            ...mapping,
            id: this._intToString(mapping.id),
            integrationId: this._intToString(mapping.integrationId),
        };
    }

    /**
     * Find mapping by integration ID and source ID
     * Replaces: IntegrationMapping.findBy(integrationId, sourceId)
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @param {string} sourceId - The source ID for lookup
     * @returns {Promise<Object|null>} The mapping object with string IDs or null
     */
    async findMappingBy(integrationId, sourceId) {
        const mapping = await this.prisma.integrationMapping.findFirst({
            where: {
                integrationId: this._stringToInt(integrationId),
                sourceId: this._toString(sourceId),
            },
        });
        return this._convertMappingIds(mapping);
    }

    /**
     * Create or update a mapping
     * Replaces: IntegrationMapping.upsert(integrationId, sourceId, mapping)
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @param {string} sourceId - The source ID for lookup
     * @param {Object} mapping - The mapping data
     * @returns {Promise<Object>} The created or updated mapping document with string IDs
     */
    async upsertMapping(integrationId, sourceId, mapping) {
        const result = await this.prisma.integrationMapping.upsert({
            where: {
                integrationId_sourceId: {
                    integrationId: this._stringToInt(integrationId),
                    sourceId: this._toString(sourceId),
                },
            },
            update: {
                mapping,
            },
            create: {
                integrationId: this._stringToInt(integrationId),
                sourceId: this._toString(sourceId),
                mapping,
            },
        });
        return this._convertMappingIds(result);
    }

    /**
     * Find all mappings for an integration
     * Replaces: IntegrationMapping.find({ integration: integrationId })
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @returns {Promise<Array>} Array of mapping documents with string IDs
     */
    async findMappingsByIntegration(integrationId) {
        const intIntegrationId = this._convertId(integrationId);
        const mappings = await this.prisma.integrationMapping.findMany({
            where: { integrationId: intIntegrationId },
        });
        return mappings.map((m) => this._convertMappingIds(m));
    }

    /**
     * Delete a mapping by integration and source ID
     * Replaces: IntegrationMapping.deleteOne({ integration, sourceId })
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @param {string} sourceId - The source ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteMapping(integrationId, sourceId) {
        try {
            await this.prisma.integrationMapping.delete({
                where: {
                    integrationId_sourceId: {
                        integrationId: this._stringToInt(integrationId),
                        sourceId: this._toString(sourceId),
                    },
                },
            });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error) {
            if (error.code === 'P2025') {
                // Record not found
                return { acknowledged: true, deletedCount: 0 };
            }
            throw error;
        }
    }

    /**
     * Delete all mappings for an integration
     * Replaces: IntegrationMapping.deleteMany({ integration: integrationId })
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @returns {Promise<Object>} The deletion result
     */
    async deleteMappingsByIntegration(integrationId) {
        const intIntegrationId = this._convertId(integrationId);
        const result = await this.prisma.integrationMapping.deleteMany({
            where: { integrationId: intIntegrationId },
        });

        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }

    /**
     * Count mappings grouped by integration id for a bounded id set.
     *
     * @param {Array<string|number>} ids - Integration ids
     * @returns {Promise<Map<string, number>>} integrationId (string) → count
     */
    async countByIntegrationIds(ids = []) {
        const counts = new Map();
        if (!ids || ids.length === 0) return counts;

        // Strict (matches findAllForReport): reject partially-numeric ids instead of coercing.
        const intIds = ids.map((id) => strictIntId(id));
        const groups = await this.prisma.integrationMapping.groupBy({
            by: ['integrationId'],
            where: { integrationId: { in: intIds } },
            _count: { _all: true },
        });

        for (const group of groups) {
            counts.set(
                this._intToString(group.integrationId),
                group._count._all
            );
        }
        return counts;
    }

    /**
     * Query one page of an integration's mappings, filtering and ordering
     * inside Postgres instead of loading every row. The total rides on the
     * page as a window count, so one statement reads the matching rows once;
     * only an empty page after the first needs a second, count-only statement.
     *
     * The SQL text is fixed: every caller value, JSON paths included (as
     * text[]), is a positional parameter, and the sort direction comes from
     * the ASC/DESC whitelist in integration-mapping-query.js.
     *
     * @param {string} integrationId
     * @param {Object} query - See IntegrationMappingRepositoryInterface.queryMappings
     * @returns {Promise<{mappings: Array<Object>, total: number}>}
     */
    async queryMappings(integrationId, query) {
        const { where, orderBy, skip, take, omit } =
            validateMappingQuery(query);
        const intIntegrationId = strictIntId(integrationId);
        this._assertMappingWrittenUnencrypted();

        const params = [];
        const bind = (v) => {
            params.push(v);
            return `$${params.length}`;
        };

        const whereSql = [
            `"integrationId" = ${bind(intIntegrationId)}::int`,
            `jsonb_typeof("mapping") = 'object'`,
            ...where.map((entry) => this._whereEntrySql(entry, bind)),
        ].join(' AND ');
        const whereParams = [...params];

        const mappingSql =
            omit.length > 0
                ? `"mapping" - ${bind(omit)}::text[] AS "mapping"`
                : `"mapping"`;
        const orderSql = orderBy ? this._orderSql(orderBy, bind) : `"id" ASC`;

        const pageSql = `
            SELECT "id", "integrationId", "sourceId", ${mappingSql}, "createdAt", "updatedAt",
                (COUNT(*) OVER ())::int AS "__total"
            FROM "IntegrationMapping"
            WHERE ${whereSql}
            ORDER BY ${orderSql}
            OFFSET ${bind(skip)}::bigint
            LIMIT ${bind(take)}::int
        `;
        const rows = await this.prisma.$queryRawUnsafe(pageSql, ...params);

        return {
            mappings: rows.map((row) => {
                const mapping = this._convertMappingIds(row);
                delete mapping.__total;
                return mapping;
            }),
            total: await this._totalMatches(rows, skip, whereSql, whereParams),
        };
    }

    /**
     * An empty page is either past the end (count again) or, at skip 0,
     * proof that nothing matches.
     * @private
     */
    async _totalMatches(pageRows, skip, whereSql, whereParams) {
        if (pageRows.length > 0) return pageRows[0].__total;
        if (skip === 0) return 0;

        const [{ total }] = await this.prisma.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS "total" FROM "IntegrationMapping" WHERE ${whereSql}`,
            ...whereParams
        );
        return total;
    }

    /**
     * queryMappings reads the stored JSON, so it needs `mapping`, and every
     * path inside it, written as plain JSON. The app's opt-out
     * (`encryption.disable`) is registered lazily, when the Prisma client is
     * created, so load it before deciding.
     * @private
     */
    _assertMappingWrittenUnencrypted() {
        if (!getEncryptionConfig().enabled) return;

        const encryptedMappingFields = () =>
            getFieldsToEncryptOnWrite('IntegrationMapping').filter(
                (field) => field === 'mapping' || field.startsWith('mapping.')
            );
        if (encryptedMappingFields().length > 0) loadCustomEncryptionSchema();
        const fields = encryptedMappingFields();
        if (fields.length > 0) {
            const encrypted = fields
                .map((field) => `IntegrationMapping.${field}`)
                .join(', ');
            const optOut = fields.map((field) => `'${field}'`).join(', ');
            throw new Error(
                `queryMappings: field-level encryption still encrypts ${encrypted} on write, so it cannot be queried. Opt out by adding ${optOut} to appDefinition.encryption.disable.IntegrationMapping.`
            );
        }
    }

    /**
     * One where entry: a condition, or an anyOf group as a parenthesized OR.
     * @private
     */
    _whereEntrySql(entry, bind) {
        if (!entry.anyOf) return this._conditionSql(entry, bind);
        const alternatives = entry.anyOf.map((condition) =>
            this._conditionSql(condition, bind)
        );
        return `(${alternatives.join(' OR ')})`;
    }

    /**
     * SQL predicate for one validated queryMappings condition. `exists`
     * treats JSON null as absent, and `notExists` is its exact negation.
     * @private
     */
    _conditionSql({ segments, op, value }, bind) {
        if (op === 'notStartsWith') {
            const prefix = bind(value);
            return `("sourceId" IS NULL OR NOT starts_with("sourceId", ${prefix}::text))`;
        }

        const path = `${bind(segments)}::text[]`;
        if (op === 'in') {
            const values = bind(value);
            return `(jsonb_typeof("mapping" #> ${path}) = 'string' AND "mapping" #>> ${path} = ANY(${values}::text[]))`;
        }

        const type = `COALESCE(jsonb_typeof("mapping" #> ${path}), 'null')`;
        return op === 'exists' ? `${type} <> 'null'` : `${type} = 'null'`;
    }

    /**
     * NULLIF folds JSON null into SQL NULL, so both sort after every value.
     * @private
     */
    _orderSql({ segments, direction }, bind) {
        const path = bind(segments);
        const value = `NULLIF("mapping" #> ${path}::text[], 'null'::jsonb)`;
        return `${value} ${direction} NULLS LAST, "id" ${direction}`;
    }

    /**
     * Find mapping by ID
     * @param {string} id - Mapping ID (string from application layer)
     * @returns {Promise<Object|null>} Mapping object with string IDs or null
     */
    async findMappingById(id) {
        const intId = this._convertId(id);
        const mapping = await this.prisma.integrationMapping.findUnique({
            where: { id: intId },
        });
        return this._convertMappingIds(mapping);
    }

    /**
     * Update mapping by ID
     * @param {string} id - Mapping ID (string from application layer)
     * @param {Object} updates - Fields to update (with string IDs from application layer)
     * @returns {Promise<Object>} Updated mapping object with string IDs
     */
    async updateMapping(id, updates) {
        const intId = this._convertId(id);

        // Convert integrationId if present in updates
        const data = { ...updates };
        if (data.integrationId !== undefined) {
            data.integrationId = this._convertId(data.integrationId);
        }

        const mapping = await this.prisma.integrationMapping.update({
            where: { id: intId },
            data,
        });
        return this._convertMappingIds(mapping);
    }
}

module.exports = { IntegrationMappingRepositoryPostgres };
