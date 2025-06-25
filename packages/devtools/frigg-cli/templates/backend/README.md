# Frigg Backend Application

This is a Frigg backend application initialized with the Frigg CLI. It provides a serverless API backend with integration capabilities.

## Features

- **Serverless Framework** for AWS Lambda deployment
- **Express.js** API with pre-configured routes
- **Integration Framework** with sample HubSpot integration
- **OAuth 2.0** authorization flow support
- **Jest** testing setup
- **Docker Compose** for local development

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start local services** (MongoDB):
   ```bash
   npm run docker:start
   ```

3. **Run the backend locally**:
   ```bash
   npm run backend-start
   ```

   The API will be available at `http://localhost:3001`

## Available Scripts

- `npm run backend-start` - Start the backend locally (dev stage)
- `npm run backend-start:staging` - Start the backend locally (staging stage)
- `npm test` - Run tests (excluding interactive and live API tests)
- `npm run test:full` - Run all tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix linting issues
- `npm run docker:start` - Start Docker services
- `npm run docker:stop` - Stop Docker services

## Project Structure

```
├── src/
│   ├── integrations/     # Integration modules
│   ├── routers/          # API routes
│   └── utils/            # Utility functions
├── test/                 # Test files
├── serverless.yml        # Serverless configuration
├── package.json          # Dependencies and scripts
├── docker-compose.yml    # Docker services
└── webpack.config.js     # Webpack configuration
```

## API Routes

- `GET /api/integrations` - List integrations
- `POST /api/integrations` - Create integration
- `GET /api/authorize` - OAuth authorization
- `GET /user/*` - User endpoints
- `GET /api/demo/sample/*` - Demo endpoints

## Environment Variables

Create a `.env` file in the root directory:

```env
STAGE=dev
# Add your environment variables here
```

## Deployment

To deploy to AWS:

```bash
npx serverless deploy --stage production
```

## Testing

Run the test suite:

```bash
npm test
```

For full testing including live API tests:

```bash
npm run test:full
```

## Adding New Integrations

To add a new integration:

```bash
frigg install <api-module-name>
```

For example:
```bash
frigg install salesforce
```

## Documentation

For more information, visit the [Frigg Framework Documentation](https://docs.friggframework.org/).

## Support

For help and support, visit our [GitHub Repository](https://github.com/friggframework/frigg).