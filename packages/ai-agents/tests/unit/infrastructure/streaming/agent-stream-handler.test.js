const { AgentStreamHandler } = require('../../../../src/infrastructure/streaming/agent-stream-handler');
const { AgentEvent, AgentEventType } = require('../../../../src/domain/entities/agent-event');

describe('AgentStreamHandler', () => {
    let handler;
    let mockSocket;
    let mockIo;

    beforeEach(() => {
        mockSocket = {
            id: 'socket-123',
            emit: jest.fn(),
            join: jest.fn(),
            leave: jest.fn(),
            on: jest.fn()
        };

        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        };

        handler = new AgentStreamHandler({ io: mockIo });
    });

    describe('initialization', () => {
        it('should create handler with io instance', () => {
            expect(handler).toBeInstanceOf(AgentStreamHandler);
        });

        it('should track active sessions', () => {
            expect(handler.getSessions()).toEqual([]);
        });
    });

    describe('createSession', () => {
        it('should create a new streaming session', () => {
            const session = handler.createSession({
                socketId: 'socket-123',
                userId: 'user-456'
            });

            expect(session).toHaveProperty('id');
            expect(session).toHaveProperty('socketId', 'socket-123');
            expect(session).toHaveProperty('userId', 'user-456');
            expect(session).toHaveProperty('status', 'active');
        });

        it('should store session in registry', () => {
            const session = handler.createSession({
                socketId: 'socket-123',
                userId: 'user-456'
            });

            expect(handler.getSessions()).toContain(session);
        });
    });

    describe('emit', () => {
        it('should emit event to session socket', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.emit(session.id, AgentEvent.content('Hello'));

            expect(mockIo.to).toHaveBeenCalledWith('socket-123');
            expect(mockIo.emit).toHaveBeenCalledWith('agent:event', expect.objectContaining({
                type: 'content',
                content: 'Hello'
            }));
        });

        it('should include session id in event', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.emit(session.id, AgentEvent.content('Test'));

            expect(mockIo.emit).toHaveBeenCalledWith('agent:event', expect.objectContaining({
                sessionId: session.id
            }));
        });

        it('should emit tool call events', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.emit(session.id, AgentEvent.toolCall('frigg_validate_schema', { code: '...' }));

            expect(mockIo.emit).toHaveBeenCalledWith('agent:event', expect.objectContaining({
                type: 'tool_call',
                name: 'frigg_validate_schema'
            }));
        });

        it('should emit done events and update session status', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.emit(session.id, AgentEvent.done());

            expect(mockIo.emit).toHaveBeenCalledWith('agent:event', expect.objectContaining({
                type: 'done'
            }));

            const updatedSession = handler.getSession(session.id);
            expect(updatedSession.status).toBe('completed');
        });

        it('should emit error events and update session status', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.emit(session.id, AgentEvent.error(new Error('Test error')));

            expect(mockIo.emit).toHaveBeenCalledWith('agent:event', expect.objectContaining({
                type: 'error'
            }));

            const updatedSession = handler.getSession(session.id);
            expect(updatedSession.status).toBe('error');
        });
    });

    describe('createEventEmitter', () => {
        it('should return function that emits events for session', () => {
            const session = handler.createSession({ socketId: 'socket-123' });
            const emitter = handler.createEventEmitter(session.id);

            expect(typeof emitter).toBe('function');

            emitter(AgentEvent.content('Test'));

            expect(mockIo.emit).toHaveBeenCalled();
        });
    });

    describe('pause/resume', () => {
        it('should pause a session', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.pauseSession(session.id);

            const updated = handler.getSession(session.id);
            expect(updated.status).toBe('paused');
        });

        it('should emit pause event', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.pauseSession(session.id);

            expect(mockIo.emit).toHaveBeenCalledWith('agent:paused', expect.objectContaining({
                sessionId: session.id
            }));
        });

        it('should resume a paused session', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.pauseSession(session.id);
            handler.resumeSession(session.id);

            const updated = handler.getSession(session.id);
            expect(updated.status).toBe('active');
        });
    });

    describe('proposal handling', () => {
        it('should emit proposal for review', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            const proposal = {
                id: 'proposal-1',
                files: [{ path: 'test.js', content: '...' }],
                confidence: 85
            };

            handler.emitProposal(session.id, proposal);

            expect(mockIo.emit).toHaveBeenCalledWith('agent:proposal', expect.objectContaining({
                sessionId: session.id,
                proposal
            }));
        });

        it('should update session status to awaiting_approval', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.emitProposal(session.id, { id: 'p1', files: [], confidence: 90 });

            const updated = handler.getSession(session.id);
            expect(updated.status).toBe('awaiting_approval');
        });
    });

    describe('cleanup', () => {
        it('should remove session', () => {
            const session = handler.createSession({ socketId: 'socket-123' });

            handler.removeSession(session.id);

            expect(handler.getSession(session.id)).toBeUndefined();
        });

        it('should cleanup old sessions', () => {
            const session1 = handler.createSession({ socketId: 'socket-1' });
            const session2 = handler.createSession({ socketId: 'socket-2' });

            session1.completedAt = new Date(Date.now() - 1000 * 60 * 60);
            session1.status = 'completed';

            handler.cleanupOldSessions({ maxAgeMinutes: 30 });

            expect(handler.getSession(session1.id)).toBeUndefined();
            expect(handler.getSession(session2.id)).toBeDefined();
        });
    });
});
