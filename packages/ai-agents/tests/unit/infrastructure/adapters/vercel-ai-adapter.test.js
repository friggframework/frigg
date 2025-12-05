const { VercelAIAdapter } = require('../../../../src/infrastructure/adapters/vercel-ai-adapter');
const { AgentEventType } = require('../../../../src/domain/entities/agent-event');

describe('VercelAIAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new VercelAIAdapter();
    });

    describe('initialization', () => {
        it('should create adapter with default config', () => {
            expect(adapter).toBeInstanceOf(VercelAIAdapter);
        });

        it('should accept custom model config', () => {
            const customAdapter = new VercelAIAdapter({
                model: 'gpt-4-turbo',
                provider: 'openai'
            });
            expect(customAdapter.config.model).toBe('gpt-4-turbo');
        });
    });

    describe('getCapabilities', () => {
        it('should return supported capabilities', () => {
            const caps = adapter.getCapabilities();

            expect(caps.streaming).toBe(true);
            expect(caps.toolCalling).toBe(true);
            expect(caps.mcpSupport).toBe(true);
            expect(caps.multiProvider).toBe(true);
        });

        it('should include supported providers list', () => {
            const caps = adapter.getCapabilities();

            expect(caps.providers).toContain('openai');
            expect(caps.providers).toContain('anthropic');
            expect(caps.providers).toContain('google');
        });
    });

    describe('validateRunParams', () => {
        it('should require prompt', async () => {
            await expect(adapter.validateRunParams({})).rejects.toThrow('prompt is required');
        });

        it('should accept valid params', async () => {
            const result = await adapter.validateRunParams({
                prompt: 'Create a HubSpot integration'
            });
            expect(result).toBe(true);
        });
    });

    describe('loadMcpTools', () => {
        it('should load tools from config', async () => {
            const tools = await adapter.loadMcpTools({
                tools: [
                    { name: 'frigg_validate_schema', handler: async () => ({}) }
                ]
            });

            expect(tools.length).toBe(1);
            expect(tools[0].name).toBe('frigg_validate_schema');
        });

        it('should convert to Vercel AI tool format', async () => {
            const tools = await adapter.loadMcpTools({
                tools: [
                    {
                        name: 'test_tool',
                        description: 'Test tool',
                        inputSchema: { type: 'object', properties: {} },
                        handler: async () => ({})
                    }
                ]
            });

            expect(tools[0]).toHaveProperty('description');
            expect(tools[0]).toHaveProperty('parameters');
        });
    });

    describe('createStreamingHandler', () => {
        it('should create handler that emits events', () => {
            const events = [];
            const handler = adapter.createStreamingHandler((event) => {
                events.push(event);
            });

            expect(typeof handler.onContent).toBe('function');
            expect(typeof handler.onToolCall).toBe('function');
            expect(typeof handler.onToolResult).toBe('function');
            expect(typeof handler.onFinish).toBe('function');
        });

        it('should emit content events', () => {
            const events = [];
            const handler = adapter.createStreamingHandler((event) => {
                events.push(event);
            });

            handler.onContent('Hello');
            handler.onContent(' world');

            expect(events.length).toBe(2);
            expect(events[0].type).toBe(AgentEventType.CONTENT);
            expect(events[0].content).toBe('Hello');
        });

        it('should emit tool call events', () => {
            const events = [];
            const handler = adapter.createStreamingHandler((event) => {
                events.push(event);
            });

            handler.onToolCall('frigg_validate_schema', { code: '...' });

            expect(events[0].type).toBe(AgentEventType.TOOL_CALL);
            expect(events[0].name).toBe('frigg_validate_schema');
        });

        it('should emit done event on finish', () => {
            const events = [];
            const handler = adapter.createStreamingHandler((event) => {
                events.push(event);
            });

            handler.onFinish({ usage: { promptTokens: 100, completionTokens: 50 } });

            expect(events.some(e => e.type === AgentEventType.USAGE)).toBe(true);
            expect(events.some(e => e.type === AgentEventType.DONE)).toBe(true);
        });
    });

    describe('buildSystemPrompt', () => {
        it('should include Frigg context', () => {
            const prompt = adapter.buildSystemPrompt({
                integrationContext: 'Building HubSpot integration'
            });

            expect(prompt).toContain('Frigg');
            expect(prompt).toContain('HubSpot');
        });

        it('should include validation instructions', () => {
            const prompt = adapter.buildSystemPrompt({});

            expect(prompt).toContain('validation');
            expect(prompt.toLowerCase()).toContain('test');
        });
    });

    describe('runAgent (mock)', () => {
        it('should validate params before running', async () => {
            await expect(adapter.runAgent({})).rejects.toThrow('prompt is required');
        });

        it('should return generator for streaming', async () => {
            const mockAdapter = new VercelAIAdapter({ skipApiCheck: true });
            mockAdapter._mockResponse = async function* () {
                yield { type: 'content', content: 'Test response' };
                yield { type: 'done' };
            };

            const params = { prompt: 'Test prompt', mock: true };
            const result = await mockAdapter.runAgent(params);

            expect(result).toHaveProperty('stream');
        });
    });
});
