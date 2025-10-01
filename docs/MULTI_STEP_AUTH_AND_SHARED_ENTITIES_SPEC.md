# Multi-Step Authentication & Shared Entities - Technical Specification

## Executive Summary

This document outlines the design for three interconnected features:
1. **Multi-step form-based authentication** (e.g., OTP flows like Nagaris)
2. **Delegated authentication** (use developer's auth system instead of Frigg's standalone user management)
3. **Shared entities** across integrations (one entity, multiple integrations)

## Problem Statement

### Current Limitations

**Authentication Flow:**
- Current `/api/authorize` flow is single-step: GET requirements → POST credentials → Done
- No support for multi-stage flows (email → OTP, credential → MFA, etc.)
- No session state between authentication steps

**User Management:**
- Frigg currently manages its own user authentication separately from the developer's application
- Creates duplicate user management overhead
- Developer cannot leverage their existing auth system

**Entity Relationships:**
- Entities are currently tied to specific integrations
- Cannot share a single external account (entity) across multiple integrations
- Example: One Nagaris user entity should serve both Nagaris CRM integration AND Nagaris Analytics integration

## Use Case: Nagaris OTP Authentication

### Flow Requirements

```
Step 1: User provides email
  ↓ POST /api/authorize (step=1)
  ↓ Backend calls Nagaris: POST /api/v1/auth/login-email-create
  ↓ Nagaris sends OTP to user's email
  ↓ Response: { step: 2, session_id: "xyz", next_fields: ["otp"] }

Step 2: User provides OTP
  ↓ POST /api/authorize (step=2, session_id="xyz")
  ↓ Backend calls Nagaris: POST /api/v1/auth/login-otp-create
  ↓ Nagaris returns: { access, refresh, user: { id, email, ... } }
  ↓ Backend creates Entity + Credential
  ↓ Response: { entity_id, credential_id, type }
```

### Expected Nagaris Response
```json
{
  "access": "string",
  "refresh": "string",
  "user": {
    "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
    "email": "user@example.com",
    "first_name": "string",
    "last_name": "string",
    "avatar": "http://example.com"
  }
}
```

---

## Architecture Design

### 1. Multi-Step Auth Flow

#### Backend Changes

##### A. New Authorization Session Model

```javascript
// packages/core/module-plugin/authorization-session.js
const mongoose = require('mongoose');

const AuthorizationSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    entityType: { type: String, required: true },
    currentStep: { type: Number, default: 1 },
    maxSteps: { type: Number, required: true },
    stepData: { type: mongoose.Schema.Types.Mixed }, // Store intermediate data
    expiresAt: { type: Date, required: true, index: true },
    completed: { type: Boolean, default: false }
}, { timestamps: true });

// Auto-delete expired sessions
AuthorizationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuthorizationSession = mongoose.model('AuthorizationSession', AuthorizationSessionSchema);
module.exports = { AuthorizationSession };
```

##### B. Extended Auther Class

```javascript
// packages/core/module-plugin/auther.js

class Auther extends Delegate {
    // ... existing code ...

    /**
     * Override this for multi-step auth
     * @returns {number} Number of steps required (default: 1)
     */
    getAuthStepCount() {
        return 1;
    }

    /**
     * Override this for multi-step auth
     * @param {number} step - Current step number (1-indexed)
     * @returns {Object} Requirements for this step
     */
    async getAuthorizationRequirementsForStep(step = 1) {
        if (step === 1) {
            return this.getAuthorizationRequirements();
        }
        throw new Error(`Step ${step} not implemented`);
    }

    /**
     * Override this for multi-step auth
     * @param {number} step - Current step number
     * @param {Object} stepData - Data from current step
     * @param {Object} sessionData - Accumulated data from previous steps
     * @returns {Object} Result with nextStep or final entity data
     */
    async processAuthorizationStep(step, stepData, sessionData = {}) {
        if (step === 1 && this.getAuthStepCount() === 1) {
            // Single-step flow - use existing processAuthorizationCallback
            return await this.processAuthorizationCallback({
                userId: sessionData.userId,
                data: stepData
            });
        }
        throw new Error(`Multi-step auth not implemented for ${this.name}`);
    }
}
```

##### C. Updated Authorization Router

```javascript
// packages/core/integrations/integration-router.js

const { AuthorizationSession } = require('../module-plugin/authorization-session');
const crypto = require('crypto');

// GET /api/authorize?entityType=X&step=N&sessionId=Y
router.route('/api/authorize').get(
    catchAsyncError(async (req, res) => {
        const params = checkRequiredParams(req.query, ['entityType']);
        const step = parseInt(req.query.step || '1');
        const sessionId = req.query.sessionId;

        const module = await getModuleInstance(req, params.entityType);
        const stepCount = module.getAuthStepCount();

        // Validate session for step > 1
        if (step > 1) {
            if (!sessionId) {
                throw Boom.badRequest('sessionId required for step > 1');
            }
            const session = await AuthorizationSession.findOne({
                sessionId,
                entityType: params.entityType,
                userId: getUserId(req),
                completed: false,
                expiresAt: { $gt: new Date() }
            });
            if (!session) {
                throw Boom.badRequest('Invalid or expired session');
            }
            if (session.currentStep + 1 !== step) {
                throw Boom.badRequest(`Expected step ${session.currentStep + 1}, got ${step}`);
            }
        }

        const requirements = await module.getAuthorizationRequirementsForStep(step);

        res.json({
            ...requirements,
            step,
            totalSteps: stepCount,
            sessionId: step === 1 ? crypto.randomUUID() : sessionId
        });
    })
);

// POST /api/authorize
router.route('/api/authorize').post(
    catchAsyncError(async (req, res) => {
        const params = checkRequiredParams(req.body, ['entityType', 'data']);
        const step = parseInt(req.body.step || '1');
        const sessionId = req.body.sessionId;

        const module = await getModuleInstance(req, params.entityType);
        const stepCount = module.getAuthStepCount();
        const userId = getUserId(req);

        let session = null;
        let sessionData = {};

        // Handle session for multi-step
        if (stepCount > 1) {
            if (!sessionId) {
                throw Boom.badRequest('sessionId required for multi-step auth');
            }

            if (step === 1) {
                // Create new session
                session = await AuthorizationSession.create({
                    sessionId,
                    userId,
                    entityType: params.entityType,
                    currentStep: 1,
                    maxSteps: stepCount,
                    stepData: {},
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
                });
            } else {
                // Resume existing session
                session = await AuthorizationSession.findOne({
                    sessionId,
                    entityType: params.entityType,
                    userId,
                    completed: false,
                    expiresAt: { $gt: new Date() }
                });
                if (!session) {
                    throw Boom.badRequest('Invalid or expired session');
                }
                sessionData = session.stepData || {};
            }
        }

        // Process the step
        const result = await module.processAuthorizationStep(step, params.data, {
            ...sessionData,
            userId
        });

        // Check if more steps needed
        if (result.nextStep && result.nextStep <= stepCount) {
            // Update session with accumulated data
            session.currentStep = step;
            session.stepData = { ...sessionData, ...result.stepData };
            await session.save();

            res.json({
                step: result.nextStep,
                totalSteps: stepCount,
                sessionId,
                message: result.message || `Step ${step} completed. Proceed to step ${result.nextStep}`
            });
        } else {
            // Final step - mark session complete if multi-step
            if (session) {
                session.completed = true;
                await session.save();
            }

            res.json(result); // { credential_id, entity_id, type }
        }
    })
);
```

#### Frontend Changes

##### A. Multi-Step Auth Service

```javascript
// packages/ui/lib/integration/application/services/MultiStepAuthService.js

export class MultiStepAuthService {
    constructor(entityRepository) {
        this.entityRepository = entityRepository;
    }

    /**
     * Start multi-step auth flow
     */
    async startAuthFlow(entityType) {
        const requirements = await this.entityRepository.getAuthorizationRequirements(
            entityType,
            ''
        );

        return {
            currentStep: requirements.step || 1,
            totalSteps: requirements.totalSteps || 1,
            sessionId: requirements.sessionId,
            requirements
        };
    }

    /**
     * Submit step data and get next requirements
     */
    async submitStep(entityType, step, data, sessionId) {
        const result = await this.entityRepository.submitAuthStep(
            entityType,
            step,
            data,
            sessionId
        );

        if (result.nextStep) {
            // More steps needed - get next requirements
            const nextRequirements = await this.entityRepository.getAuthorizationRequirements(
                entityType,
                '',
                result.nextStep,
                sessionId
            );

            return {
                currentStep: result.nextStep,
                totalSteps: result.totalSteps,
                sessionId: result.sessionId,
                requirements: nextRequirements,
                completed: false
            };
        }

        // Auth complete
        return {
            completed: true,
            entity: result
        };
    }
}
```

##### B. Updated EntityRepositoryAdapter

```javascript
// packages/ui/lib/integration/infrastructure/adapters/EntityRepositoryAdapter.js

export class EntityRepositoryAdapter {
    // ... existing code ...

    /**
     * Get authorization requirements for specific step
     */
    async getAuthorizationRequirements(entityType, connectingEntityType = '', step = 1, sessionId = null) {
        let url = `/api/authorize?entityType=${entityType}&connectingEntityType=${connectingEntityType}&step=${step}`;
        if (sessionId) {
            url += `&sessionId=${sessionId}`;
        }
        return await this.api._get(url);
    }

    /**
     * Submit auth step data
     */
    async submitAuthStep(entityType, step, data, sessionId) {
        return await this.api._post('/api/authorize', {
            entityType,
            step,
            data,
            sessionId
        });
    }
}
```

##### C. Multi-Step Form Wizard Component

```javascript
// packages/ui/lib/integration/presentation/components/MultiStepAuthWizard.jsx

import React, { useState, useEffect } from 'react';
import { JsonForms } from '@jsonforms/react';
import { materialRenderers, materialCells } from '@jsonforms/material-renderers';

export const MultiStepAuthWizard = ({
    entityType,
    authService,
    onSuccess,
    onCancel
}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [totalSteps, setTotalSteps] = useState(1);
    const [sessionId, setSessionId] = useState(null);
    const [requirements, setRequirements] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        initializeAuth();
    }, []);

    const initializeAuth = async () => {
        try {
            setLoading(true);
            const flow = await authService.startAuthFlow(entityType);
            setCurrentStep(flow.currentStep);
            setTotalSteps(flow.totalSteps);
            setSessionId(flow.sessionId);
            setRequirements(flow.requirements);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        try {
            setLoading(true);
            setError(null);

            const result = await authService.submitStep(
                entityType,
                currentStep,
                formData,
                sessionId
            );

            if (result.completed) {
                onSuccess(result.entity);
            } else {
                // Move to next step
                setCurrentStep(result.currentStep);
                setTotalSteps(result.totalSteps);
                setSessionId(result.sessionId);
                setRequirements(result.requirements);
                setFormData({});
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-destructive/10 border border-destructive rounded-md">
                <p className="text-sm text-destructive">{error}</p>
                <button onClick={initializeAuth} className="mt-2 text-sm underline">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Progress indicator */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Step {currentStep} of {totalSteps}</span>
                    <span>{Math.round((currentStep / totalSteps) * 100)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                    />
                </div>
            </div>

            {/* Step content */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                    {requirements.data?.title || `Authentication Step ${currentStep}`}
                </h3>
                {requirements.data?.description && (
                    <p className="text-sm text-muted-foreground">
                        {requirements.data.description}
                    </p>
                )}

                {requirements.type === 'oauth2' ? (
                    <button
                        onClick={() => window.location.href = requirements.url}
                        className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                    >
                        Continue with OAuth
                    </button>
                ) : (
                    <JsonForms
                        schema={requirements.data.jsonSchema}
                        uischema={requirements.data.uiSchema}
                        data={formData}
                        renderers={materialRenderers}
                        cells={materialCells}
                        onChange={({ data }) => setFormData(data)}
                    />
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
                >
                    Cancel
                </button>
                {requirements.type !== 'oauth2' && (
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                    >
                        {currentStep === totalSteps ? 'Complete' : 'Continue'}
                    </button>
                )}
            </div>
        </div>
    );
};
```

##### D. Updated EntityConnectionModal

```javascript
// packages/ui/lib/integration/presentation/components/EntityConnectionModal.jsx

export const EntityConnectionModal = ({ ... }) => {
    const [authRequirements, setAuthRequirements] = useState(null);
    const [isMultiStep, setIsMultiStep] = useState(false);

    useEffect(() => {
        loadAuthRequirements();
    }, [entityType]);

    const loadAuthRequirements = async () => {
        const requirements = await api.getAuthorizeRequirements(entityType, '');
        setAuthRequirements(requirements);
        setIsMultiStep((requirements.totalSteps || 1) > 1);
    };

    return (
        <div className="space-y-6">
            {/* ... header ... */}

            {isMultiStep ? (
                <MultiStepAuthWizard
                    entityType={entityType}
                    authService={multiStepAuthService}
                    onSuccess={handleSuccess}
                    onCancel={onCancel}
                />
            ) : (
                // ... existing single-step form ...
            )}
        </div>
    );
};
```

---

### 2. Delegated Authentication System

#### Concept

Allow developers to use their own authentication system to:
1. Create Frigg user records automatically
2. Create initial entities for that user
3. Authenticate users on subsequent logins

#### Backend Design

##### A. New Authentication Mode Configuration

```javascript
// app-definition.js or similar config
module.exports = {
    authentication: {
        mode: 'standalone', // or 'delegated'

        // For delegated mode:
        delegated: {
            // Endpoint on developer's server to validate tokens
            validateTokenUrl: 'https://customer-app.com/api/frigg/validate-token',

            // Initial entities to create for new users
            initialEntities: [
                {
                    type: 'nagaris',
                    credentialSource: 'user_auth' // Use auth response data
                }
            ],

            // Map auth response to user fields
            userFieldMapping: {
                'user.id': 'externalUserId',
                'user.email': 'email',
                'user.first_name': 'firstName',
                'user.last_name': 'lastName'
            },

            // Map auth response to entity fields
            entityFieldMapping: {
                nagaris: {
                    'access': 'access_token',
                    'refresh': 'refresh_token',
                    'user.id': 'nagaris_user_id'
                }
            }
        }
    }
};
```

##### B. Delegated Auth Middleware

```javascript
// packages/core/handlers/routers/middleware/delegatedAuth.js

const axios = require('axios');
const { User } = require('../../models/User');

async function validateDelegatedToken(req, res, next) {
    const appDef = global.appDefinition;

    if (appDef.authentication?.mode !== 'delegated') {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.substring(7);

    try {
        // Validate with customer's auth server
        const response = await axios.post(
            appDef.authentication.delegated.validateTokenUrl,
            { token },
            { headers: { 'X-Frigg-Secret': appDef.authentication.delegated.secretKey } }
        );

        const userData = response.data;

        // Find or create Frigg user
        let user = await User.findOne({ externalUserId: userData.user.id });

        if (!user) {
            // Auto-provision user
            user = await createDelegatedUser(userData, appDef);
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Delegated auth validation failed:', error);
        return res.status(401).json({ error: 'Invalid token' });
    }
}

async function createDelegatedUser(authData, appDef) {
    const mapping = appDef.authentication.delegated.userFieldMapping;
    const userData = {};

    for (const [sourcePath, targetField] of Object.entries(mapping)) {
        userData[targetField] = getNestedValue(authData, sourcePath);
    }

    const user = await User.create(userData);

    // Auto-create initial entities if configured
    if (appDef.authentication.delegated.initialEntities) {
        for (const entityConfig of appDef.authentication.delegated.initialEntities) {
            await createInitialEntity(user, entityConfig, authData, appDef);
        }
    }

    return user;
}

async function createInitialEntity(user, entityConfig, authData, appDef) {
    const { moduleFactory } = require('../../backend-utils');
    const module = await moduleFactory.getInstance({
        userId: user.id,
        moduleName: entityConfig.type
    });

    // Map auth data to entity credentials
    const entityMapping = appDef.authentication.delegated.entityFieldMapping[entityConfig.type];
    const credentialData = {};

    for (const [sourcePath, targetField] of Object.entries(entityMapping)) {
        credentialData[targetField] = getNestedValue(authData, sourcePath);
    }

    // Create entity using the mapped data
    return await module.processAuthorizationCallback({
        userId: user.id,
        data: credentialData
    });
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

module.exports = { validateDelegatedToken };
```

##### C. Admin Portal Impersonation

```javascript
// packages/core/handlers/routers/admin.js

router.post('/admin/impersonate/:userId', requireAdmin, async (req, res) => {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
        throw Boom.notFound('User not found');
    }

    // Generate special impersonation token
    const token = jwt.sign(
        {
            userId: user.id,
            impersonatedBy: req.user.id,
            type: 'impersonation'
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    res.json({
        token,
        user: {
            id: user.id,
            email: user.email
        }
    });
});
```

---

### 3. Shared Entities Across Integrations

#### Concept

One external account (entity) can be used by multiple integrations.

**Example:**
- User connects to Nagaris once
- That Nagaris entity is shared across:
  - Nagaris CRM Integration
  - Nagaris Analytics Integration
  - Nagaris Reporting Integration

#### Database Schema Changes

##### A. Entity-Integration Relationship

Current: Integration → Entity (many-to-one)
New: Integration ↔ Entity (many-to-many)

```javascript
// packages/core/models/Integration.js

const IntegrationSchema = new mongoose.Schema({
    // ... existing fields ...

    // Change from single entity reference to array
    entities: [{
        entityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity' },
        role: { type: String }, // e.g., 'primary', 'secondary', 'source', 'destination'
        required: { type: Boolean, default: true }
    }],

    // New: Entity sharing configuration
    entitySharing: {
        allowShared: { type: Boolean, default: false },
        sharedEntityTypes: [String] // e.g., ['nagaris', 'salesforce']
    }
});
```

##### B. Integration Definition Update

```javascript
// Integration Class Definition

class NagarisCRMIntegration {
    static Definition = {
        name: 'nagaris-crm',
        display: { /* ... */ },

        modules: {
            nagaris: {
                definition: NagarisModule,
                role: 'primary',
                required: true,
                allowShared: true // ← NEW: This entity can be shared
            }
        },

        // NEW: Declare which entities can be shared
        sharedEntities: ['nagaris']
    };
}

class NagarisAnalyticsIntegration {
    static Definition = {
        name: 'nagaris-analytics',
        display: { /* ... */ },

        modules: {
            nagaris: {
                definition: NagarisModule,
                role: 'primary',
                required: true,
                allowShared: true,
                preferShared: true // ← NEW: Prefer existing entity
            }
        },

        sharedEntities: ['nagaris']
    };
}
```

#### UI Changes

##### A. Entity Selector with Shared Entity Indication

```javascript
// packages/ui/lib/integration/presentation/components/EntitySelector.jsx

const EntitySelector = ({ requirements, selectedEntities, onEntitySelect, onCreateEntity }) => {
    const renderEntityOption = (entity, requirement) => {
        const isShared = entity.usedBy?.length > 1;
        const otherIntegrations = entity.usedBy?.filter(i => i !== requirement.integrationType);

        return (
            <div className={`p-3 border rounded-lg cursor-pointer hover:border-primary ${
                selectedEntities[requirement.type] === entity.id ? 'border-primary bg-primary/5' : ''
            }`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <input
                            type="radio"
                            checked={selectedEntities[requirement.type] === entity.id}
                            onChange={() => onEntitySelect(requirement.type, entity.id)}
                        />
                        <span className="font-medium">{entity.name || entity.email}</span>
                    </div>

                    {isShared && (
                        <div className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            <ShareIcon className="w-3 h-3" />
                            <span>Shared</span>
                        </div>
                    )}
                </div>

                {isShared && otherIntegrations.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Also used by: {otherIntegrations.join(', ')}
                    </p>
                )}
            </div>
        );
    };

    return (
        // ... render entity options with sharing indicators
    );
};
```

##### B. Installation Flow with Shared Entity Detection

```javascript
// packages/ui/lib/integration/application/useCases/SelectEntitiesUseCase.js

export class SelectEntitiesUseCase {
    async getRequirements(integrationType) {
        const integration = await this.integrationService.getIntegrationOption(integrationType);
        const allEntities = await this.entityService.getAllEntities();

        const requirements = [];

        for (const [moduleKey, moduleConfig] of Object.entries(integration.modules)) {
            const userEntities = allEntities.filter(e => e.type === moduleKey);

            // Check if this entity type can be shared
            const canShare = integration.sharedEntities?.includes(moduleKey);
            const preferShared = moduleConfig.preferShared === true;

            // Find entities already used by other integrations
            const sharedEntities = canShare
                ? userEntities.filter(e => e.usedBy?.length > 0)
                : [];

            requirements.push({
                type: moduleKey,
                label: moduleConfig.definition.getName(),
                required: moduleConfig.required !== false,
                role: moduleConfig.role || 'primary',
                canShare,
                preferShared,
                entities: userEntities,
                sharedEntities,
                recommendedEntityId: preferShared && sharedEntities.length > 0
                    ? sharedEntities[0].id
                    : null
            });
        }

        return {
            integration,
            requirements
        };
    }
}
```

---

## Implementation Roadmap

### Phase 1: Multi-Step Auth Foundation (Week 1-2)
- [ ] Create AuthorizationSession model
- [ ] Extend Auther class with multi-step methods
- [ ] Update /api/authorize routes for session management
- [ ] Add unit tests for session lifecycle

### Phase 2: Nagaris OTP Implementation (Week 2-3)
- [ ] Implement Nagaris multi-step auth in API module
- [ ] Test email → OTP → entity creation flow
- [ ] Document Nagaris integration as reference

### Phase 3: Frontend Multi-Step UI (Week 3-4)
- [ ] Create MultiStepAuthService
- [ ] Build MultiStepAuthWizard component
- [ ] Integrate with EntityConnectionModal
- [ ] Add progress indicators and error handling

### Phase 4: Delegated Auth System (Week 4-5)
- [ ] Add authentication mode configuration
- [ ] Implement delegated token validation middleware
- [ ] Auto-provision users and entities
- [ ] Test with mock delegated auth server

### Phase 5: Shared Entities (Week 5-6)
- [ ] Update Integration schema for entity array
- [ ] Modify entity selection logic
- [ ] Update UI to show shared entity indicators
- [ ] Implement "prefer shared" entity logic

### Phase 6: Admin Portal Features (Week 6)
- [ ] Add user impersonation endpoint
- [ ] Test impersonation with delegated auth
- [ ] UI for admin to browse and impersonate users

### Phase 7: Testing & Documentation (Week 7)
- [ ] End-to-end testing all three features
- [ ] Integration tests for Nagaris workflow
- [ ] Developer documentation
- [ ] Migration guide for existing integrations

---

## Open Questions & Discussion Points

### 1. Multi-Step Auth
**Q:** Should we support branching flows (e.g., step 2 can be 2a OR 2b based on step 1 result)?
**Consideration:** Adds complexity but enables MFA choice, regional variations, etc.

**Q:** How long should auth sessions persist? Currently proposed 15 minutes.
**Consideration:** Balance between user convenience and security.

### 2. Delegated Auth
**Q:** Should we support both standalone AND delegated modes simultaneously?
**Consideration:** Some users might be delegated, others standalone in same instance.

**Q:** How to handle delegated auth token refresh?
**Consideration:** Should Frigg call customer's refresh endpoint or require new login?

**Q:** Admin impersonation security - should there be audit logs?
**Consideration:** Track who impersonated whom and when.

### 3. Shared Entities
**Q:** Should we allow entities to be "detached" from integrations?
**Consideration:** What happens when integration is deleted but entity is shared?

**Q:** Should shared entities have permission models?
**Consideration:** Integration A can read/write, Integration B read-only.

**Q:** How to handle entity updates across integrations?
**Consideration:** If Nagaris CRM updates the token, does Analytics get notified?

### 4. Migration
**Q:** How to migrate existing integrations to support shared entities?
**Consideration:** Need migration script to convert `entity` field to `entities` array.

**Q:** Backward compatibility for existing modules?
**Consideration:** Should old single-step modules continue to work as-is?

---

## Security Considerations

1. **Auth Session Tokens:** Use cryptographically secure UUIDs, implement rate limiting
2. **Delegated Auth:** Validate customer auth server certificates, use secret keys for mutual auth
3. **Shared Entities:** Ensure proper isolation - Integration A can't access Integration B's data unless entity is explicitly shared
4. **Admin Impersonation:** Require MFA, log all impersonation events, time-limited tokens

---

## Success Metrics

- [ ] Multi-step auth: Successfully implement Nagaris OTP flow
- [ ] Delegated auth: Zero-friction user onboarding for delegated customers
- [ ] Shared entities: Reduce duplicate entity connections by 50%
- [ ] Admin portal: Enable support team to debug user issues via impersonation
- [ ] Performance: Multi-step auth adds <200ms latency per step
- [ ] Developer experience: Clear documentation and migration path

---

## Next Steps

1. **Review this spec** - Gather feedback from team
2. **Validate Nagaris API** - Confirm OTP flow matches their actual endpoints
3. **Prototype multi-step auth** - Build minimal proof-of-concept
4. **Design review** - Architecture team review before implementation
5. **Kick off Phase 1** - Begin implementation following roadmap

---

*Document Version: 1.0*
*Last Updated: 2025-01-XX*
*Author: Technical Architecture Team*
