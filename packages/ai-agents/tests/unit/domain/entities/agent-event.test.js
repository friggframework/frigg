const { AgentEvent, AgentEventType } = require('../../../../src/domain/entities/agent-event');

describe('AgentEvent Entity', () => {
    describe('event types', () => {
        it('should define all required event types', () => {
            expect(AgentEventType.CONTENT).toBe('content');
            expect(AgentEventType.TOOL_CALL).toBe('tool_call');
            expect(AgentEventType.TOOL_RESULT).toBe('tool_result');
            expect(AgentEventType.USAGE).toBe('usage');
            expect(AgentEventType.DONE).toBe('done');
            expect(AgentEventType.ERROR).toBe('error');
        });
    });

    describe('AgentEvent creation', () => {
        it('should create content event', () => {
            const event = AgentEvent.content('Hello, world');

            expect(event.type).toBe(AgentEventType.CONTENT);
            expect(event.content).toBe('Hello, world');
            expect(event.timestamp).toBeInstanceOf(Date);
        });

        it('should create tool_call event', () => {
            const event = AgentEvent.toolCall('frigg_validate_schema', { code: '...' });

            expect(event.type).toBe(AgentEventType.TOOL_CALL);
            expect(event.name).toBe('frigg_validate_schema');
            expect(event.args).toEqual({ code: '...' });
        });

        it('should create tool_result event', () => {
            const event = AgentEvent.toolResult('frigg_validate_schema', { valid: true });

            expect(event.type).toBe(AgentEventType.TOOL_RESULT);
            expect(event.name).toBe('frigg_validate_schema');
            expect(event.result).toEqual({ valid: true });
        });

        it('should create usage event', () => {
            const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
            const event = AgentEvent.usage(usage);

            expect(event.type).toBe(AgentEventType.USAGE);
            expect(event.usage).toEqual(usage);
        });

        it('should create done event', () => {
            const event = AgentEvent.done();

            expect(event.type).toBe(AgentEventType.DONE);
        });

        it('should create error event', () => {
            const error = new Error('Something went wrong');
            const event = AgentEvent.error(error);

            expect(event.type).toBe(AgentEventType.ERROR);
            expect(event.error).toBe(error);
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON', () => {
            const event = AgentEvent.content('test');
            const json = event.toJSON();

            expect(json).toHaveProperty('type', 'content');
            expect(json).toHaveProperty('content', 'test');
            expect(json).toHaveProperty('timestamp');
        });
    });
});
