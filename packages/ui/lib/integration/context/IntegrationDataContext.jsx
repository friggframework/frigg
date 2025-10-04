/**
 * @file Integration Data Context (Enhanced)
 * @description Provides complete integration management with API methods, state, and search/filter
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import API from '../../api/api.js';

const IntegrationDataContext = createContext(null);

export const IntegrationDataProvider = ({
    children,
    friggBaseUrl,
    authToken,
    source = 'frigg-ui-library',  // Source identifier for analytics and OAuth tracking
    redirectContext = null,  // OAuth redirect context
    onError
}) => {
    const [integrationOptions, setIntegrationOptions] = useState([]);
    const [installedIntegrations, setInstalledIntegrations] = useState([]);
    const [entities, setEntities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Search and filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);

    // Create API instance once
    const api = useMemo(() => new API(friggBaseUrl, authToken), [friggBaseUrl, authToken]);

    const loadData = useCallback(async () => {
        if (loaded || loading) return; // Prevent duplicate loads

        setLoading(true);

        try {
            const [installedData, optionsData, entitiesData] = await Promise.all([
                api.listIntegrations(),
                api.listIntegrationOptions(),
                api.listEntities()
            ]);

            setInstalledIntegrations(installedData.integrations || []);
            setIntegrationOptions(optionsData.integrations || []);
            setEntities(entitiesData.entities || []);
            setLoaded(true);
        } catch (error) {
            console.error('Failed to load integration data:', error);
            onError?.(error);
        } finally {
            setLoading(false);
        }
    }, [api, loaded, loading, onError]);

    const refreshData = useCallback(async () => {
        setLoaded(false);
        await loadData();
    }, [loadData]);

    // Create integration
    // entities: array of 0-N entity IDs to connect
    const createIntegration = useCallback(async (entities, config) => {
        try {
            setLoading(true);
            const result = await api.createIntegration(entities, config);
            await refreshData();
            return result;
        } catch (error) {
            console.error('Failed to create integration:', error);
            onError?.(error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [api, refreshData, onError]);

    // Delete integration
    const deleteIntegration = useCallback(async (integrationId) => {
        try {
            setLoading(true);
            await api.deleteIntegration(integrationId);
            await refreshData();
        } catch (error) {
            console.error('Failed to delete integration:', error);
            onError?.(error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [api, refreshData, onError]);

    // Update integration
    const updateIntegration = useCallback(async (integrationId, config) => {
        try {
            setLoading(true);
            const result = await api.updateIntegration(integrationId, config);
            await refreshData();
            return result;
        } catch (error) {
            console.error('Failed to update integration:', error);
            onError?.(error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [api, refreshData, onError]);

    // Authorize entity (using v2 API)
    const authorizeEntity = useCallback(async (moduleType, authData, step = null, sessionId = null, credentialId = null) => {
        try {
            setLoading(true);
            const result = await api.submitModuleAuthorization(moduleType, authData, step, sessionId, credentialId);
            await refreshData(); // Refresh to get new entity
            return result;
        } catch (error) {
            console.error('Failed to authorize entity:', error);
            onError?.(error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [api, refreshData, onError]);

    // Get available categories from integration options
    const categories = useMemo(() => {
        const cats = new Set();
        integrationOptions.forEach(option => {
            if (option.display?.category) {
                cats.add(option.display.category);
            }
        });
        return Array.from(cats).sort();
    }, [integrationOptions]);

    // Filtered integrations based on search and category
    const filteredIntegrationOptions = useMemo(() => {
        let filtered = integrationOptions;

        // Filter by category
        if (selectedCategory) {
            filtered = filtered.filter(
                option => option.display?.category === selectedCategory
            );
        }

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(option => {
                const name = option.display?.name?.toLowerCase() || '';
                const description = option.display?.description?.toLowerCase() || '';
                const type = option.type?.toLowerCase() || '';
                return name.includes(query) || description.includes(query) || type.includes(query);
            });
        }

        return filtered;
    }, [integrationOptions, selectedCategory, searchQuery]);

    const value = {
        // Base URL and auth
        baseUrl: friggBaseUrl,
        authToken,
        source,  // Expose source for OAuth and analytics
        redirectContext,  // OAuth redirect context for authorization flows

        // Data
        integrationOptions,
        installedIntegrations,
        entities,
        loading,
        loaded,

        // Search and filter
        searchQuery,
        setSearchQuery,
        selectedCategory,
        setSelectedCategory,
        categories,
        filteredIntegrationOptions,

        // Methods
        loadData,
        refreshData,
        createIntegration,
        deleteIntegration,
        updateIntegration,
        authorizeEntity,

        // Direct API access for advanced use cases
        api
    };

    return (
        <IntegrationDataContext.Provider value={value}>
            {children}
        </IntegrationDataContext.Provider>
    );
};

export const useIntegrationData = () => {
    const context = useContext(IntegrationDataContext);
    if (!context) {
        throw new Error('useIntegrationData must be used within IntegrationDataProvider');
    }
    return context;
};

// Alias for better semantics
export const FriggProvider = IntegrationDataProvider;
export const useFrigg = useIntegrationData;
