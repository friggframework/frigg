import { apiService } from './apiService';

export const logsService = {
  async getHistoricalLogs({ integrationId, config, startTime, limit = 100 }) {
    try {
      const response = await apiService.get('/monitoring/logs', {
        params: {
          integrationId,
          startTime: startTime.toISOString(),
          limit,
          logGroup: config.logGroup,
          region: config.region || 'us-east-1'
        }
      });
      
      return response.data.logs.map(log => ({
        timestamp: log.timestamp,
        level: log.level || 'info',
        message: log.message,
        metadata: log.metadata ? JSON.stringify(log.metadata) : null,
        source: log.source || 'application'
      }));
    } catch (error) {
      console.error('Error fetching historical logs:', error);
      
      // Return mock logs for development
      return generateMockLogs(startTime, limit);
    }
  },

  async streamLogs({ integrationId, config, onLog, onError }) {
    try {
      // For WebSocket streaming
      const wsUrl = `${apiService.getWebSocketUrl()}/monitoring/logs/stream`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({
          action: 'subscribe',
          integrationId,
          logGroup: config.logGroup,
          region: config.region || 'us-east-1'
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const log = JSON.parse(event.data);
          onLog({
            timestamp: log.timestamp,
            level: log.level || 'info',
            message: log.message,
            metadata: log.metadata ? JSON.stringify(log.metadata) : null,
            source: log.source || 'application'
          });
        } catch (err) {
          console.error('Error parsing log message:', err);
        }
      };
      
      ws.onerror = (error) => {
        onError(error);
      };
      
      ws.onclose = () => {
        console.log('Log stream closed');
      };
      
      return ws;
    } catch (error) {
      console.error('Error starting log stream:', error);
      
      // Fallback to polling for development
      return startMockLogStream(onLog);
    }
  },

  stopStreaming(stream) {
    if (stream instanceof WebSocket) {
      stream.close();
    } else if (stream && stream.stop) {
      stream.stop();
    }
  },

  async searchLogs({ integrationId, config, query, startTime, endTime }) {
    try {
      const response = await apiService.post('/monitoring/logs/search', {
        integrationId,
        query,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        logGroup: config.logGroup,
        region: config.region || 'us-east-1'
      });
      
      return response.data.results;
    } catch (error) {
      console.error('Error searching logs:', error);
      throw error;
    }
  },

  async exportLogs({ integrationId, config, startTime, endTime, format = 'json' }) {
    try {
      const response = await apiService.post('/monitoring/logs/export', {
        integrationId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        format,
        logGroup: config.logGroup,
        region: config.region || 'us-east-1'
      });
      
      return response.data.exportUrl;
    } catch (error) {
      console.error('Error exporting logs:', error);
      throw error;
    }
  }
};

// Mock log generation for development
function generateMockLogs(startTime, limit) {
  const logs = [];
  const levels = ['debug', 'info', 'warn', 'error'];
  const messages = [
    'Request received from user',
    'Processing authentication token',
    'Database query executed successfully',
    'Cache hit for key: user_preferences',
    'External API call completed',
    'Background job started',
    'File uploaded successfully',
    'Email notification sent',
    'Rate limit check passed',
    'Session validated'
  ];
  
  const errors = [
    'Database connection timeout',
    'Invalid authentication token',
    'Rate limit exceeded',
    'External API returned 500',
    'File upload failed: size limit exceeded'
  ];
  
  for (let i = 0; i < limit; i++) {
    const isError = Math.random() < 0.1;
    const level = isError ? 'error' : levels[Math.floor(Math.random() * (levels.length - 1))];
    const message = isError 
      ? errors[Math.floor(Math.random() * errors.length)]
      : messages[Math.floor(Math.random() * messages.length)];
    
    logs.push({
      timestamp: new Date(startTime.getTime() + (i * 1000)).toISOString(),
      level,
      message,
      metadata: Math.random() < 0.3 ? JSON.stringify({
        userId: `user_${Math.floor(Math.random() * 1000)}`,
        requestId: `req_${Math.random().toString(36).substr(2, 9)}`,
        duration: Math.floor(Math.random() * 500)
      }) : null,
      source: 'application'
    });
  }
  
  return logs;
}

// Mock log streaming for development
function startMockLogStream(onLog) {
  let running = true;
  
  const streamLogs = () => {
    if (!running) return;
    
    const level = Math.random() < 0.1 ? 'error' : 
                  Math.random() < 0.2 ? 'warn' :
                  Math.random() < 0.4 ? 'debug' : 'info';
    
    const messages = [
      'Processing request',
      'Query executed',
      'Cache updated',
      'Job completed',
      'User action logged'
    ];
    
    onLog({
      timestamp: new Date().toISOString(),
      level,
      message: messages[Math.floor(Math.random() * messages.length)],
      metadata: null,
      source: 'application'
    });
    
    setTimeout(streamLogs, Math.random() * 3000 + 1000);
  };
  
  streamLogs();
  
  return {
    stop: () => { running = false; }
  };
}