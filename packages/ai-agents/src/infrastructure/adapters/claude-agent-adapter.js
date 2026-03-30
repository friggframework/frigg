const { IAgentFramework } = require('../../domain/interfaces/agent-framework');
const { AgentEvent } = require('../../domain/entities/agent-event');

const DEFAULT_CONFIG = {
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.7
};

class ClaudeAgentAdapter extends IAgentFramework {
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.tools = [];
        this.approvalConfig = {
            requireApproval: true,
            confidenceThreshold: 80
        };
        this._paused = false;
    }

    getCapabilities() {
        return {
            streaming: true,
            toolCalling: true,
            mcpSupport: true,
            nativeMcp: true,
            multiProvider: false,
            providers: ['anthropic'],
            subagentOrchestration: true,
            contextWindow: 200000
        };
    }

    async loadMcpTools(serverConfig) {
        const { tools = [] } = serverConfig;

        this.tools = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema || { type: 'object', properties: {} },
            execute: tool.handler
        }));

        return this.tools;
    }

    createStreamingHandler(onEvent) {
        return {
            onContent: (text) => {
                onEvent(AgentEvent.content(text));
            },
            onToolCall: (name, args) => {
                onEvent(AgentEvent.toolCall(name, args));
            },
            onToolResult: (name, result) => {
                onEvent(AgentEvent.toolResult(name, result));
            },
            onFinish: (result) => {
                if (result?.usage) {
                    onEvent(AgentEvent.usage(result.usage));
                }
                onEvent(AgentEvent.done());
            },
            onError: (error) => {
                onEvent(AgentEvent.error(error));
            }
        };
    }

    buildSystemPrompt(context = {}) {
        const { integrationContext = '' } = context;

        return `You are an AI agent specialized in building integrations with the Frigg Framework.

You have access to Frigg-specific MCP tools that help you generate valid, secure code:

## Available Tools

- **frigg_validate_schema**: Validate JSON against Frigg schemas (app-definition, integration-definition, api-module-definition)
- **frigg_get_template**: Get starter templates for OAuth2, API key, or webhook integrations
- **frigg_check_patterns**: Verify code follows hexagonal architecture and IntegrationBase patterns
- **frigg_list_modules**: List available pre-built API modules (HubSpot, Salesforce, Slack, etc.)
- **frigg_security_scan**: Scan for hardcoded credentials, SQL injection, and other vulnerabilities
- **frigg_git_checkpoint**: Create rollback points before making changes
- **frigg_get_example**: Get working examples of common patterns

${integrationContext ? `\nCurrent context: ${integrationContext}` : ''}

## Required Patterns

All integrations must:
1. Extend IntegrationBase from @friggframework/core
2. Have static Definition property with name, version, modules, display
3. Implement: onCreate, onUpdate, onDelete, getConfigOptions, testAuth
4. Follow hexagonal architecture (ports and adapters)
5. Use environment variables for credentials

## Workflow

1. Start with frigg_git_checkpoint to enable rollback
2. Use frigg_get_template for initial structure
3. Customize based on requirements
4. Run frigg_check_patterns to verify structure
5. Run frigg_security_scan before finalizing
6. Run frigg_validate_schema for any JSON configs

Human approval is required for all generated code. Present proposals clearly with file paths, content, and confidence scores.`;
    }

    async runAgent(params) {
        await this.validateRunParams(params);

        const { prompt, context = {}, onEvent } = params;

        if (params.mock) {
            return {
                stream: this._mockResponse ? this._mockResponse() : this._createMockStream(),
                cancel: () => {}
            };
        }

        throw new Error('Claude Agent SDK not configured. Install "@anthropic-ai/claude-agent-sdk" and set ANTHROPIC_API_KEY.');
    }

    async *_createMockStream() {
        yield AgentEvent.content('Mock response - Claude Agent SDK not initialized');
        yield AgentEvent.done();
    }

    configureHumanApproval(config) {
        this.approvalConfig = { ...this.approvalConfig, ...config };
    }

    pause() {
        this._paused = true;
    }

    resume() {
        this._paused = false;
    }

    isPaused() {
        return this._paused;
    }
}

module.exports = { ClaudeAgentAdapter, DEFAULT_CONFIG };
