/**
 * An in-memory stand-in for `prisma.scheduledJob`, enough of Prisma's query
 * semantics for the ScheduledJob repository: equality, lt/lte/gt/gte, `in`,
 * OR / AND, upsert by the unique scheduleName, and updateMany returning
 * { count } so a conditional claim can be observed.
 */
function matches(row, where = {}) {
    return Object.entries(where).every(([key, cond]) => {
        if (key === 'OR') return cond.some((w) => matches(row, w));
        if (key === 'AND') return cond.every((w) => matches(row, w));
        const value = row[key];
        if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
            const v = value instanceof Date ? value.getTime() : value;
            const n = (x) => (x instanceof Date ? x.getTime() : x);
            if ('lte' in cond && !(v <= n(cond.lte))) return false;
            if ('lt' in cond && !(v < n(cond.lt))) return false;
            if ('gte' in cond && !(v >= n(cond.gte))) return false;
            if ('gt' in cond && !(v > n(cond.gt))) return false;
            if ('in' in cond && !cond.in.includes(value)) return false;
            if ('equals' in cond && value !== cond.equals) return false;
            return true;
        }
        const v = value instanceof Date ? value.getTime() : value;
        const c = cond instanceof Date ? cond.getTime() : cond;
        return v === c;
    });
}

function createInMemoryScheduledJobPrisma({ now = () => new Date() } = {}) {
    const rows = new Map();
    let nextId = 1;
    const copy = (r) => (r ? { ...r } : null);

    const scheduledJob = {
        rows,
        async upsert({ where, update, create }) {
            const existing = rows.get(where.scheduleName);
            if (existing) {
                Object.assign(existing, update, { updatedAt: now() });
                return copy(existing);
            }
            const row = { id: nextId++, createdAt: now(), updatedAt: now(), ...create };
            rows.set(row.scheduleName, row);
            return copy(row);
        },
        async findUnique({ where }) {
            return copy(rows.get(where.scheduleName));
        },
        async findMany({ where, orderBy } = {}) {
            const found = [...rows.values()].filter((r) => matches(r, where)).map(copy);
            if (orderBy?.scheduledAt) found.sort((a, b) => a.scheduledAt - b.scheduledAt);
            return found;
        },
        async updateMany({ where, data }) {
            let count = 0;
            for (const row of rows.values()) {
                if (matches(row, where)) {
                    Object.assign(row, data, { updatedAt: data.updatedAt ?? now() });
                    count++;
                }
            }
            return { count };
        },
        async delete({ where }) {
            if (!rows.has(where.scheduleName)) {
                const error = new Error('Record to delete does not exist.');
                error.code = 'P2025';
                throw error;
            }
            const row = rows.get(where.scheduleName);
            rows.delete(where.scheduleName);
            return copy(row);
        },
        async deleteMany({ where }) {
            let count = 0;
            for (const [name, row] of rows) {
                if (matches(row, where)) {
                    rows.delete(name);
                    count++;
                }
            }
            return { count };
        },
    };
    return { scheduledJob };
}

module.exports = { createInMemoryScheduledJobPrisma };
