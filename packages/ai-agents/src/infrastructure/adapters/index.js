const { VercelAIAdapter, DEFAULT_CONFIG: VERCEL_DEFAULT_CONFIG, SUPPORTED_PROVIDERS } = require('./vercel-ai-adapter');
const { ClaudeAgentAdapter, DEFAULT_CONFIG: CLAUDE_DEFAULT_CONFIG } = require('./claude-agent-adapter');

module.exports = {
    VercelAIAdapter,
    ClaudeAgentAdapter,
    VERCEL_DEFAULT_CONFIG,
    CLAUDE_DEFAULT_CONFIG,
    SUPPORTED_PROVIDERS
};
