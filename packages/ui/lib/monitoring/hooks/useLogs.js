import { useState, useEffect, useCallback, useRef } from 'react';
import { logsService } from '../services/logsService';

export const useLogs = ({ integrationId, config = {} }) => {
  const [logs, setLogs] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);
  const logsRef = useRef([]);

  const MAX_LOGS = 1000; // Maximum logs to keep in memory

  const addLog = useCallback((log) => {
    const newLog = {
      ...log,
      id: `${log.timestamp}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    logsRef.current = [...logsRef.current, newLog].slice(-MAX_LOGS);
    setLogs(logsRef.current);
  }, []);

  const startStreaming = useCallback(async () => {
    if (!integrationId || streaming) return;
    
    try {
      setError(null);
      setStreaming(true);
      
      streamRef.current = await logsService.streamLogs({
        integrationId,
        config,
        onLog: addLog,
        onError: (err) => {
          console.error('Log streaming error:', err);
          setError(err);
          setStreaming(false);
        }
      });
    } catch (err) {
      console.error('Failed to start log streaming:', err);
      setError(err);
      setStreaming(false);
    }
  }, [integrationId, config, streaming, addLog]);

  const stopStreaming = useCallback(() => {
    if (streamRef.current) {
      logsService.stopStreaming(streamRef.current);
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  const toggleStreaming = useCallback(() => {
    if (streaming) {
      stopStreaming();
    } else {
      startStreaming();
    }
  }, [streaming, startStreaming, stopStreaming]);

  const fetchHistoricalLogs = useCallback(async () => {
    if (!integrationId) return;
    
    try {
      setError(null);
      
      const historicalLogs = await logsService.getHistoricalLogs({
        integrationId,
        config,
        limit: 100,
        startTime: new Date(Date.now() - 60 * 60 * 1000) // Last hour
      });
      
      const formattedLogs = historicalLogs.map(log => ({
        ...log,
        id: `${log.timestamp}-${Math.random().toString(36).substr(2, 9)}`
      }));
      
      logsRef.current = formattedLogs;
      setLogs(formattedLogs);
    } catch (err) {
      console.error('Failed to fetch historical logs:', err);
      setError(err);
    }
  }, [integrationId, config]);

  const clearLogs = useCallback(() => {
    logsRef.current = [];
    setLogs([]);
  }, []);

  // Fetch historical logs on mount
  useEffect(() => {
    fetchHistoricalLogs();
  }, [fetchHistoricalLogs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        logsService.stopStreaming(streamRef.current);
      }
    };
  }, []);

  return {
    logs,
    streaming,
    error,
    toggleStreaming,
    clearLogs,
    fetchHistoricalLogs
  };
};