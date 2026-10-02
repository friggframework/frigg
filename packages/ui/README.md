# Frigg UI Package

## Overview

The Frigg UI package provides a set of reusable and self-contained components for managing integrations in any React application. This package is designed to ensure flexibility and reusability across different projects, allowing seamless integration management with minimal effort.

## Features

1. IntegrationList component to automatically find and list all integrations configured in your Frigg Application
2. QuickActions for menu options corresponding to UserAction model inside Frigg's integration model

### Self-Contained Components
Each exported component is self-contained, meaning that by passing the correct properties, users can manage their integrations effortlessly from any app.

### Base Components
This initial iteration includes a set of base components built with ShadCn, ensuring a consistent and modern UI.

## Benefits
- **Reusability**: The package can be reused across different projects, reducing duplicative code and ensuring consistency in UI and integration management.
- **Flexibility**: The self-contained nature of the components allows for easy customization and integration into existing applications.

## Installation

To install the Frigg UI package, use the following command:

```bash
npm install @friggframework/ui
```

## Usage

To use these components in your React application, you can import them as follows:

### Example
```javascript
import { Button, IntegrationList } from '@friggframework/ui';
```

## Contribution

We welcome contributions to the Frigg UI package. Please feel free to submit issues or pull requests.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
