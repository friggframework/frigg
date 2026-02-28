const AgentEventType = {
    CONTENT: 'content',
    TOOL_CALL: 'tool_call',
    TOOL_RESULT: 'tool_result',
    USAGE: 'usage',
    DONE: 'done',
    ERROR: 'error'
};

class AgentEvent {
    constructor({ type, timestamp = new Date(), ...data }) {
        this.type = type;
        this.timestamp = timestamp;
        Object.assign(this, data);
    }

    static content(text) {
        return new AgentEvent({ type: AgentEventType.CONTENT, content: text });
    }

    static toolCall(name, args) {
        return new AgentEvent({ type: AgentEventType.TOOL_CALL, name, args });
    }

    static toolResult(name, result) {
        return new AgentEvent({ type: AgentEventType.TOOL_RESULT, name, result });
    }

    static usage(usage) {
        return new AgentEvent({ type: AgentEventType.USAGE, usage });
    }

    static done() {
        return new AgentEvent({ type: AgentEventType.DONE });
    }

    static error(error) {
        return new AgentEvent({ type: AgentEventType.ERROR, error });
    }

    toJSON() {
        return {
            type: this.type,
            timestamp: this.timestamp.toISOString(),
            ...(this.content && { content: this.content }),
            ...(this.name && { name: this.name }),
            ...(this.args && { args: this.args }),
            ...(this.result && { result: this.result }),
            ...(this.usage && { usage: this.usage }),
            ...(this.error && { error: this.error.message || String(this.error) })
        };
    }
}

module.exports = { AgentEvent, AgentEventType };
