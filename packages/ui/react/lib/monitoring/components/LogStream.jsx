import React, { useRef, useEffect, useState } from 'react';
import { 
  Terminal, 
  Play, 
  Pause, 
  Download, 
  Filter,
  Search,
  RefreshCw
} from 'lucide-react';

export const LogStream = ({ logs = [], streaming, onToggleStreaming }) => {
  const logContainerRef = useRef(null);
  const [filter, setFilter] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const getLogLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'warn':
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'info':
        return 'text-blue-600 bg-blue-50';
      case 'debug':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-gray-600';
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesLevel = logLevel === 'all' || log.level?.toLowerCase() === logLevel;
    const matchesSearch = !searchTerm || 
      log.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.metadata?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const downloadLogs = () => {
    const logContent = filteredLogs.map(log => 
      `[${log.timestamp}] [${log.level}] ${log.message} ${log.metadata || ''}`
    ).join('\n');
    
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    if (window.confirm('Are you sure you want to clear the log display?')) {
      // This would typically call a prop function to clear logs
      // For now, it's just a placeholder
    }
  };

  return (
    <div className="log-stream bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Live Logs</h2>
            {streaming && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-600">Streaming</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleStreaming}
              className={`p-2 rounded-md transition-colors ${
                streaming 
                  ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                  : 'bg-green-100 text-green-600 hover:bg-green-200'
              }`}
              title={streaming ? 'Pause streaming' : 'Start streaming'}
            >
              {streaming ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            
            <button
              onClick={downloadLogs}
              className="p-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              title="Download logs"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={clearLogs}
              className="p-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              title="Clear logs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search logs..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          
          <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Auto-scroll</span>
          </label>
        </div>
      </div>

      <div 
        ref={logContainerRef}
        className="log-container h-96 overflow-y-auto p-4 font-mono text-sm bg-gray-50"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Terminal className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No logs to display</p>
            {searchTerm && <p className="text-sm mt-1">Try adjusting your search criteria</p>}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log, index) => (
              <div
                key={log.id || index}
                className="log-entry flex items-start gap-2 p-2 rounded hover:bg-white transition-colors"
              >
                <span className="text-gray-500 text-xs whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLogLevelColor(log.level)}`}>
                  {log.level?.toUpperCase() || 'LOG'}
                </span>
                <span className="text-gray-800 flex-1">
                  {log.message}
                  {log.metadata && (
                    <span className="text-gray-500 text-xs ml-2">
                      {log.metadata}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogStream;