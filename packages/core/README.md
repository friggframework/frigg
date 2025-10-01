# Frigg Core

The `frigg-core` package is the heart of the Frigg Framework. It contains the core functionality and essential modules required to build and maintain integrations at scale.


## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Modules](#modules)
- [Contributing](#contributing)
- [License](#license)

## Introduction

The Frigg Core package provides the foundational components and utilities for the Frigg Framework. It is designed to be modular, extensible, and easy to integrate with other packages in the Frigg ecosystem.

## Features

- **Associations**: Manage relationships between different entities.
- **Database**: Database utilities and connectors.
- **Encryption**: Secure data encryption and decryption.
- **Error Handling**: Standardized error handling mechanisms.
- **Integrations**: Tools for building and managing integrations.
- **Lambda**: Utilities for AWS Lambda functions.
- **Logging**: Structured logging utilities.
- **Module Plugin**: Plugin system for extending core functionality.
- **Syncs**: Synchronization utilities for data consistency.
- **Infrastructure**: Frigg reads through your integration definitions and auto-generates the infrastructure your code needs to run smoothly.

## Installation

To install the `frigg-core` package, use npm or yarn:

```sh
npm install @friggframework/core
# or
yarn add @friggframework/core
```
## Usage
Here's a basic example of how to use the frigg-core package:
```javascript
const { encrypt, decrypt } = require('@friggframework/core/encrypt');
const { logInfo } = require('@friggframework/core/logs');

const secret = 'mySecret';
const encrypted = encrypt(secret);
const decrypted = decrypt(encrypted);

logInfo(`Encrypted: ${encrypted}`);
logInfo(`Decrypted: ${decrypted}`);
```

## Modules

The frigg-core package is organized into several modules:

- **Associations**: @friggframework/core/associations
- **Database**: @friggframework/core/database
- **Encryption**: @friggframework/core/encrypt
- **Errors**: @friggframework/core/errors
- **Integrations**: @friggframework/core/integrations
- **Lambda**: @friggframework/core/lambda
- **Logs**: @friggframework/core/logs
- **Module Plugin**: @friggframework/core/module-plugin
- **Syncs**: @friggframework/core/syncs
- **Infrastructure**: @friggframework/core/infrastructure


Each module provides specific functionality and can be imported individually as needed.

## Contributing

We welcome contributions from the community! Please read our contributing guide to get started. Make sure to follow our code of conduct and use the provided pull request template.

## License

This project is licensed under the MIT License. See the LICENSE.md file for details.

---
Thank you for using Frigg Core! If you have any questions or need further assistance, feel free to reach out to our community on Slack or check out our GitHub issues page.
