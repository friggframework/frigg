# Authorization Mocks

Schema-compliant mock data generators for testing authentication and authorization flows across the Frigg Framework.

## Purpose

These mocks ensure consistency across all Frigg packages:
- `@friggframework/core` - Backend authorization logic
- `@friggframework/ui` - Frontend integration components
- `@friggframework/devtools/management-ui` - Developer tooling

All mock data is **validated against canonical JSON schemas** to guarantee accuracy.

## Installation

```bash
npm install @friggframework/schemas
```

## Usage

### Basic Examples

```javascript
const {
    createOAuth2Requirements,
    createFormRequirements,
    createNagarisOTPFlowMock,
    createAuthorizationSuccess,
} = require('@friggframework/schemas/mocks/authorization-mocks');

// OAuth2 flow
const hubspotAuth = createOAuth2Requirements('hubspot');
// {
//   type: 'oauth2',
//   step: 1,
//   totalSteps: 1,
//   isMultiStep: false,
//   data: {
//     url: 'https://auth.hubspot.com/oauth/authorize?...',
//     scopes: ['read', 'write']
//   }
// }

// Form-based auth
const apiKeyAuth = createFormRequirements('custom-api', {
    fields: ['api_key']
});
// {
//   type: 'form',
//   data: {
//     jsonSchema: { ... },
//     uiSchema: { ... }
//   }
// }

// Multi-step OTP flow (like Nagaris)
const nagarisFlow = createNagarisOTPFlowMock('user-123');
const step1Reqs = nagarisFlow.getStep1Requirements(); // Email form
const step1Response = nagarisFlow.submitStep1({ email: 'test@example.com' }); // OTP sent
const step2Response = nagarisFlow.submitStep2({ otp: '123456' }); // Success
```

### In Tests

#### Core Package Tests

```javascript
// packages/core/__tests__/authorization-flow.test.js
const { createNagarisOTPFlowMock } = require('@friggframework/schemas/mocks/authorization-mocks');
const { validateAuthorizationSession } = require('@friggframework/schemas');

test('processes multi-step auth', async () => {
    const mockFlow = createNagarisOTPFlowMock('user-123');
    const session = mockFlow.session;

    // Validate before storing
    const validation = validateAuthorizationSession(session);
    expect(validation.valid).toBe(true);

    // Use in repository test
    await authSessionRepository.create(session);
});
```

#### UI Package Tests

```javascript
// packages/ui/__tests__/AuthorizationWizard.test.jsx
const { createFormRequirements } = require('@friggframework/schemas/mocks/authorization-mocks');

test('renders multi-step OTP form', async () => {
    const mockApi = {
        getAuthorizationRequirements: jest.fn().mockResolvedValue(
            createFormRequirements('nagaris', {
                fields: ['email'],
                isMultiStep: true,
                step: 1,
                totalSteps: 2
            })
        )
    };

    render(<AuthorizationWizard api={mockApi} moduleType="nagaris" />);
    // Test form rendering...
});
```

#### Management UI Tests

```javascript
// packages/devtools/management-ui/__tests__/TestingZone.test.jsx
const { createOAuth2Requirements } = require('@friggframework/schemas/mocks/authorization-mocks');

test('displays OAuth authorization URL', () => {
    const mockData = createOAuth2Requirements('hubspot');

    render(<AuthFlowDisplay requirements={mockData} />);
    expect(screen.getByText(/hubspot.com\/oauth/)).toBeInTheDocument();
});
```

## API Reference

### OAuth2 Flows

#### `createOAuth2Requirements(moduleType, options)`

Create OAuth2 authorization requirements.

**Parameters:**
- `moduleType` (string): Module name (e.g., 'hubspot', 'salesforce')
- `options.scopes` (array): OAuth scopes (default: ['read', 'write'])
- `options.isMultiStep` (boolean): Multi-step flow (default: false)
- `options.step` (number): Current step (default: 1)
- `options.totalSteps` (number): Total steps (default: 1)
- `options.sessionId` (string): Session ID for multi-step

**Returns:** Authorization requirements object (validated against schema)

#### `createOAuth2FlowMock(moduleType, userId)`

Create complete OAuth2 flow with methods for each step.

**Returns:** Object with `getRequirements()` and `handleCallback()` methods

### Form-Based Flows

#### `createFormRequirements(moduleType, options)`

Create form-based authorization requirements with JSON Schema.

**Parameters:**
- `moduleType` (string): Module name
- `options.fields` (array): Field names (email, password, api_key, otp, etc.)
- `options.isMultiStep` (boolean): Multi-step flow
- `options.step` (number): Current step
- `options.totalSteps` (number): Total steps
- `options.sessionId` (string): Session ID

**Returns:** Form requirements with jsonSchema and uiSchema

**Supported Fields:**
- `email` - Email input with validation
- `password` - Password input (min 6 chars)
- `api_key` - API key text input
- `otp` - 6-digit OTP input with pattern validation
- Custom fields - Generic text inputs

### Multi-Step OTP Flows

#### `createOTPMultiStepFlow(moduleType)`

Create multi-step flow structure (email → OTP).

**Returns:** Object with `step1` and `step2(sessionId)` properties

#### `createNagarisOTPFlowMock(userId)`

Create complete Nagaris-style OTP flow with all steps.

**Returns:** Object with methods:
- `getStep1Requirements()` - Get email form
- `submitStep1(emailData)` - Submit email, get OTP prompt
- `submitStep2(otpData)` - Submit OTP, get success
- `session` - Authorization session object
- `sessionId` - Session identifier
- `email` - Test email address

### Response Builders

#### `createAuthorizationSuccess(moduleType, options)`

Create successful authorization response.

**Parameters:**
- `moduleType` (string): Module name
- `options.entityId` (string): Entity ID (auto-generated if not provided)
- `options.credentialId` (string): Credential ID (auto-generated)
- `options.display` (string): Display name

**Returns:** Success response object

#### `createAuthorizationNextStep(nextStep, requirements, options)`

Create next step response for multi-step flows.

**Parameters:**
- `nextStep` (number): Next step number
- `requirements` (object): Requirements for next step
- `options.sessionId` (string): Session ID (auto-generated)
- `options.message` (string): User message

**Returns:** Next step response object

### Session Management

#### `createAuthorizationSession(userId, entityType, options)`

Create authorization session database object.

**Parameters:**
- `userId` (string): User ID
- `entityType` (string): Module type
- `options.currentStep` (number): Current step (default: 1)
- `options.maxSteps` (number): Total steps (default: 2)
- `options.stepData` (object): Data from previous steps
- `options.expiresInMinutes` (number): Expiration time (default: 15)
- `options.completed` (boolean): Completion status

**Returns:** Session object ready for database storage

#### `generateSessionId()`

Generate a UUID v4 session ID.

**Returns:** UUID string

## Validation

All mock data is validated against schemas in `packages/schemas/schemas/api-authorization.schema.json`.

```javascript
const { validateAuthorizationRequirements } = require('@friggframework/schemas');

const mockData = createFormRequirements('nagaris', { fields: ['email'] });
const result = validateAuthorizationRequirements(mockData);

if (result.valid) {
    console.log('✅ Mock data is schema-compliant');
} else {
    console.error('❌ Validation errors:', result.errors);
}
```

## Testing

Run the mock validation tests:

```bash
cd packages/schemas
npm test mocks/__tests__/authorization-mocks.test.js
```

All tests validate that mocks are schema-compliant and work across packages.

## Contributing

When adding new authorization types:

1. Add schema definition to `api-authorization.schema.json`
2. Add mock generator to `authorization-mocks.js`
3. Add validation tests to `__tests__/authorization-mocks.test.js`
4. Update this README with usage examples

## Related

- [API Authorization Schema](../schemas/api-authorization.schema.json)
- [Core Authorization Use Cases](../../core/modules/use-cases/)
- [UI Authorization Components](../../ui/lib/integration/presentation/components/)
