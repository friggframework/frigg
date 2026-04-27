const { prisma } = require('../../database/prisma');
const {
    ProcessRepositoryInterface,
} = require('./process-repository-interface');
const { validateOps, splitPath } = require('./process-update-ops-shared');

/**
 * PostgreSQL Process Repository Adapter
 * Handles process persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses foreign key constraints for relations
 * - JSONB type for context and results (efficient querying)
 * - Array type for childProcesses references
 * - Transactional support available if needed
 *
 * Design Philosophy:
 * - Same interface as MongoDB repository
 * - Prisma abstracts away most database-specific details
 * - Minor differences in JSON handling internally managed by Prisma
 */
class ProcessRepositoryPostgres extends ProcessRepositoryInterface {
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
    _convertId(id) {
        if (id === null || id === undefined) return id;
        const parsed = parseInt(id, 10);
        if (isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Create a new process record
     * @param {Object} processData - Process data to create
     * @returns {Promise<Object>} Created process record
     */
    async create(processData) {
        const process = await this.prisma.process.create({
            data: {
                userId: this._convertId(processData.userId),
                integrationId: this._convertId(processData.integrationId),
                name: processData.name,
                type: processData.type,
                state: processData.state || 'INITIALIZING',
                context: processData.context || {},
                results: processData.results || {},
                parentProcessId: this._convertId(processData.parentProcessId),
            },
        });

        return this._toPlainObject(process);
    }

    /**
     * Find a process by ID
     * @param {string} processId - Process ID to find
     * @returns {Promise<Object|null>} Process record or null if not found
     */
    async findById(processId) {
        const process = await this.prisma.process.findUnique({
            where: { id: this._convertId(processId) },
        });

        return process ? this._toPlainObject(process) : null;
    }

    /**
     * Update a process record
     * @param {string} processId - Process ID to update
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated process record
     */
    async update(processId, updates) {
        // Prepare update data, excluding undefined values
        const updateData = {};

        if (updates.state !== undefined) {
            updateData.state = updates.state;
        }
        if (updates.context !== undefined) {
            updateData.context = updates.context;
        }
        if (updates.results !== undefined) {
            updateData.results = updates.results;
        }
        if (updates.parentProcessId !== undefined) {
            updateData.parentProcessId = this._convertId(
                updates.parentProcessId
            );
        }

        const process = await this.prisma.process.update({
            where: { id: this._convertId(processId) },
            data: updateData,
        });

        return this._toPlainObject(process);
    }

    /**
     * Atomic process update — race-safe counterpart to `update()`.
     *
     * Compiles the `ProcessUpdateOps` into ONE `UPDATE "Process" ...
     * RETURNING *` statement with nested `jsonb_set` calls for every
     * context/results mutation. Postgres applies row-level locking
     * during UPDATE, so concurrent callers on the same row serialize at
     * the DB without any read-modify-write in Node.
     *
     * Path segments have been regex-validated upstream (see
     * process-update-ops-shared.js); they are embedded directly into
     * the SQL string. All values go through positional parameters.
     *
     * @param {string} processId
     * @param {ProcessUpdateOps} ops
     * @returns {Promise<Object|null>}
     */
    async applyProcessUpdate(processId, ops) {
        const normalized = validateOps(ops);
        const id = this._convertId(processId);

        // Build the SQL expression for each JSON column. We start each
        // column's expression from the column itself and wrap it in
        // jsonb_set(...) calls — one wrap per operation targeting that
        // column. If no op targets a column, we omit that SET clause so
        // we don't issue a pointless self-assignment.
        const params = [];
        /** @type {(v:unknown)=>string} positional placeholder, 1-indexed */
        const bind = (v) => {
            params.push(v);
            return `$${params.length}`;
        };

        const columnExpressions = this._buildColumnExpressions(
            normalized,
            bind
        );
        const setClauses = [];
        for (const [column, expr] of Object.entries(columnExpressions)) {
            setClauses.push(`"${column}" = ${expr}`);
        }
        if (normalized.newState !== null) {
            setClauses.push(`"state" = ${bind(normalized.newState)}`);
        }
        setClauses.push(`"updatedAt" = NOW()`);

        const idPlaceholder = bind(id);
        const sql = `
            UPDATE "Process"
            SET ${setClauses.join(', ')}
            WHERE "id" = ${idPlaceholder}
            RETURNING *
        `;

        const rows = await this.prisma.$queryRawUnsafe(sql, ...params);
        if (!rows || rows.length === 0) return null;
        return this._toPlainObject(rows[0]);
    }

    /**
     * Returns a map of column → SQL expression with all jsonb_set wraps
     * applied. Used only by applyProcessUpdate.
     * @private
     */
    _buildColumnExpressions(ops, bind) {
        const byColumn = { context: null, results: null };

        // Seed with the column itself (wrapped with COALESCE so that
        // a NULL column doesn't break jsonb_set).
        const seed = (col) =>
            byColumn[col] ??
            (byColumn[col] = `COALESCE("${col}", '{}'::jsonb)`);

        /**
         * Postgres `jsonb_set(target, path, value, create_missing=true)`
         * only creates the LEAF segment if missing — intermediate segments
         * that don't exist as objects cause the call to return `target`
         * unchanged (silent no-op). For a path like `context.a.b.c` on a
         * doc where `context.a` is missing, we'd bail on the write.
         *
         * This helper wraps `prev` in a chain of `jsonb_set` calls that
         * ensure each intermediate prefix path is an object, preserving
         * its contents if it's already present:
         *
         *   ensureParents(prev, ['a','b','c'])
         *     ⇒ jsonb_set(
         *          jsonb_set(prev,  '{a}',   COALESCE(prev#>'{a}',   '{}'::jsonb), true),
         *          '{a,b}', COALESCE(${that}#>'{a,b}', '{}'::jsonb), true)
         *
         * The caller then wraps this result with its own `jsonb_set` for
         * the leaf segment. Depth-1 paths skip this entirely (no parents
         * to synthesize).
         */
        const ensureParents = (prevExpr, segments) => {
            let cur = prevExpr;
            for (let i = 1; i < segments.length; i++) {
                const parentPath = `'{${segments.slice(0, i).join(',')}}'`;
                cur = `jsonb_set(${cur}, ${parentPath}, COALESCE(${cur} #> ${parentPath}, '{}'::jsonb), true)`;
            }
            return cur;
        };

        const wrapIncrement = (col, segments, delta) => {
            const textPath = `'{${segments.join(',')}}'`;
            const jsonbPath = `'{${segments.join(',')}}'`;
            const prev = seed(col);
            const guarded = ensureParents(prev, segments);
            const nextValue = `to_jsonb(COALESCE((${guarded} #>> ${textPath})::numeric, 0) + ${bind(delta)})`;
            byColumn[col] = `jsonb_set(${guarded}, ${jsonbPath}, ${nextValue}, true)`;
        };

        const wrapSet = (col, segments, value) => {
            const jsonbPath = `'{${segments.join(',')}}'`;
            const prev = seed(col);
            const guarded = ensureParents(prev, segments);
            // $n::jsonb — values are serialized to JSON by Prisma when
            // passed as a parameter, then cast back into jsonb.
            byColumn[col] = `jsonb_set(${guarded}, ${jsonbPath}, ${bind(JSON.stringify(value))}::jsonb, true)`;
        };

        const wrapPushSlice = (col, segments, spec) => {
            const jsonbPath = `'{${segments.join(',')}}'`;
            const prev = seed(col);
            const guarded = ensureParents(prev, segments);
            // Construct the sliced array in a CTE to evaluate `${newArr}`
            // exactly ONCE (vs. the inline form that Postgres would still
            // execute correctly but expand three times). Order is
            // explicitly preserved by `jsonb_agg(... ORDER BY idx)`;
            // without the ORDER BY, aggregate order is implementation-
            // defined even with WITH ORDINALITY.
            const sliced = `(
                WITH combined AS (
                    SELECT COALESCE((${guarded} #> ${jsonbPath}), '[]'::jsonb) || ${bind(JSON.stringify(spec.values))}::jsonb AS arr
                )
                SELECT COALESCE(jsonb_agg(elem ORDER BY idx), '[]'::jsonb)
                FROM combined,
                     jsonb_array_elements((SELECT arr FROM combined)) WITH ORDINALITY AS t(elem, idx)
                WHERE idx > GREATEST(0, jsonb_array_length((SELECT arr FROM combined)) - ${bind(spec.keepLast)})
            )`;
            byColumn[col] = `jsonb_set(${guarded}, ${jsonbPath}, ${sliced}, true)`;
        };

        for (const [path, delta] of Object.entries(ops.increment)) {
            const { column, segments } = splitPath(path);
            wrapIncrement(column, segments, delta);
        }
        for (const [path, value] of Object.entries(ops.set)) {
            const { column, segments } = splitPath(path);
            wrapSet(column, segments, value);
        }
        for (const [path, spec] of Object.entries(ops.pushSlice)) {
            const { column, segments } = splitPath(path);
            wrapPushSlice(column, segments, spec);
        }

        const result = {};
        for (const [col, expr] of Object.entries(byColumn)) {
            if (expr !== null) result[col] = expr;
        }
        return result;
    }

    /**
     * Find processes by integration and type
     * @param {string} integrationId - Integration ID
     * @param {string} type - Process type
     * @returns {Promise<Array>} Array of process records
     */
    async findByIntegrationAndType(integrationId, type) {
        const processes = await this.prisma.process.findMany({
            where: {
                integrationId: this._convertId(integrationId),
                type,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return processes.map((p) => this._toPlainObject(p));
    }

    /**
     * Find active processes (not in excluded states)
     * @param {string} integrationId - Integration ID
     * @param {string[]} [excludeStates=['COMPLETED', 'ERROR']] - States to exclude
     * @returns {Promise<Array>} Array of active process records
     */
    async findActiveProcesses(
        integrationId,
        excludeStates = ['COMPLETED', 'ERROR']
    ) {
        const processes = await this.prisma.process.findMany({
            where: {
                integrationId: this._convertId(integrationId),
                state: {
                    notIn: excludeStates,
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return processes.map((p) => this._toPlainObject(p));
    }

    /**
     * Find a process by name (most recent)
     * @param {string} name - Process name
     * @returns {Promise<Object|null>} Most recent process with given name, or null
     */
    async findByName(name) {
        const process = await this.prisma.process.findFirst({
            where: { name },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return process ? this._toPlainObject(process) : null;
    }

    /**
     * Delete a process by ID
     * @param {string} processId - Process ID to delete
     * @returns {Promise<void>}
     */
    async deleteById(processId) {
        await this.prisma.process.delete({
            where: { id: this._convertId(processId) },
        });
    }

    /**
     * Convert Prisma model to plain JavaScript object
     * Ensures consistent API across repository implementations
     * @private
     * @param {Object} process - Prisma process model
     * @returns {Object} Plain process object
     */
    _toPlainObject(process) {
        return {
            id: String(process.id),
            userId: String(process.userId),
            integrationId: String(process.integrationId),
            name: process.name,
            type: process.type,
            state: process.state,
            context: process.context,
            results: process.results,
            childProcesses: Array.isArray(process.childProcesses)
                ? process.childProcesses.length > 0 &&
                    typeof process.childProcesses[0] === 'object' &&
                    process.childProcesses[0] !== null
                    ? process.childProcesses.map((child) => String(child.id))
                    : process.childProcesses
                : [],
            parentProcessId:
                process.parentProcessId !== null
                    ? String(process.parentProcessId)
                    : null,
            createdAt: process.createdAt,
            updatedAt: process.updatedAt,
        };
    }
}

module.exports = { ProcessRepositoryPostgres };
