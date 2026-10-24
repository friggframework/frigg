# Testing & Authentication Flow Improvements

**Date:** 2025-11-12
**Status:** Foundation Complete, Implementation Pending

## Problem Statement

After merging PR #453 (multi-step authentication), the testing and authentication flows in both the management UI and @friggframework/ui library need to be more robust and accurate. The current issues:

1. **Inconsistent mocks** across packages (core, ui, management-ui)
2. **No schema validation** for API contracts
3. **Hard to test** multi-step flows (OTP, multi-stage OAuth)
4. **Lack of shared test utilities** between packages

## Solution Implemented

### 1. Canonical API Schemas ✅

Created comprehensive JSON schemas for all authorization endpoints:

**File:** `packages/schemas/schemas/api-authorization.schema.json`

**Schemas Defined:**
- `authorizationRequirements` - GET /api/authorize response
- `oauth2Requirements` - OAuth2-specific data structure
- `formRequirements` - Form-based auth (with JSON Schema + UI Schema)
- `apiKeyRequirements` - API key authentication
- `authorizationRequest` - POST /api/authorize request
- `authorizationResponse` - Success or next step response
- `authorizationSuccess` - Completed authorization
- `authorizationNextStep` - Multi-step continuation
- `authorizationSession` - Database session object

### 2. Shared Mock Generators ✅

Created schema-validated mock data generators that work across all packages:

**File:** `packages/schemas/mocks/authorization-mocks.js`

**Key Functions:**

#### OAuth2 Flows
```javascript
createOAuth2Requirements('hubspot', { scopes: ['read', 'write'] })
createOAuth2FlowMock('salesforce', 'user-123')
```

#### Form-Based Flows
```javascript
createFormRequirements('nagaris', { fields: ['email', 'password'] })
createFormRequirements('api-service', { fields: ['api_key'] })
```

#### Multi-Step OTP Flows
```javascript
createOTPMultiStepFlow('nagaris')
createNagarisOTPFlowMock('user-123') // Complete flow with all steps
```

#### Response Builders
```javascript
createAuthorizationSuccess('hubspot', { entityId: '...', display: '...' })
createAuthorizationNextStep(2, requirements, { sessionId: '...', message: '...' })
createAuthorizationSession('user-123', 'nagaris', { currentStep: 1, maxSteps: 2 })
```

### 3. Validation Integration ✅

All mocks are validated against schemas:

```javascript
const { validateAuthorizationRequirements } = require('@friggframework/schemas');
const { createFormRequirements } = require('@friggframework/schemas/mocks/authorization-mocks');

const mockData = createFormRequirements('nagaris', { fields: ['email'] });
const result = validateAuthorizationRequirements(mockData);
// result.valid === true (guaranteed by tests)
```

### 4. Comprehensive Tests ✅

**File:** `packages/schemas/mocks/__tests__/authorization-mocks.test.js`

- All mock generators tested for schema compliance
- Cross-package compatibility verified
- Multi-step flow validation
- Edge cases covered (custom IDs, expiration, step data)

## Package Updates Required

### @friggframework/schemas ✅ COMPLETE

- ✅ New schema: `api-authorization.schema.json`
- ✅ Mock generators: `mocks/authorization-mocks.js`
- ✅ Validation functions exported
- ✅ Comprehensive test suite
- ✅ Documentation (README in mocks/)
- ✅ Package.json updated to include mocks

### @friggframework/core 🔄 PENDING

**What Needs Updating:**

1. **Test Files** - Replace hardcoded mocks with shared mocks:
   ```javascript
   // OLD (packages/core/modules/__tests__/...)
   const mockRequirements = { type: 'form', data: { ... } };

   // NEW
   const { createFormRequirements } = require('@friggframework/schemas/mocks/authorization-mocks');
   const mockRequirements = createFormRequirements('nagaris', { fields: ['email'] });
   ```

2. **Integration Tests** - Add end-to-end multi-step auth tests:
   ```javascript
   // packages/core/modules/__tests__/integration/complete-multi-step-flow.test.js
   const { createNagarisOTPFlowMock } = require('@friggframework/schemas/mocks/authorization-mocks');

   test('complete Nagaris OTP flow', async () => {
       const flow = createNagarisOTPFlowMock('test-user');
       // Test full flow from step 1 → step 2 → success
   });
   ```

3. **API Response Validation** - Add schema validation in handlers:
   ```javascript
   // packages/core/integrations/integration-router.js
   const { validateAuthorizationResponse } = require('@friggframework/schemas');

   router.post('/api/authorize', async (req, res) => {
       const response = await processAuth(...);

       // Validate before sending
       const validation = validateAuthorizationResponse(response);
       if (!validation.valid) {
           logger.error('Invalid auth response', validation.errors);
       }

       res.json(response);
   });
   ```

### @friggframework/ui 🔄 PENDING

**What Needs Updating:**

1. **Mock API Adapter** - Use shared mocks in tests:
   ```javascript
   // packages/ui/lib/integration/__tests__/infrastructure/ApiAdapter.test.js
   const { createOAuth2Requirements, createFormRequirements } = require('@friggframework/schemas/mocks/authorization-mocks');

   const mockApi = {
       getAuthorizationRequirements: jest.fn().mockResolvedValue(
           createFormRequirements('nagaris', { fields: ['email'] })
       )
   };
   ```

2. **Component Tests** - Update AuthorizationWizard tests:
   ```javascript
   // packages/ui/lib/integration/__tests__/presentation/components/AuthorizationWizard.test.jsx
   // Replace mock data with shared generators
   ```

3. **Integration Tests** - Add real flow tests:
   ```javascript
   // packages/ui/lib/integration/__tests__/integration/complete-auth-flow.test.jsx
   test('handles Nagaris OTP flow', async () => {
       const flow = createNagarisOTPFlowMock('user-123');
       // Test UI rendering for each step
   });
   ```

4. **Runtime Validation** (Optional) - Validate API responses:
   ```javascript
   // packages/ui/lib/integration/infrastructure/adapters/EntityRepositoryAdapter.js
   async getAuthorizationRequirements(entityType) {
       const response = await this.api.getAuthorizeRequirements(entityType);

       if (process.env.NODE_ENV === 'development') {
           const { validateAuthorizationRequirements } = require('@friggframework/schemas');
           const validation = validateAuthorizationRequirements(response);
           if (!validation.valid) {
               console.error('Invalid API response:', validation.errors);
           }
       }

       return response;
   }
   ```

### @friggframework/devtools/management-ui 🔄 PENDING

**What Needs Updating:**

1. **Admin Service Mocks**:
   ```javascript
   // packages/devtools/management-ui/src/application/services/__tests__/AdminService.test.js
   const { createAuthorizationSuccess } = require('@friggframework/schemas/mocks/authorization-mocks');
   ```

2. **Testing Zone Tests**:
   ```javascript
   // packages/devtools/management-ui/src/tests/integration/complete-workflow.test.jsx
   // Use shared mocks for all auth flow tests
   ```

3. **Mock API Client**:
   ```javascript
   // packages/devtools/management-ui/src/tests/mocks/ideApi.js
   const { createOAuth2Requirements, createFormRequirements } = require('@friggframework/schemas/mocks/authorization-mocks');

   export const mockIdeApi = {
       getAuthRequirements: (moduleType) => {
           if (moduleType === 'hubspot') {
               return createOAuth2Requirements('hubspot');
           }
           return createFormRequirements(moduleType, { fields: ['api_key'] });
       }
   };
   ```

## Example: Complete Multi-Step Test

Here's how to write a comprehensive multi-step auth test using the new tools:

```javascript
// packages/core/modules/__tests__/integration/nagaris-otp-flow.test.js
const {
    createNagarisOTPFlowMock,
    createAuthorizationSession,
} = require('@friggframework/schemas/mocks/authorization-mocks');
const {
    validateAuthorizationRequirements,
    validateAuthorizationResponse,
    validateAuthorizationSession,
} = require('@friggframework/schemas');

const { StartAuthorizationSessionUseCase } = require('../../use-cases/start-authorization-session');
const { ProcessAuthorizationStepUseCase } = require('../../use-cases/process-authorization-step');
const { createAuthorizationSessionRepository } = require('../../repositories/authorization-session-repository-factory');

describe('Nagaris OTP Flow Integration Test', () => {
    let authSessionRepository;
    let startSessionUseCase;
    let processStepUseCase;
    let mockFlow;

    beforeEach(() => {
        authSessionRepository = createAuthorizationSessionRepository();
        startSessionUseCase = new StartAuthorizationSessionUseCase({
            authSessionRepository
        });
        processStepUseCase = new ProcessAuthorizationStepUseCase({
            authSessionRepository,
            moduleFactory: mockModuleFactory
        });

        mockFlow = createNagarisOTPFlowMock('test-user-123');
    });

    test('completes full OTP flow with schema validation', async () => {
        // Step 1: Start session and get email requirements
        const session1 = await startSessionUseCase.execute('test-user-123', 'nagaris', 2);
        const validation1 = validateAuthorizationSession(session1);
        expect(validation1.valid).toBe(true);

        const step1Reqs = mockFlow.getStep1Requirements();
        const reqsValidation1 = validateAuthorizationRequirements(step1Reqs);
        expect(reqsValidation1.valid).toBe(true);

        // Step 2: Submit email
        const step1Response = await processStepUseCase.execute(
            session1.sessionId,
            { email: 'test@example.com' },
            1
        );
        const responseValidation1 = validateAuthorizationResponse(step1Response);
        expect(responseValidation1.valid).toBe(true);
        expect(step1Response.nextStep).toBe(2);

        // Step 3: Submit OTP
        const step2Response = await processStepUseCase.execute(
            session1.sessionId,
            { otp: '123456' },
            2
        );
        const responseValidation2 = validateAuthorizationResponse(step2Response);
        expect(responseValidation2.valid).toBe(true);
        expect(step2Response.entity_id).toBeDefined();
        expect(step2Response.type).toBe('nagaris');
    });
});
```

## Usage Guidelines

### For Core Developers

1. **Always use shared mocks** from `@friggframework/schemas/mocks/authorization-mocks`
2. **Validate responses** in development mode
3. **Write integration tests** for each auth type your module supports
4. **Update schemas** if you add new auth requirements

### For UI Developers

1. **Import mocks** instead of creating inline mock data
2. **Test all auth types** your components support (OAuth, form, OTP)
3. **Validate API responses** in development builds
4. **Use schema types** for TypeScript/JSDoc type hints

### For Integration Tests

1. **Use complete flow mocks** like `createNagarisOTPFlowMock()`
2. **Validate each step** against schemas
3. **Test error cases** (expired sessions, invalid OTP, etc.)
4. **Test both databases** (MongoDB and PostgreSQL)

## Next Steps

### Immediate (Commit & PR)

- ✅ Commit schema package improvements
- ✅ Document usage
- ✅ Push to branch

### Short-term (1-2 days)

- 🔄 Update core package tests to use shared mocks
- 🔄 Update UI package tests to use shared mocks
- 🔄 Update management-ui tests to use shared mocks
- 🔄 Add integration tests for all auth types

### Medium-term (1 week)

- 🔄 Add runtime validation in development mode
- 🔄 Create TypeScript type definitions from schemas
- 🔄 Add OpenAPI/Swagger docs generation from schemas
- 🔄 Performance test multi-step flows

### Long-term (2+ weeks)

- 🔄 Add E2E tests with real API modules
- 🔄 Create visual regression tests for auth UIs
- 🔄 Add monitoring/observability for auth flows
- 🔄 Document migration guide for existing auth modules

## Benefits

### Developer Experience ✅

- **Single source of truth** for auth data structures
- **No more copy-pasting** mock data between tests
- **Guaranteed schema compliance** (all mocks are validated)
- **Easy to test** new auth types (just add to mocks)

### Code Quality ✅

- **Type safety** (schemas → TypeScript types)
- **API contract validation** (catch breaking changes early)
- **Consistent testing** across all packages
- **Reduced maintenance** (update schema once, affects all tests)

### Bug Prevention ✅

- **Schema validation** catches structure mismatches
- **Shared mocks** eliminate inconsistencies
- **Integration tests** catch flow issues
- **Cross-package tests** ensure compatibility

## Related Files

- **Schemas**: `packages/schemas/schemas/api-authorization.schema.json`
- **Mocks**: `packages/schemas/mocks/authorization-mocks.js`
- **Tests**: `packages/schemas/mocks/__tests__/authorization-mocks.test.js`
- **Documentation**: `packages/schemas/mocks/README.md`
- **Package**: `packages/schemas/package.json`

## Questions & Issues

If you encounter issues:

1. Check schema validation errors for details
2. Review mock generator examples in tests
3. See `packages/schemas/mocks/README.md` for full API reference
4. File issue with schema validation output

---

**Status:** Foundation complete, ready for integration across packages
**Impact:** High - improves testing accuracy and developer experience
**Risk:** Low - additive changes, doesn't break existing code
