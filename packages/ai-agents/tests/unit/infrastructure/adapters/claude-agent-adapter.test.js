const { ClaudeAgentAdapter } = require('../../../../src/infrastructure/adapters/claude-agent-adapter');
const { AgentEventType } = require('../../../../src/domain/entities/agent-event');

describe('ClaudeAgentAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new ClaudeAgentAdapter();
    });

    describe('initialization', () => {
        it('should create adapter with default config', () => {
            expect(adapter).toBeInstanceOf(ClaudeAgentAdapter);
        });

        it('should accept custom model config', () => {
            const customAdapter = new ClaudeAgentAdapter({
                model: 'claude-3-5-sonnet-20241022'
            });
            expect(customAdapter.config.model).toBe('claude-3-5-sonnet-20241022');
        });
    });

    describe('getCapabilities', () => {
        it('should return supported capabilities', () => {
            const caps = adapter.getCapabilities();

            expect(caps.streaming).toBe(true);
            expect(caps.toolCalling).toBe(true);
            expect(caps.mcpSupport).toBe(true);
            expect(caps.nativeMcp).toBe(true);
        });

        it('should indicate single provider (anthropic)', () => {
            const caps = adapter.getCapabilities();

            expect(caps.providers).toEqual(['anthropic']);
            expect(caps.multiProvider).toBe(false);
        });

        it('should support subagent orchestration', () => {
            const caps = adapter.getCapabilities();

            expect(caps.subagentOrchestration).toBe(true);
        });
    });

    describe('validateRunParams', () => {
        it('should require prompt', async () => {
            await expect(adapter.validateRunParams({})).rejects.toThrow('prompt is required');
        });

        it('should accept valid params', async () => {
            const result = await adapter.validateRunParams({
                prompt: 'Create a Salesforce integration'
            });
            expect(result).toBe(true);
        });
    });

    describe('loadMcpTools', () => {
        it('should load native MCP tools', async () => {
            const tools = await adapter.loadMcpTools({
                tools: [
                    { name: 'frigg_validate_schema', handler: async () => ({}) }
                ]
            });

            expect(tools.length).toBe(1);
        });

        it('should preserve native MCP format', async () => {
            const tools = await adapter.loadMcpTools({
                tools: [
                    {
                        name: 'frigg_check_patterns',
                        description: 'Check patterns',
                        inputSchema: {
                            type: 'object',
                            required: ['code'],
                            properties: { code: { type: 'string' } }
                        },
                        handler: async () => ({})
                    }
                ]
            });

            expect(tools[0].inputSchema).toBeDefined();
            expect(tools[0].inputSchema.type).toBe('object');
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

            handler.onContent('Building integration');

            expect(events[0].type).toBe(AgentEventType.CONTENT);
            expect(events[0].content).toBe('Building integration');
        });

        it('should emit tool events', () => {
            const events = [];
            const handler = adapter.createStreamingHandler((event) => {
                events.push(event);
            });

            handler.onToolCall('frigg_get_template', { type: 'oauth2', name: 'hubspot' });
            handler.onToolResult('frigg_get_template', { template: '...' });

            expect(events[0].type).toBe(AgentEventType.TOOL_CALL);
            expect(events[1].type).toBe(AgentEventType.TOOL_RESULT);
        });
    });

    describe('buildSystemPrompt', () => {
        it('should include Frigg-specific context', () => {
            const prompt = adapter.buildSystemPrompt({
                integrationContext: 'Building Stripe integration'
            });

            expect(prompt).toContain('Frigg');
            expect(prompt).toContain('Stripe');
        });

        it('should include architecture patterns', () => {
            const prompt = adapter.buildSystemPrompt({});

            expect(prompt).toContain('IntegrationBase');
            expect(prompt).toContain('hexagonal');
        });

        it('should include MCP tool guidance', () => {
            const prompt = adapter.buildSystemPrompt({});

            expect(prompt).toContain('frigg_validate_schema');
            expect(prompt).toContain('frigg_check_patterns');
        });
    });

    describe('configureHumanApproval', () => {
        it('should set approval requirements', () => {
            adapter.configureHumanApproval({
                requireApproval: true,
                confidenceThreshold: 95
            });

            expect(adapter.approvalConfig.requireApproval).toBe(true);
            expect(adapter.approvalConfig.confidenceThreshold).toBe(95);
        });

        it('should default to requiring review', () => {
            expect(adapter.approvalConfig.requireApproval).toBe(true);
        });
    });

    describe('pause/resume for HITL', () => {
        it('should support pausing agent execution', () => {
            expect(typeof adapter.pause).toBe('function');
            expect(typeof adapter.resume).toBe('function');
        });

        it('should track pause state', () => {
            expect(adapter.isPaused()).toBe(false);
            adapter.pause();
            expect(adapter.isPaused()).toBe(true);
            adapter.resume();
            expect(adapter.isPaused()).toBe(false);
        });
    });

    describe('runAgent (mock)', () => {
        it('should validate params before running', async () => {
            await expect(adapter.runAgent({})).rejects.toThrow('prompt is required');
        });
    });
});
