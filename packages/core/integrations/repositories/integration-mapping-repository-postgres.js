const { prisma } = require('../../database/prisma');
const {
    assertMappingWrittenUnencrypted,
} = require('../../database/encryption/integration-mapping-encryption');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');
const { strictIntId } = require('./report-id');
const { validateMappingQuery } = require('./integration-mapping-query');

const COLUMNS = { mapping: '"mapping"', sourceId: '"sourceId"' };
const SQL_DIRECTIONS = { asc: 'ASC', desc: 'DESC' };

const jsonPathOperand = (column, path) => ({
    json: `${column} #> ${path}::text[]`,
    text: `${column} #>> ${path}::text[]`,
});
const jsonType = (json) => `COALESCE(jsonb_typeof(${json}), 'null')`;

const CONDITION_SQL = {
    exists: ({ json }) => `${jsonType(json)} <> 'null'`,
    notExists: ({ json }) => `${jsonType(json)} = 'null'`,
    in: ({ json, text, value }) =>
        `(jsonb_typeof(${json}) = 'string' AND ${text} = ANY(${value}::text[]))`,
    notStartsWith: ({ text, value }) =>
        `(${text} IS NULL OR NOT starts_with(${text}, ${value}::text))`,
};

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
     * @param {string} integrationId
     * @param {Object} query - See IntegrationMappingRepositoryInterface.queryMappings
     * @returns {Promise<{mappings: Array<Object>, total: number}>}
     */
    async queryMappings(integrationId, query) {
        const { where, orderBy, skip, take, omit } =
            validateMappingQuery(query);
        const intIntegrationId = strictIntId(integrationId);
        assertMappingWrittenUnencrypted();

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
        const orderSql = orderBy ? this._orderSql(orderBy, bind) : `"id" ASC`;
        const mappingSql =
            omit.length > 0
                ? `"mapping" - ${bind(omit)}::text[] AS "mapping"`
                : `"mapping"`;

        const sql = `
            WITH "matched" AS (
                SELECT "id", "integrationId", "sourceId", "mapping", "createdAt", "updatedAt"
                FROM "IntegrationMapping"
                WHERE ${whereSql}
            ),
            "page" AS (
                SELECT * FROM "matched"
                ORDER BY ${orderSql}
                OFFSET ${bind(skip)}::bigint
                LIMIT ${bind(take)}::int
            )
            SELECT "id", "integrationId", "sourceId", ${mappingSql}, "createdAt", "updatedAt",
                (SELECT COUNT(*)::int FROM "matched") AS "__total"
            FROM (VALUES (1)) AS "one"
            LEFT JOIN "page" ON true
            ORDER BY ${orderSql}
        `;
        const rows = await this.prisma.$queryRawUnsafe(sql, ...params);

        return {
            mappings: rows
                .filter((row) => row.id !== null)
                .map(({ __total, ...row }) => this._convertMappingIds(row)),
            total: rows[0].__total,
        };
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
    _conditionSql({ field, path, op, value }, bind) {
        const column = COLUMNS[field];
        const operand = path
            ? jsonPathOperand(column, bind(path))
            : { text: column };
        return CONDITION_SQL[op]({
            ...operand,
            value: value === undefined ? undefined : bind(value),
        });
    }

    /**
     * NULLIF folds JSON null into SQL NULL, so both sort after every value.
     * @private
     */
    _orderSql({ path, direction }, bind) {
        const { json } = jsonPathOperand(COLUMNS.mapping, bind(path));
        const value = `NULLIF(${json}, 'null'::jsonb)`;
        const sqlDirection = SQL_DIRECTIONS[direction];
        return `${value} ${sqlDirection} NULLS LAST, "id" ${sqlDirection}`;
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
