# Multi-Step Authentication & Shared Entities - Technical Specification v2.0

**Updated for DDD/Hexagonal Architecture (2025)**

## Executive Summary

This document outlines the design for three interconnected features aligned with Frigg's current DDD/hexagonal architecture:

1. **Multi-step form-based authentication** (e.g., OTP flows like Nagaris)
2. **Delegated authentication** (use developer's auth system instead of Frigg's standalone user management)
3. **Shared entities** across integrations (one entity, multiple integrations)

## Architecture Updates from V1

**Key Changes:**
- ❌ **Removed**: Auther class pattern (deprecated)
- ✅ **Added**: Use case-driven multi-step auth
- ✅ **Added**: Repository pattern for AuthorizationSession
- ✅ **Added**: Module Definition extensions for step configuration
- ✅ **Updated**: Integration with current ProcessAuthorizationCallback

---

## Problem Statement

### Current Limitations

**Authentication Flow:**
- Current `/api/authorize` flow is single-step: GET requirements → POST credentials → Done
- No support for multi-stage flows (email → OTP, credential → MFA, etc.)
- No session state between authentication steps

**User Management:**
- Frigg manages its own user authentication separately from developer's application
- Creates duplicate user management overhead
- Developer cannot leverage their existing auth system

**Entity Relationships:**
- Entities currently tied to specific integrations
- Cannot share a single external account (entity) across multiple integrations
- Example: One Nagaris entity should serve both Nagaris CRM integration AND Nagaris Analytics integration

---

## Use Case: Nagaris OTP Authentication

### Flow Requirements

```
Step 1: User provides email
  ↓ POST /api/authorize (step=1, sessionId="xyz")
  ↓ StartAuthorizationSessionUseCase creates session
  ↓ ProcessAuthorizationStepUseCase calls Nagaris: POST /api/v1/auth/login-email
  ↓ Nagaris sends OTP to user's email
  ↓ Response: { nextStep: 2, sessionId: "xyz", requirements: { jsonSchema, uiSchema } }

Step 2: User provides OTP
  ↓ POST /api/authorize (step=2, sessionId="xyz")
  ↓ ProcessAuthorizationStepUseCase loads session
  ↓ Calls Nagaris: POST /api/v1/auth/login-otp
  ↓ Nagaris returns: { access, refresh, user: { id, email } }
  ↓ ProcessAuthorizationCallback creates Entity + Credential
  ↓ Response: { entity_id, credential_id, type }
```

---

## Architecture Design

### 1. Multi-Step Auth Flow

#### A. Domain Layer

##### AuthorizationSession Entity

```javascript
// packages/core/modules/domain/entities/AuthorizationSession.js

class AuthorizationSession {
    constructor({
        sessionId,
        userId,
        entityType,
        currentStep = 1,
        maxSteps,
        stepData = {},
        expiresAt,
        completed = false,
        createdAt = new Date(),
        updatedAt = new Date()
    }) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.entityType = entityType;
        this.currentStep = currentStep;
        this.maxSteps = maxSteps;
        this.stepData = stepData;
        this.expiresAt = expiresAt;
        this.completed = completed;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;

        this.validate();
    }

    validate() {
        if (!this.sessionId) throw new Error('Session ID is required');
        if (!this.userId) throw new Error('User ID is required');
        if (!this.entityType) throw new Error('Entity type is required');
        if (this.currentStep < 1) throw new Error('Step must be >= 1');
        if (this.currentStep > this.maxSteps) {
            throw new Error('Current step cannot exceed max steps');
        }
        if (this.expiresAt < new Date()) {
            throw new Error('Session has expired');
        }
    }

    advanceStep(newStepData) {
        if (this.completed) {
            throw new Error('Cannot advance completed session');
        }

        this.currentStep += 1;
        this.stepData = { ...this.stepData, ...newStepData };
        this.updatedAt = new Date();
    }

    markComplete() {
        this.completed = true;
        this.updatedAt = new Date();
    }

    isExpired() {
        return this.expiresAt < new Date();
    }

    canAdvance() {
        return !this.completed && this.currentStep < this.maxSteps;
    }
}

module.exports = { AuthorizationSession };
```

##### Module Definition Extension for Multi-Step

```javascript
// Example: packages/clientcore-frigg/backend/src/api-modules/nagaris/definition.js

class NagarisDefinition {
    static getName() {
        return 'nagaris';
    }

    // NEW: Multi-step configuration
    static getAuthStepCount() {
        return 2; // Default is 1 for single-step modules
    }

    // NEW: Get requirements for specific step
    static async getAuthRequirementsForStep(step = 1) {
        if (step === 1) {
            return {
                type: 'email',
                data: {
                    jsonSchema: {
                        title: 'Nagaris Authentication',
                        type: 'object',
                        required: ['email'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email Address'
                            }
                        }
                    },
                    uiSchema: {
                        email: {
                            'ui:placeholder': 'your.email@company.com',
                            'ui:help': 'Enter your Nagaris account email'
                        }
                    }
                }
            };
        }

        if (step === 2) {
            return {
                type: 'otp',
                data: {
                    jsonSchema: {
                        title: 'Verify OTP Code',
                        type: 'object',
                        required: ['email', 'otp'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email',
                                readOnly: true
                            },
                            otp: {
                                type: 'string',
                                title: 'Verification Code',
                                minLength: 6,
                                maxLength: 6
                            }
                        }
                    },
                    uiSchema: {
                        email: {
                            'ui:readonly': true
                        },
                        otp: {
                            'ui:placeholder': '000000',
                            'ui:help': 'Enter the 6-digit code sent to your email'
                        }
                    }
                }
            };
        }

        throw new Error(`Step ${step} not defined for Nagaris`);
    }

    // NEW: Process authorization for specific step
    static async processAuthorizationStep(api, step, stepData, sessionData = {}) {
        if (step === 1) {
            // Step 1: Request OTP
            const { email } = stepData;
            await api.requestEmailLogin(email);

            return {
                nextStep: 2,
                stepData: { email } // Store for next step
            };
        }

        if (step === 2) {
            // Step 2: Verify OTP and complete auth
            const { email, otp } = stepData;
            const authResponse = await api.verifyOtp(email, otp);

            // Return auth data for ProcessAuthorizationCallback
            return {
                completed: true,
                authData: authResponse
            };
        }

        throw new Error(`Step ${step} not implemented for Nagaris`);
    }
}

module.exports = NagarisDefinition;
```

#### B. Infrastructure Layer

##### AuthorizationSession Repository Interface

```javascript
// packages/core/modules/repositories/authorization-session-repository-interface.js

class AuthorizationSessionRepositoryInterface {
    /**
     * Create a new authorization session
     * @param {AuthorizationSession} session
     * @returns {Promise<AuthorizationSession>}
     */
    async create(session) {
        throw new Error('Method not implemented');
    }

    /**
     * Find session by ID
     * @param {string} sessionId
     * @returns {Promise<AuthorizationSession|null>}
     */
    async findBySessionId(sessionId) {
        throw new Error('Method not implemented');
    }

    /**
     * Find active session for user and entity type
     * @param {string} userId
     * @param {string} entityType
     * @returns {Promise<AuthorizationSession|null>}
     */
    async findActiveSession(userId, entityType) {
        throw new Error('Method not implemented');
    }

    /**
     * Update existing session
     * @param {AuthorizationSession} session
     * @returns {Promise<AuthorizationSession>}
     */
    async update(session) {
        throw new Error('Method not implemented');
    }

    /**
     * Delete expired sessions (cleanup)
     * @returns {Promise<number>} Number of deleted sessions
     */
    async deleteExpired() {
        throw new Error('Method not implemented');
    }
}

module.exports = { AuthorizationSessionRepositoryInterface };
```

##### MongoDB Implementation

```javascript
// packages/core/modules/repositories/authorization-session-repository-mongo.js

const mongoose = require('mongoose');
const { AuthorizationSession } = require('../domain/entities/AuthorizationSession');
const { AuthorizationSessionRepositoryInterface } = require('./authorization-session-repository-interface');

const AuthorizationSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    currentStep: { type: Number, default: 1 },
    maxSteps: { type: Number, required: true },
    stepData: { type: mongoose.Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true, index: true },
    completed: { type: Boolean, default: false, index: true }
}, { timestamps: true });

// Auto-delete expired sessions
AuthorizationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuthorizationSessionModel = mongoose.model('AuthorizationSession', AuthorizationSessionSchema);

class AuthorizationSessionRepositoryMongo extends AuthorizationSessionRepositoryInterface {
    async create(session) {
        const doc = new AuthorizationSessionModel({
            sessionId: session.sessionId,
            userId: session.userId,
            entityType: session.entityType,
            currentStep: session.currentStep,
            maxSteps: session.maxSteps,
            stepData: session.stepData,
            expiresAt: session.expiresAt,
            completed: session.completed
        });

        const saved = await doc.save();
        return this._toEntity(saved);
    }

    async findBySessionId(sessionId) {
        const doc = await AuthorizationSessionModel.findOne({
            sessionId,
            expiresAt: { $gt: new Date() }
        });

        return doc ? this._toEntity(doc) : null;
    }

    async findActiveSession(userId, entityType) {
        const doc = await AuthorizationSessionModel.findOne({
            userId,
            entityType,
            completed: false,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 });

        return doc ? this._toEntity(doc) : null;
    }

    async update(session) {
        const updated = await AuthorizationSessionModel.findOneAndUpdate(
            { sessionId: session.sessionId },
            {
                currentStep: session.currentStep,
                stepData: session.stepData,
                completed: session.completed,
                updatedAt: new Date()
            },
            { new: true }
        );

        return this._toEntity(updated);
    }

    async deleteExpired() {
        const result = await AuthorizationSessionModel.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        return result.deletedCount;
    }

    _toEntity(doc) {
        return new AuthorizationSession({
            sessionId: doc.sessionId,
            userId: doc.userId,
            entityType: doc.entityType,
            currentStep: doc.currentStep,
            maxSteps: doc.maxSteps,
            stepData: doc.stepData,
            expiresAt: doc.expiresAt,
            completed: doc.completed,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        });
    }
}

module.exports = { AuthorizationSessionRepositoryMongo };
```

##### PostgreSQL Implementation

```javascript
// packages/core/modules/repositories/authorization-session-repository-postgres.js

const { PrismaClient } = require('@prisma/client');
const { AuthorizationSession } = require('../domain/entities/AuthorizationSession');
const { AuthorizationSessionRepositoryInterface } = require('./authorization-session-repository-interface');

const prisma = new PrismaClient();

class AuthorizationSessionRepositoryPostgres extends AuthorizationSessionRepositoryInterface {
    async create(session) {
        const created = await prisma.authorizationSession.create({
            data: {
                sessionId: session.sessionId,
                userId: session.userId,
                entityType: session.entityType,
                currentStep: session.currentStep,
                maxSteps: session.maxSteps,
                stepData: session.stepData,
                expiresAt: session.expiresAt,
                completed: session.completed
            }
        });

        return this._toEntity(created);
    }

    async findBySessionId(sessionId) {
        const record = await prisma.authorizationSession.findFirst({
            where: {
                sessionId,
                expiresAt: { gt: new Date() }
            }
        });

        return record ? this._toEntity(record) : null;
    }

    async findActiveSession(userId, entityType) {
        const record = await prisma.authorizationSession.findFirst({
            where: {
                userId,
                entityType,
                completed: false,
                expiresAt: { gt: new Date() }
            },
            orderBy: { createdAt: 'desc' }
        });

        return record ? this._toEntity(record) : null;
    }

    async update(session) {
        const updated = await prisma.authorizationSession.update({
            where: { sessionId: session.sessionId },
            data: {
                currentStep: session.currentStep,
                stepData: session.stepData,
                completed: session.completed,
                updatedAt: new Date()
            }
        });

        return this._toEntity(updated);
    }

    async deleteExpired() {
        const result = await prisma.authorizationSession.deleteMany({
            where: {
                expiresAt: { lt: new Date() }
            }
        });
        return result.count;
    }

    _toEntity(record) {
        return new AuthorizationSession({
            sessionId: record.sessionId,
            userId: record.userId,
            entityType: record.entityType,
            currentStep: record.currentStep,
            maxSteps: record.maxSteps,
            stepData: record.stepData,
            expiresAt: record.expiresAt,
            completed: record.completed,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        });
    }
}

module.exports = { AuthorizationSessionRepositoryPostgres };
```

##### Repository Factory

```javascript
// packages/core/modules/repositories/authorization-session-repository-factory.js

const { getDBAdapter } = require('../../database/getDBAdapter');

function createAuthorizationSessionRepository() {
    const dbType = process.env.FRIGG_DATABASE_TYPE || 'mongodb';

    if (dbType === 'mongodb') {
        const { AuthorizationSessionRepositoryMongo } = require('./authorization-session-repository-mongo');
        return new AuthorizationSessionRepositoryMongo();
    }

    if (dbType === 'postgres' || dbType === 'postgresql') {
        const { AuthorizationSessionRepositoryPostgres } = require('./authorization-session-repository-postgres');
        return new AuthorizationSessionRepositoryPostgres();
    }

    throw new Error(`Unsupported database type: ${dbType}`);
}

module.exports = { createAuthorizationSessionRepository };
```

#### C. Application Layer - Use Cases

##### StartAuthorizationSessionUseCase

```javascript
// packages/core/modules/use-cases/start-authorization-session.js

const crypto = require('crypto');
const { AuthorizationSession } = require('../domain/entities/AuthorizationSession');

class StartAuthorizationSessionUseCase {
    /**
     * @param {Object} params
     * @param {AuthorizationSessionRepositoryInterface} params.authSessionRepository
     */
    constructor({ authSessionRepository }) {
        this.authSessionRepository = authSessionRepository;
    }

    /**
     * Start a new multi-step authorization session
     * @param {string} userId
     * @param {string} entityType
     * @param {number} maxSteps
     * @returns {Promise<AuthorizationSession>}
     */
    async execute(userId, entityType, maxSteps) {
        // Generate unique session ID
        const sessionId = crypto.randomUUID();

        // 15 minute expiry
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        const session = new AuthorizationSession({
            sessionId,
            userId,
            entityType,
            currentStep: 1,
            maxSteps,
            stepData: {},
            expiresAt,
            completed: false
        });

        return await this.authSessionRepository.create(session);
    }
}

module.exports = { StartAuthorizationSessionUseCase };
```

##### ProcessAuthorizationStepUseCase

```javascript
// packages/core/modules/use-cases/process-authorization-step.js

class ProcessAuthorizationStepUseCase {
    /**
     * @param {Object} params
     * @param {AuthorizationSessionRepositoryInterface} params.authSessionRepository
     * @param {Array<Object>} params.moduleDefinitions
     */
    constructor({ authSessionRepository, moduleDefinitions }) {
        this.authSessionRepository = authSessionRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * Process a single step of multi-step authorization
     * @param {string} sessionId
     * @param {string} userId
     * @param {number} step
     * @param {Object} stepData
     * @returns {Promise<Object>} Result with nextStep or completion data
     */
    async execute(sessionId, userId, step, stepData) {
        // Load session
        const session = await this.authSessionRepository.findBySessionId(sessionId);

        if (!session) {
            throw new Error('Authorization session not found or expired');
        }

        if (session.userId !== userId) {
            throw new Error('Session does not belong to this user');
        }

        if (session.isExpired()) {
            throw new Error('Authorization session has expired');
        }

        if (session.currentStep + 1 !== step && step !== 1) {
            throw new Error(
                `Expected step ${session.currentStep + 1}, received step ${step}`
            );
        }

        // Find module definition
        const moduleDefinition = this.moduleDefinitions.find(
            def => def.moduleName === session.entityType
        );

        if (!moduleDefinition) {
            throw new Error(`Module definition not found: ${session.entityType}`);
        }

        // Get module's Definition class
        const ModuleDefinition = moduleDefinition.definition;

        // Create API instance for this step
        const ApiClass = moduleDefinition.apiClass;
        const api = new ApiClass({ userId });

        // Process the step
        const result = await ModuleDefinition.processAuthorizationStep(
            api,
            step,
            stepData,
            session.stepData
        );

        if (result.completed) {
            // Final step complete - mark session as done
            session.markComplete();
            await this.authSessionRepository.update(session);

            return {
                completed: true,
                authData: result.authData,
                sessionId
            };
        }

        // Intermediate step - update session and return next requirements
        session.advanceStep(result.stepData || {});
        await this.authSessionRepository.update(session);

        // Get requirements for next step
        const nextRequirements = await ModuleDefinition.getAuthRequirementsForStep(
            result.nextStep
        );

        return {
            nextStep: result.nextStep,
            totalSteps: session.maxSteps,
            sessionId,
            requirements: nextRequirements,
            message: result.message
        };
    }
}

module.exports = { ProcessAuthorizationStepUseCase };
```

##### GetAuthorizationRequirementsUseCase

```javascript
// packages/core/modules/use-cases/get-authorization-requirements.js

class GetAuthorizationRequirementsUseCase {
    /**
     * @param {Object} params
     * @param {Array<Object>} params.moduleDefinitions
     */
    constructor({ moduleDefinitions }) {
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * Get authorization requirements for a specific step
     * @param {string} entityType
     * @param {number} step
     * @returns {Promise<Object>}
     */
    async execute(entityType, step = 1) {
        const moduleDefinition = this.moduleDefinitions.find(
            def => def.moduleName === entityType
        );

        if (!moduleDefinition) {
            throw new Error(`Module definition not found: ${entityType}`);
        }

        const ModuleDefinition = moduleDefinition.definition;

        // Get step count
        const stepCount = ModuleDefinition.getAuthStepCount
            ? ModuleDefinition.getAuthStepCount()
            : 1;

        // Get requirements for this step
        const requirements = ModuleDefinition.getAuthRequirementsForStep
            ? await ModuleDefinition.getAuthRequirementsForStep(step)
            : await ModuleDefinition.getAuthorizationRequirements();

        return {
            ...requirements,
            step,
            totalSteps: stepCount,
            isMultiStep: stepCount > 1
        };
    }
}

module.exports = { GetAuthorizationRequirementsUseCase };
```

#### D. Presentation Layer - Router Updates

```javascript
// packages/core/integrations/integration-router.js

const { createAuthorizationSessionRepository } = require('../modules/repositories/authorization-session-repository-factory');
const { StartAuthorizationSessionUseCase } = require('../modules/use-cases/start-authorization-session');
const { ProcessAuthorizationStepUseCase } = require('../modules/use-cases/process-authorization-step');
const { GetAuthorizationRequirementsUseCase } = require('../modules/use-cases/get-authorization-requirements');

function setEntityRoutes(router, getUserFromBearerToken, useCases) {
    const { processAuthorizationCallback, /* ... other use cases */ } = useCases;

    // Initialize multi-step auth use cases
    const authSessionRepository = createAuthorizationSessionRepository();
    const moduleDefinitions = getModulesDefinitionFromIntegrationClasses(integrationClasses);

    const startAuthSession = new StartAuthorizationSessionUseCase({
        authSessionRepository
    });

    const processAuthStep = new ProcessAuthorizationStepUseCase({
        authSessionRepository,
        moduleDefinitions
    });

    const getAuthRequirements = new GetAuthorizationRequirementsUseCase({
        moduleDefinitions
    });

    // GET /api/authorize - Get authorization requirements (supports multi-step)
    router.route('/api/authorize').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(req.headers.authorization);
            const userId = user.getId();

            const params = checkRequiredParams(req.query, ['entityType']);
            const step = parseInt(req.query.step || '1', 10);
            const sessionId = req.query.sessionId;

            // Validate session if step > 1
            if (step > 1 && !sessionId) {
                throw Boom.badRequest('sessionId required for step > 1');
            }

            const requirements = await getAuthRequirements.execute(
                params.entityType,
                step
            );

            // Generate session ID for multi-step flows
            if (requirements.isMultiStep && step === 1) {
                const crypto = require('crypto');
                requirements.sessionId = crypto.randomUUID();
            } else if (sessionId) {
                requirements.sessionId = sessionId;
            }

            res.json(requirements);
        })
    );

    // POST /api/authorize - Process authorization (supports multi-step)
    router.route('/api/authorize').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(req.headers.authorization);
            const userId = user.getId();

            const params = checkRequiredParams(req.body, ['entityType', 'data']);
            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId;

            // Check if this is a multi-step module
            const moduleDefinition = moduleDefinitions.find(
                def => def.moduleName === params.entityType
            );

            if (!moduleDefinition) {
                throw Boom.badRequest(`Unknown entity type: ${params.entityType}`);
            }

            const ModuleDefinition = moduleDefinition.definition;
            const stepCount = ModuleDefinition.getAuthStepCount
                ? ModuleDefinition.getAuthStepCount()
                : 1;

            if (stepCount === 1) {
                // Single-step flow - use existing ProcessAuthorizationCallback
                const entityDetails = await processAuthorizationCallback.execute(
                    userId,
                    params.entityType,
                    params.data
                );

                return res.json(entityDetails);
            }

            // Multi-step flow
            if (!sessionId) {
                throw Boom.badRequest('sessionId required for multi-step authorization');
            }

            let session;

            if (step === 1) {
                // Create new session
                session = await startAuthSession.execute(
                    userId,
                    params.entityType,
                    stepCount
                );

                // Override with provided sessionId
                session.sessionId = sessionId;
                await authSessionRepository.update(session);
            }

            // Process this step
            const result = await processAuthStep.execute(
                sessionId,
                userId,
                step,
                params.data
            );

            if (result.completed) {
                // Final step - create entity using standard flow
                const entityDetails = await processAuthorizationCallback.execute(
                    userId,
                    params.entityType,
                    result.authData
                );

                return res.json(entityDetails);
            }

            // Return next step requirements
            res.json({
                step: result.nextStep,
                totalSteps: result.totalSteps,
                sessionId: result.sessionId,
                requirements: result.requirements,
                message: result.message
            });
        })
    );

    // ... rest of existing routes
}
```

---

### 2. Frontend Multi-Step UI

#### Updated API Client

```javascript
// packages/ui/lib/api/api.js

export default class API {
    // ... existing methods ...

    /**
     * Get authorization requirements for specific step
     */
    async getAuthorizeRequirements(entityType, connectingEntityType = '', step = 1, sessionId = null) {
        let url = `${this.endpointAuthorize}?entityType=${entityType}&connectingEntityType=${connectingEntityType}&step=${step}`;
        if (sessionId) {
            url += `&sessionId=${sessionId}`;
        }
        return this._get(url);
    }

    /**
     * Submit authorization step (supports multi-step)
     */
    async authorize(entityType, authData, step = 1, sessionId = null) {
        const params = {
            entityType,
            data: authData,
            step
        };

        if (sessionId) {
            params.sessionId = sessionId;
        }

        return this._post(this.endpointAuthorize, params);
    }
}
```

#### Multi-Step Wizard Component

```jsx
// packages/ui/lib/integration/presentation/components/MultiStepAuthWizard.jsx

import React, { useState, useEffect } from 'react';
import { Form } from '@jsonforms/react';

export const MultiStepAuthWizard = ({
    api,
    entityType,
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
            setError(null);

            const reqs = await api.getAuthorizeRequirements(entityType, '', 1);

            setCurrentStep(reqs.step || 1);
            setTotalSteps(reqs.totalSteps || 1);
            setSessionId(reqs.sessionId);
            setRequirements(reqs);
        } catch (err) {
            console.error('Failed to initialize auth:', err);
            setError(err.message || 'Failed to load authentication requirements');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        try {
            setLoading(true);
            setError(null);

            const result = await api.authorize(
                entityType,
                formData,
                currentStep,
                sessionId
            );

            // Check if there's a nextStep (multi-step)
            if (result.nextStep) {
                // Move to next step
                setCurrentStep(result.nextStep);
                setTotalSteps(result.totalSteps);
                setSessionId(result.sessionId);
                setRequirements(result.requirements);

                // Pre-populate form with data from previous step if available
                const nextFormData = {};
                if (result.requirements?.data?.jsonSchema?.properties) {
                    Object.keys(result.requirements.data.jsonSchema.properties).forEach(key => {
                        if (formData[key]) {
                            nextFormData[key] = formData[key];
                        }
                    });
                }
                setFormData(nextFormData);
            } else {
                // Auth complete
                onSuccess(result);
            }
        } catch (err) {
            console.error('Auth step failed:', err);
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !requirements) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                <span className="ml-3 text-sm text-muted-foreground">
                    Loading authentication...
                </span>
            </div>
        );
    }

    if (error && !requirements) {
        return (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-6">
                <h3 className="text-lg font-semibold text-destructive mb-2">
                    Authentication Error
                </h3>
                <p className="text-sm text-destructive/90 mb-4">{error}</p>
                <button
                    onClick={initializeAuth}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 text-sm"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Progress indicator for multi-step */}
            {totalSteps > 1 && (
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
            )}

            {/* Step content */}
            <div className="space-y-4">
                {requirements?.data?.jsonSchema && (
                    <>
                        <h3 className="text-lg font-semibold">
                            {requirements.data.jsonSchema.title || `Step ${currentStep}`}
                        </h3>
                        {requirements.data.jsonSchema.description && (
                            <p className="text-sm text-muted-foreground">
                                {requirements.data.jsonSchema.description}
                            </p>
                        )}

                        <Form
                            schema={requirements.data.jsonSchema}
                            uiSchema={requirements.data.uiSchema || {}}
                            data={formData}
                            onChange={({ data }) => setFormData(data)}
                        />
                    </>
                )}

                {requirements?.type === 'oauth2' && (
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">
                            Click the button below to authorize through a secure OAuth connection.
                        </p>
                        <button
                            onClick={() => window.location.href = requirements.url}
                            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
                        >
                            Authorize with OAuth
                        </button>
                    </div>
                )}

                {error && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t border-border">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors font-medium text-sm"
                >
                    Cancel
                </button>
                {requirements?.type !== 'oauth2' && (
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                        )}
                        {loading ? 'Processing...' : (currentStep === totalSteps ? 'Complete' : 'Continue')}
                    </button>
                )}
            </div>
        </div>
    );
};
```

#### Updated EntityConnectionModal

```jsx
// packages/ui/lib/integration/presentation/components/EntityConnectionModal.jsx

import React, { useEffect, useState } from 'react';
import { MultiStepAuthWizard } from './MultiStepAuthWizard';

export const EntityConnectionModal = ({
    isOpen,
    entityType,
    api,
    onSuccess,
    onCancel
}) => {
    const [authInfo, setAuthInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && entityType) {
            checkAuthType();
        }
    }, [isOpen, entityType]);

    const checkAuthType = async () => {
        try {
            setLoading(true);
            const info = await api.getAuthorizeRequirements(entityType, '', 1);
            setAuthInfo(info);
        } catch (err) {
            console.error('Failed to check auth type:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">
                    Connect {entityType}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {authInfo?.isMultiStep
                        ? `Complete ${authInfo.totalSteps} steps to connect your account`
                        : 'Create a new connection to continue'}
                </p>
            </div>

            {/* Content - Use wizard for both single and multi-step */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                </div>
            ) : (
                <MultiStepAuthWizard
                    api={api}
                    entityType={entityType}
                    onSuccess={onSuccess}
                    onCancel={onCancel}
                />
            )}
        </div>
    );
};
```

---

## Key Architectural Decisions

### 1. Module Definition Extensions vs Separate Classes
**Decision**: Extend module Definition classes with step methods
**Rationale**: Keeps auth logic co-located with module, easier to understand and maintain

### 2. Repository Pattern for Sessions
**Decision**: Use repository interface with MongoDB/PostgreSQL implementations
**Rationale**: Consistent with current architecture, swappable storage backends

### 3. Use Case Orchestration
**Decision**: Create dedicated use cases for session lifecycle
**Rationale**: Follows DDD patterns, testable, maintains separation of concerns

### 4. Backward Compatibility
**Decision**: Single-step modules continue to work without changes
**Rationale**: `getAuthStepCount()` defaults to 1, existing flow unchanged

---

## Migration from V1 Spec

### Removed
- ❌ Auther class and Delegate pattern
- ❌ Direct model access in routes
- ❌ processAuthorizationCallback in Auther

### Added
- ✅ AuthorizationSession entity (domain layer)
- ✅ Repository pattern for sessions
- ✅ Use cases for step processing
- ✅ Module Definition extensions

### Updated
- 🔄 Integration router uses use cases instead of direct module calls
- 🔄 ProcessAuthorizationCallback remains for final entity creation
- 🔄 Frontend API client updated for step parameters

---

## Security Considerations

1. **Session Security**
   - Cryptographically secure UUIDs for session IDs
   - 15-minute expiration with MongoDB TTL index
   - User ID validation on every step
   - Step sequence validation (can't skip steps)

2. **Data Storage**
   - `stepData` stored encrypted at rest (MongoDB field-level encryption)
   - Sensitive auth tokens not stored in session
   - Auto-cleanup of expired sessions

3. **Rate Limiting**
   - Limit session creation per user (e.g., 5 active sessions max)
   - Limit step submission attempts (prevent brute force)
   - Exponential backoff for failed OTP attempts

---

## Success Metrics

- [ ] **Nagaris OTP flow** works end-to-end
- [ ] **Backward compatibility** - All existing single-step modules work unchanged
- [ ] **Performance** - Multi-step adds <200ms latency per step
- [ ] **Developer experience** - Clear documentation and examples
- [ ] **Test coverage** - >80% for new code

---

## Next Steps

1. **Review Updated Spec** - Team feedback on v2.0 architecture
2. **Validate Nagaris API** - Confirm endpoints match spec
3. **Create Feature Branch** - `feature/multi-step-auth-v2`
4. **Implement Phase 1** - Domain entities and repositories
5. **Progressive Implementation** - Follow roadmap phases

---

*Document Version: 2.0*
*Updated for DDD/Hexagonal Architecture*
*Last Updated: 2025-10-02*
