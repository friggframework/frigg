const { AgentEventType } = require('../../domain/entities/agent-event');

class AgentStreamHandler {
    constructor({ io }) {
        this.io = io;
        this.sessions = new Map();
    }

    createSession({ socketId, userId = null }) {
        const id = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const session = {
            id,
            socketId,
            userId,
            status: 'active',
            createdAt: new Date(),
            events: []
        };

        this.sessions.set(id, session);
        return session;
    }

    getSession(id) {
        return this.sessions.get(id);
    }

    getSessions() {
        return Array.from(this.sessions.values());
    }

    emit(sessionId, event) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const eventData = {
            ...event.toJSON(),
            sessionId
        };

        session.events.push(event);

        this.io.to(session.socketId).emit('agent:event', eventData);

        if (event.type === AgentEventType.DONE) {
            session.status = 'completed';
            session.completedAt = new Date();
        } else if (event.type === AgentEventType.ERROR) {
            session.status = 'error';
            session.errorAt = new Date();
        }
    }

    createEventEmitter(sessionId) {
        return (event) => this.emit(sessionId, event);
    }

    pauseSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.status = 'paused';
        session.pausedAt = new Date();

        this.io.to(session.socketId).emit('agent:paused', {
            sessionId,
            timestamp: session.pausedAt
        });
    }

    resumeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.status = 'active';
        session.resumedAt = new Date();

        this.io.to(session.socketId).emit('agent:resumed', {
            sessionId,
            timestamp: session.resumedAt
        });
    }

    emitProposal(sessionId, proposal) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.status = 'awaiting_approval';
        session.currentProposal = proposal;

        this.io.to(session.socketId).emit('agent:proposal', {
            sessionId,
            proposal,
            timestamp: new Date()
        });
    }

    removeSession(sessionId) {
        this.sessions.delete(sessionId);
    }

    cleanupOldSessions({ maxAgeMinutes = 60 } = {}) {
        const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;

        for (const [id, session] of this.sessions) {
            if (session.status === 'completed' || session.status === 'error') {
                const completedTime = session.completedAt || session.errorAt;
                if (completedTime && completedTime.getTime() < cutoff) {
                    this.sessions.delete(id);
                }
            }
        }
    }
}

module.exports = { AgentStreamHandler };
