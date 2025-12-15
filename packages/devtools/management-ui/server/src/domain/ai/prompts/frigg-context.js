/**
 * Frigg Framework Context - Core Knowledge Base
 *
 * Central repository for Frigg framework knowledge that gets injected into
 * AI agents. This ensures consistent, accurate framework guidance across
 * all agentic interactions.
 */

/**
 * Core framework concepts and architecture
 */
export const FRIGG_CORE_CONCEPTS = `
## Frigg Framework Overview

Frigg is an enterprise-grade serverless integration framework for Node.js that enables
rapid development of native integrations between products and external software partners.

### Core Value Proposition
- Spin up integrations in minutes
- Deploy to production in a day
- Framework handles infrastructure, developers focus on integration logic

### Deployment Architecture
- AWS Lambda with serverless framework
- Docker Compose for local development
- MongoDB or PostgreSQL via Prisma ORM
- Field-level encryption via AWS KMS

### Key Principles
- No vendor lock-in solutions
- Security-first with encryption patterns
- Opinionated structure for enterprise integrations
- Clean architecture with hexagonal patterns
`

/**
 * Integration structure and patterns
 */
export const FRIGG_INTEGRATION_PATTERNS = `
## Integration Development Patterns

### Integration Base Class
All integrations extend \`IntegrationBase\` with standardized methods:

\`\`\`javascript
class MyIntegration extends IntegrationBase {
  // Authentication & OAuth flow
  async authRequest(params) { /* Handle OAuth */ }

  // Dynamic form generation (Asana-style)
  async loadForm(params) { /* Generate forms */ }

  // Process form submissions
  async onFormSubmit(params) { /* Handle submissions */ }

  // Webhook event handling
  async onchange(params) { /* Process webhooks */ }

  // Background job processing
  async processJob(job) { /* Async processing */ }
}
\`\`\`

### OAuth2 Implementation Pattern
\`\`\`javascript
const oauth = {
  authorizationUrl: 'https://api.example.com/oauth/authorize',
  tokenUrl: 'https://api.example.com/oauth/token',
  scopes: ['read', 'write']
}
\`\`\`

### Webhook Security Pattern
- HMAC signature validation on all webhook endpoints
- Request expiration validation (prevent replay attacks)
- Stateless CSRF protection for OAuth flows
`

/**
 * File structure and project layout
 */
export const FRIGG_PROJECT_STRUCTURE = `
## Project Structure

### Standard Frigg Project Layout
\`\`\`
my-frigg-app/
├── backend/
│   ├── src/
│   │   ├── integrations/          # Custom integrations
│   │   │   └── my-integration/
│   │   │       ├── definition.js  # Integration class
│   │   │       ├── api.js         # API client wrapper
│   │   │       └── config.js      # Configuration
│   │   ├── api-modules/           # Installed API modules
│   │   ├── routes/                # Custom routes
│   │   └── app-definition.js      # Main app configuration
│   ├── serverless.yml             # Serverless deployment config
│   └── package.json
├── frontend/                      # Optional frontend
└── package.json
\`\`\`

### Key Files
- \`app-definition.js\` - Main configuration driving infrastructure generation
- \`definition.js\` - Integration class extending IntegrationBase
- \`api.js\` - HTTP client wrapper for external API
- \`config.js\` - Configuration management
`

/**
 * Available API modules
 */
export const FRIGG_API_MODULES = `
## API Module Library

Pre-built integrations available via \`frigg install <module>\`:

### CRM Systems
- HubSpot (\`frigg install hubspot\`)
- Salesforce (\`frigg install salesforce\`)
- Pipedrive (\`frigg install pipedrive\`)
- Copper (\`frigg install copper\`)
- Zoho CRM (\`frigg install zoho-crm\`)

### Communication
- Slack (\`frigg install slack\`)
- Microsoft Teams (\`frigg install microsoft-teams\`)
- Discord (\`frigg install discord\`)
- Twilio (\`frigg install twilio\`)

### Project Management
- Asana (\`frigg install asana\`)
- Monday.com (\`frigg install monday\`)
- Trello (\`frigg install trello\`)
- Jira (\`frigg install jira\`)
- Linear (\`frigg install linear\`)
- ClickUp (\`frigg install clickup\`)

### Storage & Files
- Google Drive (\`frigg install google-drive\`)
- Dropbox (\`frigg install dropbox\`)
- Box (\`frigg install box\`)
- OneDrive (\`frigg install onedrive\`)

### Marketing & Email
- Mailchimp (\`frigg install mailchimp\`)
- SendGrid (\`frigg install sendgrid\`)
- ActiveCampaign (\`frigg install activecampaign\`)

### E-commerce & Payments
- Stripe (\`frigg install stripe\`)
- Shopify (\`frigg install shopify\`)
- Square (\`frigg install square\`)

### Productivity
- Notion (\`frigg install notion\`)
- Airtable (\`frigg install airtable\`)
- Google Sheets (\`frigg install google-sheets\`)

Use \`frigg search <term>\` to find modules.
`

/**
 * DDD and Hexagonal Architecture patterns
 */
export const FRIGG_ARCHITECTURE_PATTERNS = `
## Domain-Driven Design & Hexagonal Architecture

The Frigg Framework follows DDD and Hexagonal Architecture principles for clean separation of concerns.

### Architecture Layers

\`\`\`
┌─────────────────────────────────────────────────────────┐
│ Adapter Layer (Handlers/Routers)                        │
│  - HTTP request/response handling                       │
│  - Route definitions, status code mapping               │
│  - ONLY calls use cases                                 │
└────────────────┬────────────────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────────────────┐
│ Application Layer (Use Cases)                           │
│  - Business logic orchestration                         │
│  - Workflow coordination                                │
│  - Business rules and validation                        │
│  - Calls repositories for data access                   │
└────────────────┬────────────────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────────────────┐
│ Infrastructure Layer (Repositories)                     │
│  - Pure database operations (CRUD)                      │
│  - External API calls                                   │
│  - NO business logic                                    │
└────────────────┬────────────────────────────────────────┘
                 │ accesses
┌────────────────▼────────────────────────────────────────┐
│ External Systems (DB, APIs, File System)                │
└─────────────────────────────────────────────────────────┘
\`\`\`

### Repository Pattern (Infrastructure Layer)
\`\`\`javascript
// Pure data access - NO business logic
class IntegrationRepository {
  async findById(id) {
    return await this.db.integrations.findUnique({ where: { id } })
  }

  async save(integration) {
    return await this.db.integrations.upsert({
      where: { id: integration.id },
      create: integration,
      update: integration
    })
  }
}
\`\`\`

### Use Case Pattern (Application Layer)
\`\`\`javascript
// Business logic and orchestration
class CreateIntegrationUseCase {
  constructor({ integrationRepository, validator }) {
    this.repository = integrationRepository
    this.validator = validator
  }

  async execute({ name, type, config }) {
    // Business validation
    this.validator.validate({ name, type, config })

    // Business logic
    const integration = Integration.create({ name, type, config })

    // Orchestration
    await this.repository.save(integration)

    return integration
  }
}
\`\`\`

### Handler Pattern (Adapter Layer)
\`\`\`javascript
// HTTP concerns only - delegates to use cases
router.post('/integrations', async (req, res) => {
  const result = await createIntegrationUseCase.execute(req.body)
  res.status(201).json({ data: result })
})
\`\`\`

### Golden Rule
> "Handlers ONLY call Use Cases, NEVER Repositories or Business Logic directly"

\`\`\`
Handler → Use Case → Repository → Database
         ↑
         Business logic lives HERE
\`\`\`
`

/**
 * Test-Driven Development patterns
 */
export const FRIGG_TDD_PATTERNS = `
## Test-Driven Development (TDD)

Frigg follows TDD principles - write tests BEFORE implementation.

### TDD Workflow (Red-Green-Refactor)

1. **RED**: Write a failing test first
\`\`\`javascript
describe('CreateIntegrationUseCase', () => {
  it('should create integration with valid config', async () => {
    const useCase = new CreateIntegrationUseCase({ repository, validator })

    const result = await useCase.execute({
      name: 'My Integration',
      type: 'hubspot',
      config: { clientId: 'xxx' }
    })

    expect(result.id).toBeDefined()
    expect(result.name).toBe('My Integration')
  })
})
\`\`\`

2. **GREEN**: Write minimal code to pass
3. **REFACTOR**: Improve code while keeping tests green

### Test Categories

#### Unit Tests (Fast, Isolated)
\`\`\`javascript
// Test use cases with mocked repositories
const mockRepository = {
  save: vi.fn().mockResolvedValue({ id: '123' }),
  findById: vi.fn()
}
const useCase = new CreateIntegrationUseCase({
  repository: mockRepository
})
\`\`\`

#### Integration Tests (Real Dependencies)
\`\`\`javascript
// Test with real database
describe('IntegrationRepository', () => {
  beforeEach(async () => {
    await db.integrations.deleteMany()
  })

  it('should persist integration', async () => {
    const repo = new IntegrationRepository(db)
    await repo.save(testIntegration)
    const found = await repo.findById(testIntegration.id)
    expect(found).toMatchObject(testIntegration)
  })
})
\`\`\`

#### End-to-End Tests (Full Flow)
\`\`\`javascript
// Test complete API flow
describe('POST /api/integrations', () => {
  it('should create integration via API', async () => {
    const response = await request(app)
      .post('/api/integrations')
      .send({ name: 'Test', type: 'hubspot' })

    expect(response.status).toBe(201)
    expect(response.body.data.id).toBeDefined()
  })
})
\`\`\`

### What to Test

✅ Test business logic in use cases
✅ Test repository operations
✅ Test edge cases and error paths
✅ Test OAuth flows with mocked responses
✅ Test webhook signature validation

❌ Don't test framework code
❌ Don't test simple getters/setters
❌ Don't test third-party libraries
`

/**
 * Best practices and guidelines
 */
export const FRIGG_BEST_PRACTICES = `
## Development Best Practices

### Security
- Use the encryption system for ALL sensitive data
- Never hardcode credentials or API keys
- Implement proper webhook signature validation
- Deploy Lambda functions in private VPC subnets

### Architecture (DDD/Hexagonal)
- **Handlers**: HTTP concerns only, call use cases
- **Use Cases**: Business logic and orchestration
- **Repositories**: Pure data access, no business logic
- **Domain Entities**: Business rules and validation
- Use dependency injection for testability

### Code Quality
- Files should be under 500 lines
- Write tests BEFORE implementation (TDD)
- Use proper error handling with domain-specific errors
- Follow existing patterns in the codebase

### Integration Development
1. Start with \`create-frigg-app\` for consistent structure
2. Use existing API modules when possible
3. Follow IntegrationBase method contracts
4. Test OAuth flows with real credentials in development
5. Validate infrastructure templates before deployment

### Performance
- Use provisioned concurrency for critical Lambda functions
- Implement proper database connection pooling
- Cache frequently accessed data appropriately
- Monitor and optimize cold start times
- Use VPC endpoints to reduce NAT Gateway costs
`

/**
 * CLI commands reference
 */
export const FRIGG_CLI_COMMANDS = `
## Frigg CLI Commands

### Project Creation
\`\`\`bash
npx create-frigg-app my-project
\`\`\`

### Module Management
\`\`\`bash
frigg install <module>      # Install API module
frigg search <term>         # Search available modules
frigg list                  # List installed modules
\`\`\`

### Development
\`\`\`bash
frigg start                 # Start local server with hot reload
npm test                    # Run tests
frigg generate              # Generate integration scaffolding
\`\`\`

### Deployment
\`\`\`bash
frigg deploy --stage dev    # Deploy to development
frigg deploy --stage prod   # Deploy to production
frigg destroy --stage dev   # Remove deployment
\`\`\`
`

/**
 * Combine all context into a complete system prompt
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeModules - Include API modules list
 * @param {boolean} options.includeCLI - Include CLI commands
 * @param {boolean} options.includeArchitecture - Include DDD/Hexagonal patterns
 * @param {boolean} options.includeTDD - Include TDD patterns
 * @param {string} options.projectPath - Current project path
 */
export function buildFriggSystemPrompt(options = {}) {
  const {
    includeModules = true,
    includeCLI = true,
    includeArchitecture = true,
    includeTDD = true,
    projectPath = null
  } = options

  let prompt = `You are an AI assistant helping to build integrations using the Frigg Framework.

${FRIGG_CORE_CONCEPTS}

${FRIGG_INTEGRATION_PATTERNS}

${FRIGG_PROJECT_STRUCTURE}
`

  if (includeArchitecture) {
    prompt += `\n${FRIGG_ARCHITECTURE_PATTERNS}\n`
  }

  if (includeTDD) {
    prompt += `\n${FRIGG_TDD_PATTERNS}\n`
  }

  if (includeModules) {
    prompt += `\n${FRIGG_API_MODULES}\n`
  }

  prompt += `\n${FRIGG_BEST_PRACTICES}\n`

  if (includeCLI) {
    prompt += `\n${FRIGG_CLI_COMMANDS}\n`
  }

  prompt += `
## Instructions for Code Generation

When generating code:
- Follow existing patterns in the codebase
- Write tests BEFORE implementation (TDD)
- Follow DDD/Hexagonal architecture patterns
- Use proper error handling
- Include appropriate comments
- Respect the framework's security patterns
- Never bypass encryption for sensitive data
- Use the job queue for background processing
- Handlers call Use Cases, never Repositories directly
- Use dependency injection for all services
`

  if (projectPath) {
    prompt += `\nCurrent working directory: ${projectPath}\nExplore the project structure before making changes.\n`
  }

  return prompt
}

/**
 * Get a minimal context for simple queries
 */
export function getMinimalFriggContext() {
  return `${FRIGG_CORE_CONCEPTS}\n${FRIGG_PROJECT_STRUCTURE}`
}

/**
 * Get context focused on a specific topic
 * @param {string} topic - The topic to focus on
 */
export function getTopicFocusedContext(topic) {
  const topicMap = {
    'integration': `${FRIGG_CORE_CONCEPTS}\n${FRIGG_INTEGRATION_PATTERNS}\n${FRIGG_PROJECT_STRUCTURE}`,
    'modules': `${FRIGG_CORE_CONCEPTS}\n${FRIGG_API_MODULES}`,
    'cli': `${FRIGG_CLI_COMMANDS}`,
    'security': `${FRIGG_CORE_CONCEPTS}\n${FRIGG_BEST_PRACTICES}`,
    'architecture': `${FRIGG_CORE_CONCEPTS}\n${FRIGG_PROJECT_STRUCTURE}\n${FRIGG_BEST_PRACTICES}`
  }

  return topicMap[topic] || buildFriggSystemPrompt()
}

export default {
  FRIGG_CORE_CONCEPTS,
  FRIGG_INTEGRATION_PATTERNS,
  FRIGG_PROJECT_STRUCTURE,
  FRIGG_API_MODULES,
  FRIGG_ARCHITECTURE_PATTERNS,
  FRIGG_TDD_PATTERNS,
  FRIGG_BEST_PRACTICES,
  FRIGG_CLI_COMMANDS,
  buildFriggSystemPrompt,
  getMinimalFriggContext,
  getTopicFocusedContext
}
