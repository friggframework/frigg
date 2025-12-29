# Frigg UI Library v2: Implementation Guide

**Version:** 2.0.0
**Date:** 2025-01-15
**Package:** `@friggframework/ui`

---

## Table of Contents

1. [Overview](#overview)
2. [FriggApiAdapter Updates](#friggapiadapter-updates)
3. [Legacy API.js Updates](#legacy-apijs-updates)
4. [New Components](#new-components)
5. [Updated Components](#updated-components)
6. [Hooks](#hooks)
7. [Complete Usage Examples](#complete-usage-examples)

---

## Overview

### Breaking Changes from v1

**API Adapter:**
- ❌ Removed: `getAuthorizeRequirements(entityType, connectingEntityType)`
- ✅ Added: `getModuleAuthorizationRequirements(moduleType, step, sessionId)`
- ❌ Removed: `authorizeEntity(entityType, data)`
- ✅ Added: `submitModuleAuthorization(moduleType, data)`

**New Features:**
- ✅ Credential management API
- ✅ Entity re-authentication
- ✅ Multi-layer recovery system
- ✅ Authorization session management

---

## FriggApiAdapter Updates

**File:** `packages/ui/lib/integration/infrastructure/adapters/FriggApiAdapter.js`

### Complete Updated Implementation

```javascript
/**
 * @file Frigg API Adapter v2
 * @description Infrastructure adapter for Frigg backend API
 * Handles all HTTP communication with the Frigg backend
 */

export class FriggApiAdapter {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || '/api';
        this.headers = config.headers || {};
        this.authToken = config.authToken || null;
    }

    /**
     * Set authentication token
     */
    setAuthToken(token) {
        this.authToken = token;
    }

    /**
     * Get default headers with auth
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            ...this.headers
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        return headers;
    }

    /**
     * Generic fetch wrapper with error handling
     */
    async fetch(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            // Handle 204 No Content
            if (response.status === 204) {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    // =========================================================================
    // MODULE ENDPOINTS (NEW)
    // =========================================================================

    /**
     * GET /api/modules - List available module types
     */
    async listModules() {
        return await this.fetch('/modules');
    }

    /**
     * GET /api/modules/:moduleType/authorization - Get authorization requirements
     * @param {string} moduleType - Module type (e.g., 'slack', 'hubspot')
     * @param {number} step - Step number for multi-step auth (default: 1)
     * @param {string|null} sessionId - Session ID for steps > 1
     */
    async getModuleAuthorizationRequirements(moduleType, step = 1, sessionId = null) {
        let url = `/modules/${encodeURIComponent(moduleType)}/authorization?step=${step}`;
        if (sessionId) {
            url += `&sessionId=${encodeURIComponent(sessionId)}`;
        }
        return await this.fetch(url);
    }

    /**
     * POST /api/modules/:moduleType/authorization - Submit authorization data
     * @param {string} moduleType - Module type
     * @param {object} data - Authorization data
     * @param {number} step - Step number (optional for single-step)
     * @param {string} sessionId - Session ID (required for multi-step)
     * @param {string} credentialId - Credential ID (for steps > 1)
     */
    async submitModuleAuthorization(moduleType, data, step = null, sessionId = null, credentialId = null) {
        const body = { data };

        if (step) body.step = step;
        if (sessionId) body.sessionId = sessionId;
        if (credentialId) body.credentialId = credentialId;

        return await this.fetch(`/modules/${encodeURIComponent(moduleType)}/authorization`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    // =========================================================================
    // CREDENTIAL ENDPOINTS (NEW)
    // =========================================================================

    /**
     * GET /api/credentials - List user's credentials
     * @param {object} filters - Optional filters
     * @param {string} filters.status - Filter by status (orphaned, active, invalid)
     * @param {string} filters.moduleType - Filter by module type
     */
    async listCredentials(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.moduleType) params.append('moduleType', filters.moduleType);

        const queryString = params.toString();
        return await this.fetch(`/credentials${queryString ? '?' + queryString : ''}`);
    }

    /**
     * GET /api/credentials/:credentialId - Get credential details
     */
    async getCredential(credentialId) {
        return await this.fetch(`/credentials/${credentialId}`);
    }

    /**
     * DELETE /api/credentials/:credentialId - Delete credential
     * @param {string} credentialId - Credential ID
     * @param {boolean} cascade - Also delete dependent entities
     */
    async deleteCredential(credentialId, cascade = false) {
        const url = `/credentials/${credentialId}${cascade ? '?cascade=true' : ''}`;
        return await this.fetch(url, { method: 'DELETE' });
    }

    /**
     * GET /api/credentials/:credentialId/test - Test credential validity
     */
    async testCredential(credentialId) {
        return await this.fetch(`/credentials/${credentialId}/test`);
    }

    /**
     * POST /api/credentials/:credentialId/resume - Resume authorization from credential
     */
    async resumeAuthorizationFromCredential(credentialId) {
        return await this.fetch(`/credentials/${credentialId}/resume`, {
            method: 'POST'
        });
    }

    /**
     * GET /api/credentials/:credentialId/options - Get options using credential
     */
    async getCredentialOptions(credentialId) {
        return await this.fetch(`/credentials/${credentialId}/options`);
    }

    // =========================================================================
    // ENTITY ENDPOINTS (UPDATED)
    // =========================================================================

    /**
     * GET /api/entities - Get user's entities
     * @param {object} filters - Optional filters
     * @param {string} filters.moduleType - Filter by module type
     */
    async getEntities(filters = {}) {
        const params = new URLSearchParams();
        if (filters.moduleType) params.append('moduleType', filters.moduleType);

        const queryString = params.toString();
        return await this.fetch(`/entities${queryString ? '?' + queryString : ''}`);
    }

    /**
     * GET /api/entities/:entityId - Get specific entity
     */
    async getEntity(entityId) {
        return await this.fetch(`/entities/${entityId}`);
    }

    /**
     * DELETE /api/entities/:entityId - Delete entity
     * @param {string} entityId - Entity ID
     * @param {boolean} deleteCredential - Also delete credential if unused
     */
    async deleteEntity(entityId, deleteCredential = false) {
        const url = `/entities/${entityId}${deleteCredential ? '?deleteCredential=true' : ''}`;
        return await this.fetch(url, { method: 'DELETE' });
    }

    /**
     * GET /api/entities/:entityId/test - Test entity connection (RENAMED from test-auth)
     */
    async testEntity(entityId) {
        return await this.fetch(`/entities/${entityId}/test`);
    }

    /**
     * POST /api/entities/:entityId/reauthorize - Initiate entity re-authentication (NEW)
     */
    async initiateEntityReauthorization(entityId) {
        return await this.fetch(`/entities/${entityId}/reauthorize`, {
            method: 'POST'
        });
    }

    /**
     * POST /api/entities/:entityId/reauthorize/complete - Complete re-authentication (NEW)
     */
    async completeEntityReauthorization(entityId, data) {
        return await this.fetch(`/entities/${entityId}/reauthorize/complete`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * POST /api/entities/:entityId/options - Get entity options
     */
    async getEntityOptions(entityId, optionType = null) {
        const body = optionType ? { optionType } : {};
        return await this.fetch(`/entities/${entityId}/options`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    /**
     * POST /api/entities/:entityId/options/refresh - Refresh entity options
     */
    async refreshEntityOptions(entityId, optionType = null) {
        const body = optionType ? { optionType } : {};
        return await this.fetch(`/entities/${entityId}/options/refresh`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    // =========================================================================
    // INTEGRATION ENDPOINTS (MINOR UPDATES)
    // =========================================================================

    /**
     * GET /api/integrations/options - Get available integration types
     */
    async getIntegrationOptions() {
        return await this.fetch('/integrations/options');
    }

    /**
     * GET /api/integrations - Get user's installed integrations
     */
    async getIntegrations() {
        return await this.fetch('/integrations');
    }

    /**
     * GET /api/integrations/:id - Get specific integration
     */
    async getIntegration(integrationId) {
        return await this.fetch(`/integrations/${integrationId}`);
    }

    /**
     * POST /api/integrations - Create new integration
     */
    async createIntegration(data) {
        return await this.fetch('/integrations', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PATCH /api/integrations/:id - Update integration
     */
    async updateIntegration(integrationId, data) {
        return await this.fetch(`/integrations/${integrationId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE /api/integrations/:id - Delete integration
     */
    async deleteIntegration(integrationId) {
        return await this.fetch(`/integrations/${integrationId}`, {
            method: 'DELETE'
        });
    }

    /**
     * GET /api/integrations/:id/test - Test integration (RENAMED from test-auth)
     */
    async testIntegration(integrationId) {
        return await this.fetch(`/integrations/${integrationId}/test`);
    }

    // ... (config/options and actions methods remain unchanged)
}
```

---

## Legacy API.js Updates

**File:** `packages/ui/lib/api/api.js`

### Complete Updated Implementation

```javascript
export default class API {
  constructor(baseUrl, jwt) {
    this.baseURL = baseUrl;
    this.jwt = jwt;

    this.endpointLogin = "/user/login";
    this.endpointCreateUser = "/user/create";

    // UPDATED: New module-based authorization endpoints
    this.endpointModuleAuthorization = (moduleType) =>
      `/api/modules/${moduleType}/authorization`;

    this.endpointIntegrations = "/api/integrations";
    this.endpointIntegration = (id) => `/api/integrations/${id}`;
    this.endpointIntegrationConfigOptions = (id) =>
      `${this.endpointIntegration(id)}/config/options`;
    this.endpointSampleData = (id) => `/api/demo/sample/${id}`;
    this.endpointIntegrationUserActions = (id) =>
      `/api/integrations/${id}/actions`;
    this.endpointIntegrationUserActionOptions = (id, action) =>
      `/api/integrations/${id}/actions/${action}/options`;
    this.endpointIntegrationUserActionSubmit = (id, action) =>
      `/api/integrations/${id}/actions/${action}`;
  }

  // ... (login, createUser, headers, _checkResponse, _get, _post, _patch, _delete remain unchanged)

  // =========================================================================
  // MODULE ENDPOINTS (NEW)
  // =========================================================================

  // Get available modules
  async listModules() {
    return this._get('/api/modules');
  }

  // Get authorization requirements for module
  // UPDATED: Changed from getAuthorizeRequirements(entityType, connectingEntityType, step, sessionId)
  async getModuleAuthorizationRequirements(moduleType, step = 1, sessionId = null) {
    let url = `/api/modules/${moduleType}/authorization?step=${step}`;
    if (sessionId) {
      url += `&sessionId=${sessionId}`;
    }
    return this._get(url);
  }

  // Submit authorization step
  // UPDATED: Changed from authorize(entityType, authData, step, sessionId)
  async submitModuleAuthorization(moduleType, data, step = null, sessionId = null, credentialId = null) {
    const params = { data };
    if (step) params.step = step;
    if (sessionId) params.sessionId = sessionId;
    if (credentialId) params.credentialId = credentialId;

    return this._post(this.endpointModuleAuthorization(moduleType), params);
  }

  // =========================================================================
  // CREDENTIAL ENDPOINTS (NEW)
  // =========================================================================

  async listCredentials(filters = {}) {
    let url = '/api/credentials';
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.moduleType) params.append('moduleType', filters.moduleType);

    if (params.toString()) url += '?' + params.toString();
    return this._get(url);
  }

  async getCredential(credentialId) {
    return this._get(`/api/credentials/${credentialId}`);
  }

  async deleteCredential(credentialId, cascade = false) {
    const url = `/api/credentials/${credentialId}${cascade ? '?cascade=true' : ''}`;
    return this._delete(url, {});
  }

  async testCredential(credentialId) {
    return this._get(`/api/credentials/${credentialId}/test`);
  }

  async resumeFromCredential(credentialId) {
    return this._post(`/api/credentials/${credentialId}/resume`, {});
  }

  async getCredentialOptions(credentialId) {
    return this._get(`/api/credentials/${credentialId}/options`);
  }

  // =========================================================================
  // ENTITY ENDPOINTS (UPDATED)
  // =========================================================================

  // Get user's authorized entities/connected accounts
  async listEntities(filters = {}) {
    let url = '/api/entities';
    if (filters.moduleType) {
      url += `?moduleType=${filters.moduleType}`;
    }
    return this._get(url);
  }

  async getEntity(entityId) {
    return this._get(`/api/entities/${entityId}`);
  }

  async deleteEntity(entityId, deleteCredential = false) {
    const url = `/api/entities/${entityId}${deleteCredential ? '?deleteCredential=true' : ''}`;
    return this._delete(url, {});
  }

  // UPDATED: Renamed from testEntityAuth
  async testEntity(entityId) {
    return this._get(`/api/entities/${entityId}/test`);
  }

  // NEW: Re-authentication flow
  async initiateEntityReauthorization(entityId) {
    return this._post(`/api/entities/${entityId}/reauthorize`, {});
  }

  async completeEntityReauthorization(entityId, data) {
    return this._post(`/api/entities/${entityId}/reauthorize/complete`, data);
  }

  async getEntityOptions(entityId, optionType = null) {
    const data = optionType ? { optionType } : {};
    return this._post(`/api/entities/${entityId}/options`, data);
  }

  async refreshEntityOptions(entityId, optionType = null) {
    const data = optionType ? { optionType } : {};
    return this._post(`/api/entities/${entityId}/options/refresh`, data);
  }

  // =========================================================================
  // INTEGRATION ENDPOINTS (MINOR UPDATES)
  // =========================================================================

  // List user's installed integrations
  async listIntegrations() {
    return this._get(this.endpointIntegrations);
  }

  // Get available integration types/options configured in the Frigg instance
  async listIntegrationOptions() {
    return this._get(`${this.endpointIntegrations}/options`);
  }

  // UPDATED: Renamed from testIntegrationAuth
  async testIntegration(integrationId) {
    return this._get(`${this.endpointIntegration(integrationId)}/test`);
  }

  // ... (createIntegration, updateIntegration, deleteIntegration, config/options, actions remain unchanged)
}
```

---

## New Components

### 1. AuthorizationWizard (Updated)

**File:** `packages/ui/lib/integration/presentation/components/AuthorizationWizard.jsx`

```jsx
import { useState, useEffect } from 'react';
import { FriggApiAdapter } from '../../infrastructure/adapters/FriggApiAdapter';

/**
 * Multi-step authorization wizard with recovery support
 * Handles OAuth, form-based auth, and selections
 */
export function AuthorizationWizard({
  moduleType,
  onComplete,
  onCancel,
  authToken
}) {
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [credentialId, setCredentialId] = useState(null);
  const [requirements, setRequirements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const api = new FriggApiAdapter({ authToken });

  // Load requirements on mount or when step changes
  useEffect(() => {
    loadRequirements();
  }, [moduleType, step, sessionId]);

  // Check for recovery state on mount
  useEffect(() => {
    checkRecoveryState();
  }, []);

  const checkRecoveryState = () => {
    // Layer 1: Check localStorage
    const savedSessionId = localStorage.getItem(`auth_session_${moduleType}`);
    const savedCredentialId = localStorage.getItem(`auth_credential_${moduleType}`);
    const savedStep = localStorage.getItem(`auth_step_${moduleType}`);

    if (savedSessionId) {
      console.log('Recovering from localStorage session');
      setSessionId(savedSessionId);
      setCredentialId(savedCredentialId);
      setStep(parseInt(savedStep, 10) || 1);
    }
  };

  const loadRequirements = async () => {
    setLoading(true);
    setError(null);

    try {
      const reqs = await api.getModuleAuthorizationRequirements(
        moduleType,
        step,
        sessionId
      );

      setRequirements(reqs);

      // Store session info for recovery
      if (reqs.sessionId && !sessionId) {
        setSessionId(reqs.sessionId);
        localStorage.setItem(`auth_session_${moduleType}`, reqs.sessionId);
      }
      localStorage.setItem(`auth_step_${moduleType}`, step.toString());

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data) => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.submitModuleAuthorization(
        moduleType,
        data,
        step,
        sessionId,
        credentialId
      );

      if (result.completed) {
        // Success! Clean up localStorage
        localStorage.removeItem(`auth_session_${moduleType}`);
        localStorage.removeItem(`auth_credential_${moduleType}`);
        localStorage.removeItem(`auth_step_${moduleType}`);

        onComplete(result.entity);
      } else {
        // Multi-step: advance to next step
        setStep(result.step);
        setSessionId(result.sessionId);

        if (result.credentialId) {
          setCredentialId(result.credentialId);
          localStorage.setItem(`auth_credential_${moduleType}`, result.credentialId);
        }

        setRequirements(result.requirements);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Clean up localStorage
    localStorage.removeItem(`auth_session_${moduleType}`);
    localStorage.removeItem(`auth_credential_${moduleType}`);
    localStorage.removeItem(`auth_step_${moduleType}`);
    onCancel();
  };

  if (loading) {
    return <div>Loading authorization requirements...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={handleCancel}>Cancel</button>
        <button onClick={loadRequirements}>Retry</button>
      </div>
    );
  }

  if (!requirements) {
    return null;
  }

  return (
    <div className="authorization-wizard">
      <h2>Connect {moduleType}</h2>

      {requirements.isMultiStep && (
        <div className="progress">
          Step {requirements.step} of {requirements.totalSteps}
        </div>
      )}

      {requirements.type === 'oauth2' && (
        <OAuthStep
          requirements={requirements.data}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}

      {requirements.type === 'form' && (
        <FormStep
          schema={requirements.data.jsonSchema}
          uiSchema={requirements.data.uiSchema}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}

      {requirements.type === 'selection' && (
        <SelectionStep
          schema={requirements.data.jsonSchema}
          uiSchema={requirements.data.uiSchema}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
```

### 2. EntityCard with Re-authentication

**File:** `packages/ui/lib/integration/presentation/components/EntityCard.jsx`

```jsx
import { useState } from 'react';
import { FriggApiAdapter } from '../../infrastructure/adapters/FriggApiAdapter';

export function EntityCard({ entity, authToken, onUpdate, onDelete }) {
  const [testing, setTesting] = useState(false);
  const [reauthorizing, setReauthorizing] = useState(false);
  const [status, setStatus] = useState({
    valid: entity.isValid,
    message: entity.isValid ? 'Connected' : 'Unknown'
  });

  const api = new FriggApiAdapter({ authToken });

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await api.testEntity(entity.id);

      setStatus({
        valid: result.valid,
        message: result.valid ? 'Connected' : result.error,
        canReauthorize: result.canReauthorize
      });

      if (!result.valid) {
        // Show error notification
        console.error(`Entity ${entity.name} test failed:`, result.error);
      }
    } catch (error) {
      setStatus({
        valid: false,
        message: 'Test failed',
        error: error.message
      });
    } finally {
      setTesting(false);
    }
  };

  const handleReauthorize = async () => {
    setReauthorizing(true);
    try {
      const reauth = await api.initiateEntityReauthorization(entity.id);

      // Store re-auth session info
      localStorage.setItem('reauth_session_id', reauth.sessionId);
      localStorage.setItem('reauth_entity_id', entity.id);
      localStorage.setItem('reauth_module_type', reauth.moduleType);

      // Redirect to OAuth or show modal
      if (reauth.requirements.type === 'oauth2') {
        const { authorizationUrl } = reauth.requirements.data;
        window.location.href = authorizationUrl;
      } else {
        // Show form modal for other auth types
        // ... (implement modal logic)
      }
    } catch (error) {
      console.error('Failed to start re-authorization:', error);
      alert('Failed to start re-authorization');
    } finally {
      setReauthorizing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${entity.name}?`)) return;

    try {
      await api.deleteEntity(entity.id);
      onDelete(entity.id);
    } catch (error) {
      console.error('Failed to delete entity:', error);
      alert('Failed to delete entity');
    }
  };

  return (
    <div className={`entity-card ${status.valid ? 'valid' : 'invalid'}`}>
      <div className="entity-header">
        <h3>{entity.name}</h3>
        <span className="badge">{entity.moduleType}</span>
      </div>

      <div className="entity-status">
        {status.valid ? (
          <span className="status-badge success">✓ {status.message}</span>
        ) : (
          <span className="status-badge error">✗ {status.message}</span>
        )}
      </div>

      <div className="entity-actions">
        <button onClick={handleTest} disabled={testing}>
          {testing ? 'Testing...' : 'Test Connection'}
        </button>

        {!status.valid && status.canReauthorize && (
          <button
            onClick={handleReauthorize}
            disabled={reauthorizing}
            className="btn-primary"
          >
            {reauthorizing ? 'Starting...' : 'Reconnect'}
          </button>
        )}

        <button onClick={handleDelete} className="btn-danger">
          Delete
        </button>
      </div>

      <div className="entity-meta">
        <small>Created: {new Date(entity.createdAt).toLocaleString()}</small>
        {entity.lastTested && (
          <small>Last tested: {new Date(entity.lastTested).toLocaleString()}</small>
        )}
      </div>
    </div>
  );
}
```

### 3. OAuthCallbackHandler with Re-auth Support

**File:** `packages/ui/lib/integration/presentation/components/OAuthCallbackHandler.jsx`

```jsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FriggApiAdapter } from '../../infrastructure/adapters/FriggApiAdapter';

export function OAuthCallbackHandler({ authToken, onComplete }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing authorization...');

  const api = new FriggApiAdapter({ authToken });

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(`Authorization failed: ${error}`);
      setTimeout(() => navigate('/entities'), 3000);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received');
      setTimeout(() => navigate('/entities'), 3000);
      return;
    }

    // Check if this is a re-authorization callback
    const reauthSessionId = localStorage.getItem('reauth_session_id');
    const reauthEntityId = localStorage.getItem('reauth_entity_id');

    if (reauthSessionId && reauthEntityId) {
      await handleReauthorizationCallback(code, reauthSessionId, reauthEntityId);
    } else {
      await handleAuthorizationCallback(code, state);
    }
  };

  const handleReauthorizationCallback = async (code, sessionId, entityId) => {
    try {
      setMessage('Reconnecting...');

      const entity = await api.completeEntityReauthorization(entityId, {
        sessionId,
        data: {
          code,
          redirectUri: window.location.origin + window.location.pathname
        }
      });

      // Cleanup
      localStorage.removeItem('reauth_session_id');
      localStorage.removeItem('reauth_entity_id');
      localStorage.removeItem('reauth_module_type');

      setStatus('success');
      setMessage(`${entity.name} reconnected successfully!`);

      if (onComplete) onComplete(entity);
      setTimeout(() => navigate('/entities'), 2000);

    } catch (error) {
      console.error('Re-authorization failed:', error);
      setStatus('error');
      setMessage(`Failed to reconnect: ${error.message}`);
      setTimeout(() => navigate('/entities'), 3000);
    }
  };

  const handleAuthorizationCallback = async (code, state) => {
    try {
      // Get session info from localStorage
      const moduleType = localStorage.getItem(`auth_module_type_${state}`) ||
                        searchParams.get('moduleType');
      const sessionId = localStorage.getItem(`auth_session_${moduleType}`);
      const credentialId = localStorage.getItem(`auth_credential_${moduleType}`);
      const step = parseInt(localStorage.getItem(`auth_step_${moduleType}`) || '1', 10);

      if (!moduleType) {
        throw new Error('Module type not found in state');
      }

      setMessage('Completing authorization...');

      const result = await api.submitModuleAuthorization(
        moduleType,
        { code, redirectUri: window.location.origin + window.location.pathname, state },
        step,
        sessionId,
        credentialId
      );

      if (result.completed) {
        // Success! Entity created
        localStorage.removeItem(`auth_session_${moduleType}`);
        localStorage.removeItem(`auth_credential_${moduleType}`);
        localStorage.removeItem(`auth_step_${moduleType}`);
        localStorage.removeItem(`auth_module_type_${state}`);

        setStatus('success');
        setMessage(`${result.entity.name} connected successfully!`);

        if (onComplete) onComplete(result.entity);
        setTimeout(() => navigate('/entities'), 2000);

      } else {
        // Multi-step: need more input
        // Redirect to wizard with session info
        navigate(`/auth/wizard?moduleType=${moduleType}&sessionId=${result.sessionId}&step=${result.step}`);
      }

    } catch (error) {
      console.error('Authorization failed:', error);
      setStatus('error');
      setMessage(`Failed to connect: ${error.message}`);
      setTimeout(() => navigate('/entities'), 3000);
    }
  };

  return (
    <div className={`oauth-callback ${status}`}>
      {status === 'processing' && <div className="spinner" />}
      {status === 'success' && <div className="success-icon">✓</div>}
      {status === 'error' && <div className="error-icon">✗</div>}
      <p>{message}</p>
    </div>
  );
}
```

### 4. RecoveryPrompt Component (NEW)

**File:** `packages/ui/lib/integration/presentation/components/RecoveryPrompt.jsx`

```jsx
import { useState, useEffect } from 'react';
import { FriggApiAdapter } from '../../infrastructure/adapters/FriggApiAdapter';

/**
 * Checks for incomplete authorizations and prompts user to resume
 * Implements Layers 2, 3, 4 of recovery system
 */
export function RecoveryPrompt({ authToken, onResume }) {
  const [recoveryOptions, setRecoveryOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  const api = new FriggApiAdapter({ authToken });

  useEffect(() => {
    checkRecoveryOptions();
  }, []);

  const checkRecoveryOptions = async () => {
    setLoading(true);
    const options = [];

    try {
      // Layer 3: Check for orphaned credentials
      const orphaned = await api.listCredentials({ status: 'orphaned' });

      orphaned.credentials?.forEach(cred => {
        options.push({
          type: 'orphaned_credential',
          id: cred.id,
          moduleType: cred.moduleType,
          message: `Complete your ${cred.moduleType} setup`,
          action: 'resume_from_credential'
        });
      });

    } catch (error) {
      console.error('Failed to check recovery options:', error);
    }

    setRecoveryOptions(options);
    setLoading(false);
  };

  const handleResume = async (option) => {
    try {
      if (option.action === 'resume_from_credential') {
        const resumed = await api.resumeAuthorizationFromCredential(option.id);

        // Store session info
        localStorage.setItem(`auth_session_${option.moduleType}`, resumed.sessionId);
        localStorage.setItem(`auth_credential_${option.moduleType}`, option.id);
        localStorage.setItem(`auth_step_${option.moduleType}`, resumed.step.toString());

        onResume(option.moduleType, resumed);
      }
    } catch (error) {
      console.error('Failed to resume:', error);
      alert('Failed to resume authorization');
    }
  };

  if (loading || recoveryOptions.length === 0) {
    return null;
  }

  return (
    <div className="recovery-prompt">
      <div className="recovery-banner">
        <h3>Incomplete Setups</h3>
        <p>You have {recoveryOptions.length} incomplete authorization{recoveryOptions.length !== 1 ? 's' : ''}</p>

        {recoveryOptions.map((option, index) => (
          <div key={index} className="recovery-option">
            <p>{option.message}</p>
            <button onClick={() => handleResume(option)}>
              Complete Setup
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Hooks

### useEntityTest Hook

**File:** `packages/ui/lib/integration/hooks/useEntityTest.js`

```javascript
import { useState, useCallback } from 'react';
import { FriggApiAdapter } from '../infrastructure/adapters/FriggApiAdapter';

/**
 * Hook for testing entity connections
 */
export function useEntityTest(authToken) {
  const [testing, setTesting] = useState({});
  const [results, setResults] = useState({});

  const api = new FriggApiAdapter({ authToken });

  const testEntity = useCallback(async (entityId) => {
    setTesting(prev => ({ ...prev, [entityId]: true }));

    try {
      const result = await api.testEntity(entityId);

      setResults(prev => ({
        ...prev,
        [entityId]: {
          valid: result.valid,
          message: result.valid ? 'Connected' : result.error,
          canReauthorize: result.canReauthorize,
          lastTested: new Date()
        }
      }));

      return result;
    } catch (error) {
      setResults(prev => ({
        ...prev,
        [entityId]: {
          valid: false,
          message: 'Test failed',
          error: error.message,
          lastTested: new Date()
        }
      }));
      throw error;
    } finally {
      setTesting(prev => ({ ...prev, [entityId]: false }));
    }
  }, [api]);

  return {
    testEntity,
    testing,
    results
  };
}
```

### useModuleAuthorization Hook

**File:** `packages/ui/lib/integration/hooks/useModuleAuthorization.js`

```javascript
import { useState, useEffect, useCallback } from 'react';
import { FriggApiAdapter } from '../infrastructure/adapters/FriggApiAdapter';

/**
 * Hook for handling module authorization flows
 */
export function useModuleAuthorization(moduleType, authToken) {
  const [state, setState] = useState({
    step: 1,
    sessionId: null,
    credentialId: null,
    requirements: null,
    loading: false,
    error: null
  });

  const api = new FriggApiAdapter({ authToken });

  // Check for recovery state on mount
  useEffect(() => {
    checkRecovery();
  }, [moduleType]);

  const checkRecovery = () => {
    const sessionId = localStorage.getItem(`auth_session_${moduleType}`);
    const credentialId = localStorage.getItem(`auth_credential_${moduleType}`);
    const step = localStorage.getItem(`auth_step_${moduleType}`);

    if (sessionId) {
      setState(prev => ({
        ...prev,
        sessionId,
        credentialId,
        step: parseInt(step, 10) || 1
      }));
    }
  };

  const loadRequirements = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const reqs = await api.getModuleAuthorizationRequirements(
        moduleType,
        state.step,
        state.sessionId
      );

      // Store session info
      if (reqs.sessionId && !state.sessionId) {
        localStorage.setItem(`auth_session_${moduleType}`, reqs.sessionId);
      }
      localStorage.setItem(`auth_step_${moduleType}`, state.step.toString());

      setState(prev => ({
        ...prev,
        requirements: reqs,
        sessionId: reqs.sessionId || prev.sessionId,
        loading: false
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error.message,
        loading: false
      }));
    }
  }, [moduleType, state.step, state.sessionId]);

  const submitAuthorization = useCallback(async (data) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await api.submitModuleAuthorization(
        moduleType,
        data,
        state.step,
        state.sessionId,
        state.credentialId
      );

      if (result.completed) {
        // Clean up localStorage
        localStorage.removeItem(`auth_session_${moduleType}`);
        localStorage.removeItem(`auth_credential_${moduleType}`);
        localStorage.removeItem(`auth_step_${moduleType}`);

        setState(prev => ({ ...prev, loading: false }));
        return { completed: true, entity: result.entity };

      } else {
        // Multi-step: advance
        const credentialId = result.credentialId || state.credentialId;

        if (credentialId) {
          localStorage.setItem(`auth_credential_${moduleType}`, credentialId);
        }

        setState(prev => ({
          ...prev,
          step: result.step,
          sessionId: result.sessionId,
          credentialId,
          requirements: result.requirements,
          loading: false
        }));

        return { completed: false, step: result.step };
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error.message,
        loading: false
      }));
      throw error;
    }
  }, [moduleType, state.step, state.sessionId, state.credentialId]);

  const reset = useCallback(() => {
    localStorage.removeItem(`auth_session_${moduleType}`);
    localStorage.removeItem(`auth_credential_${moduleType}`);
    localStorage.removeItem(`auth_step_${moduleType}`);

    setState({
      step: 1,
      sessionId: null,
      credentialId: null,
      requirements: null,
      loading: false,
      error: null
    });
  }, [moduleType]);

  return {
    ...state,
    loadRequirements,
    submitAuthorization,
    reset
  };
}
```

---

## Complete Usage Examples

### Example 1: Authorization Flow with Recovery

```jsx
import { AuthorizationWizard } from '@friggframework/ui';

function ConnectModulePage() {
  const handleComplete = (entity) => {
    console.log('Entity created:', entity);
    navigate('/entities');
  };

  return (
    <AuthorizationWizard
      moduleType="slack"
      authToken={userToken}
      onComplete={handleComplete}
      onCancel={() => navigate('/modules')}
    />
  );
}
```

### Example 2: Entity Management with Re-auth

```jsx
import { EntityCard, useEntityTest } from '@friggframework/ui';

function EntitiesPage() {
  const [entities, setEntities] = useState([]);
  const { testEntity, testing, results } = useEntityTest(userToken);

  useEffect(() => {
    loadEntities();
  }, []);

  const loadEntities = async () => {
    const api = new FriggApiAdapter({ authToken: userToken });
    const result = await api.getEntities();
    setEntities(result.entities);
  };

  const handleEntityUpdate = (updatedEntity) => {
    setEntities(prev =>
      prev.map(e => e.id === updatedEntity.id ? updatedEntity : e)
    );
  };

  const handleEntityDelete = (entityId) => {
    setEntities(prev => prev.filter(e => e.id !== entityId));
  };

  return (
    <div>
      <h1>My Connections</h1>
      <div className="entity-grid">
        {entities.map(entity => (
          <EntityCard
            key={entity.id}
            entity={entity}
            authToken={userToken}
            onUpdate={handleEntityUpdate}
            onDelete={handleEntityDelete}
          />
        ))}
      </div>
    </div>
  );
}
```

### Example 3: Recovery on App Load

```jsx
import { RecoveryPrompt } from '@friggframework/ui';

function App() {
  const [showRecovery, setShowRecovery] = useState(true);

  const handleResume = (moduleType, resumedSession) => {
    // Navigate to wizard with session info
    navigate(`/auth/wizard?moduleType=${moduleType}&sessionId=${resumedSession.sessionId}`);
    setShowRecovery(false);
  };

  return (
    <div>
      {showRecovery && (
        <RecoveryPrompt
          authToken={userToken}
          onResume={handleResume}
        />
      )}

      {/* Rest of app */}
    </div>
  );
}
```

---

## Summary

**Breaking Changes:**
- ❌ `getAuthorizeRequirements(entityType, ...)` → ✅ `getModuleAuthorizationRequirements(moduleType, ...)`
- ❌ `authorize(entityType, ...)` → ✅ `submitModuleAuthorization(moduleType, ...)`
- ❌ `testEntityAuth()` → ✅ `testEntity()`
- ❌ `testIntegrationAuth()` → ✅ `testIntegration()`

**New Features:**
- ✅ Complete credential management API
- ✅ Entity re-authentication flow
- ✅ 4-layer recovery system
- ✅ RecoveryPrompt component
- ✅ useEntityTest and useModuleAuthorization hooks

**Migration Effort:**
- Update all `entityType` → `moduleType`
- Replace authorization method calls
- Add re-authentication UI
- Implement recovery prompts (optional but recommended)
