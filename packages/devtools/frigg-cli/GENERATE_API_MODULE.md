# Frigg API Module Generator

The Frigg CLI now includes a powerful API module generator that can create standardized API modules in minutes instead of hours.

## Installation

From the frigg repository:
```bash
cd packages/devtools/frigg-cli
npm link
```

## Usage

### Basic Usage
```bash
frigg generate api-module stripe
```

### With Custom Path
```bash
frigg generate api-module sendgrid --path /path/to/api-module-library/packages/sendgrid
```

### With OpenAPI Specification
```bash
frigg generate api-module twilio --from-spec https://api.twilio.com/openapi.json
```

### Specifying Auth Type
```bash
frigg generate api-module datadog --auth apiKey
```

## Interactive Prompts

The generator will ask for:
- **Display Name**: Human-readable name (e.g., "Stripe")
- **Base API URL**: The API's base URL (e.g., "https://api.stripe.com")
- **Authentication Type**: OAuth2, API Key, Basic Auth, or Custom
- **Category**: API category for organization (e.g., "Payment", "Communication")
- **OpenAPI Spec**: Optional URL to OpenAPI/Swagger specification

## Generated Structure

```
module-name/
├── index.js              # Module entry point
├── api.js                # API client implementation
├── definition.js         # Authentication configuration
├── defaultConfig.json    # Module metadata
├── package.json          # NPM package configuration
├── jest.config.js        # Jest testing configuration
├── jest-setup.js         # Test setup
├── jest-teardown.js      # Test teardown
├── .eslintrc.json        # ESLint configuration
├── .env.example          # Environment variables template
├── README.md             # Module documentation
└── test/
    ├── api.test.js       # API tests
    └── definition.test.js # Definition tests
```

## Features

### 1. **Smart Templates**
- Automatically generates appropriate auth flow based on type
- Includes all required Frigg framework integrations
- Follows established patterns from existing modules

### 2. **OpenAPI Integration** (Coming Soon)
- Fetches OpenAPI/Swagger specifications
- Auto-generates API methods from spec
- Creates typed interfaces for TypeScript

### 3. **Environment Configuration**
- Generates .env.example with all required variables
- Follows naming conventions (MODULE_CLIENT_ID, etc.)
- Includes documentation for each variable

### 4. **Test Framework**
- Jest configuration with coverage
- Authentication test helpers
- Example test cases for common operations

### 5. **Documentation**
- Auto-generated README with usage examples
- API method documentation
- Configuration instructions

## Authentication Types

### OAuth 2.0
- Full OAuth flow implementation
- Token refresh handling
- Scope management

### API Key
- Simple API key authentication
- Header/query parameter configuration
- Key rotation support

### Basic Auth
- Username/password authentication
- Base64 encoding
- Session management

### Custom
- Template for custom authentication
- Extensible architecture
- Full control over auth flow

## Best Practices

1. **Use OpenAPI Specs**: When available, always provide the OpenAPI URL for automatic endpoint generation
2. **Follow Naming**: Use lowercase with hyphens (e.g., `google-drive`, not `GoogleDrive`)
3. **Test Early**: Run tests immediately after generation to ensure setup is correct
4. **Update Documentation**: Enhance the generated README with specific examples

## Extending the Generator

The generator is designed to be extensible. To add new features:

1. Edit `/packages/devtools/frigg-cli/generate-api-module-command.js`
2. Add new templates to the `TEMPLATE_FILES` object
3. Extend prompts for additional configuration
4. Submit a PR with your improvements

## Performance

- **Manual Creation**: 2-4 hours per module
- **With Generator**: 2-5 minutes per module
- **Efficiency Gain**: 95%+ time reduction

## Future Enhancements

1. **TypeScript Support**: Generate TypeScript definitions
2. **GraphQL Support**: Handle GraphQL APIs
3. **Webhook Templates**: Include webhook handling
4. **Rate Limiting**: Built-in rate limit handling
5. **Batch Generation**: Generate multiple modules at once
6. **AI Enhancement**: Use AI to improve naming and documentation

## Troubleshooting

### Module Already Exists
The generator will ask if you want to overwrite. Choose carefully as this will delete existing code.

### Missing Dependencies
Run `npm install` in the generated module directory to install all dependencies.

### Environment Variables
Copy `.env.example` to `.env` and fill in your actual API credentials.

## Contributing

To improve the generator:
1. Fork the frigg repository
2. Make your changes to the generator
3. Test with several different API types
4. Submit a PR with examples

## Examples

### Generate Stripe Module
```bash
frigg generate api-module stripe \
  --auth oauth2 \
  --from-spec https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json
```

### Generate SendGrid Module
```bash
frigg generate api-module sendgrid \
  --auth apiKey \
  --path ../api-module-library/packages/sendgrid
```

### Generate Slack Module
```bash
frigg generate api-module slack \
  --auth oauth2
# Then answer:
# Display name: Slack
# Base URL: https://slack.com/api
# Category: Communication
```

This generator significantly accelerates the development of new API modules while ensuring consistency and quality across the entire library.