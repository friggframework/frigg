const { AuthorizationSession } = require('../../domain/authorization-session');

/** In-memory AuthorizationSession repository for tests. */
class InMemoryAuthorizationSessionRepository {
    constructor() {
        this.rows = new Map();
    }

    _copy(session) {
        return new AuthorizationSession({ ...session, stepData: { ...session.stepData } });
    }

    async create(session) {
        this.rows.set(session.sessionId, this._copy(session));
        return this._copy(session);
    }

    async findBySessionId(sessionId) {
        const row = this.rows.get(sessionId);
        if (!row || row.isExpired()) return null;
        return this._copy(row);
    }

    async update(session) {
        this.rows.set(session.sessionId, this._copy(session));
        return this._copy(session);
    }

    async deleteBySessionId(sessionId) {
        return this.rows.delete(sessionId) ? 1 : 0;
    }

    async deleteExpired(now = new Date()) {
        let removed = 0;
        for (const [id, row] of this.rows) {
            if (row.isExpired(now)) {
                this.rows.delete(id);
                removed++;
            }
        }
        return removed;
    }
}

module.exports = { InMemoryAuthorizationSessionRepository };
