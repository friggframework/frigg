# Frigg Framework Devtools

This package contains development tools and utilities for the Frigg Framework, an open-source serverless framework designed to simplify the development of integrations at scale.

## Contents

The devtools package includes the following main components:

1. Frigg CLI
2. Migrations
3. Test Utilities
4. Local runner and deploy tooling
5. Infrastructure

## Frigg CLI

The Frigg CLI is a command-line interface tool that helps developers manage and install API modules in their Frigg projects.

### Key Features

- Install API modules
- Search for available API modules
- Automatically update project files
- Handle environment variables
- Validate package existence and backend paths
- Run your Frigg instance locally
- Deploy your Frigg application to your configured provider

### Usage

To use the Frigg CLI, run the following command:
```sh
frigg install <api-module-name>
```

This command will search for the specified API module, install it, and update your project accordingly.

```sh
frigg start
```

This command will look for the closest infrastructure.js file and run a start command, programmatically generating the serverless yml needed to run locally.

## Migrations

(Add information about migrations here if available)

## Test Utilities

The test directory contains utilities to assist with testing in the Frigg Framework.

### Key Features

- Integration validator (TODO: implementation details to be added)
- Mock API functionality

### Mock API

The `mock-api.js` file provides functionality to mock API responses for testing purposes. It uses `nock` for HTTP request interception and includes features like:

- Caching of authentication tokens
- Recording and replaying of HTTP requests
- Jest test state management

Usage example:

```javascript
const { mockApi } = require('@friggframework/devtools/test/mock-api');

// Use mockApi in your tests to simulate API responses
```
## Installation

To install the devtools package as a dev dependency, run:

```
npm install --save-dev @friggframework/devtools
```

## Contributing

Please read [CONTRIBUTING.md](../../CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## License

This project is licensed under the MIT License - see the [LICENSE.md](../../LICENSE.md) file for details

## Support

For support, please open an issue in the main Frigg Framework repository or contact the maintainers directly.
