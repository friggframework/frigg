/**
 * @file Integration Data Context
 * @description Provides cached integration and entity data to avoid redundant API calls
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import API from '../../api/api.js';

const IntegrationDataContext = createContext(null);

export const IntegrationDataProvider = ({ children, friggBaseUrl, authToken }) => {
    const [integrationOptions, setIntegrationOptions] = useState([]);
    const [installedIntegrations, setInstalledIntegrations] = useState([]);
    const [entities, setEntities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const loadData = useCallback(async () => {
        if (loaded || loading) return; // Prevent duplicate loads

        setLoading(true);
        const api = new API(friggBaseUrl, authToken);

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
        } finally {
            setLoading(false);
        }
    }, [friggBaseUrl, authToken, loaded, loading]);

    const refreshData = useCallback(async () => {
        setLoaded(false);
        await loadData();
    }, [loadData]);

    const value = {
        integrationOptions,
        installedIntegrations,
        entities,
        loading,
        loaded,
        loadData,
        refreshData
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
