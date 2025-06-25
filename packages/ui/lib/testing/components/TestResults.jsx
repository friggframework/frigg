import React, { useState, useMemo } from 'react';
import { Button } from '../../components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { useToast } from '../../components/use-toast';

export const TestResults = ({ testResults = [] }) => {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState('desc');
  const { toast } = useToast();

  const stats = useMemo(() => {
    const total = testResults.length;
    const passed = testResults.filter(r => r.success).length;
    const failed = testResults.filter(r => !r.success).length;
    const avgResponseTime = testResults
      .filter(r => r.data?.responseTime)
      .reduce((sum, r) => sum + r.data.responseTime, 0) / 
      (testResults.filter(r => r.data?.responseTime).length || 1);

    const byIntegration = testResults.reduce((acc, result) => {
      const key = result.data?.integration || result.integration || 'unknown';
      if (!acc[key]) {
        acc[key] = { total: 0, passed: 0, failed: 0 };
      }
      acc[key].total++;
      if (result.success) {
        acc[key].passed++;
      } else {
        acc[key].failed++;
      }
      return acc;
    }, {});

    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : 0,
      avgResponseTime: Math.round(avgResponseTime),
      byIntegration
    };
  }, [testResults]);

  const filteredResults = useMemo(() => {
    let results = [...testResults];
    
    if (filter !== 'all') {
      results = results.filter(r => 
        filter === 'passed' ? r.success : !r.success
      );
    }

    results.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'timestamp':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case 'integration':
          aVal = a.data?.integration || a.integration || '';
          bVal = b.data?.integration || b.integration || '';
          break;
        case 'responseTime':
          aVal = a.data?.responseTime || 0;
          bVal = b.data?.responseTime || 0;
          break;
        default:
          aVal = a[sortBy];
          bVal = b[sortBy];
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return results;
  }, [testResults, filter, sortBy, sortOrder]);

  const exportResults = () => {
    const exportData = {
      summary: stats,
      results: filteredResults,
      exportedAt: new Date()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Results Exported',
      description: 'Test results have been exported successfully'
    });
  };

  const generateReport = () => {
    const report = `# Frigg Integration Test Report
Generated: ${new Date().toLocaleString()}

## Summary
- Total Tests: ${stats.total}
- Passed: ${stats.passed}
- Failed: ${stats.failed}
- Pass Rate: ${stats.passRate}%
- Average Response Time: ${stats.avgResponseTime}ms

## Results by Integration
${Object.entries(stats.byIntegration).map(([integration, data]) => `
### ${integration}
- Total: ${data.total}
- Passed: ${data.passed}
- Failed: ${data.failed}
- Pass Rate: ${data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : 0}%
`).join('\n')}

## Failed Tests
${filteredResults.filter(r => !r.success).map(r => `
- ${new Date(r.timestamp).toLocaleString()} - ${r.message || r.error || 'Unknown error'}
  - Integration: ${r.data?.integration || r.integration || 'unknown'}
  - Details: ${JSON.stringify(r.data || {}, null, 2)}
`).join('\n')}
`;

    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Report Generated',
      description: 'Test report has been generated successfully'
    });
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-sm text-gray-600">Total Tests</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600">Passed</p>
          <p className="text-2xl font-bold text-green-700">{stats.passed}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">Failed</p>
          <p className="text-2xl font-bold text-red-700">{stats.failed}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-600">Pass Rate</p>
          <p className="text-2xl font-bold text-blue-700">{stats.passRate}%</p>
        </div>
      </div>

      {/* Integration Breakdown */}
      {Object.keys(stats.byIntegration).length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-3">Results by Integration</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(stats.byIntegration).map(([integration, data]) => (
              <div key={integration} className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">{integration}</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span>{data.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Passed:</span>
                    <span className="text-green-600">{data.passed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Failed:</span>
                    <span className="text-red-600">{data.failed}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${data.total > 0 ? (data.passed / data.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Table */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            <select
              className="px-3 py-2 border rounded-md"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All Results</option>
              <option value="passed">Passed Only</option>
              <option value="failed">Failed Only</option>
            </select>
            <select
              className="px-3 py-2 border rounded-md"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="timestamp">Sort by Time</option>
              <option value="integration">Sort by Integration</option>
              <option value="responseTime">Sort by Response Time</option>
            </select>
            <Button
              variant="outline"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportResults}>
              Export JSON
            </Button>
            <Button variant="outline" onClick={generateReport}>
              Generate Report
            </Button>
          </div>
        </div>

        {filteredResults.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Integration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Response Time</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResults.map((result, index) => (
                <TableRow key={index}>
                  <TableCell className="text-sm">
                    {new Date(result.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                      {result.data?.workflow || result.data?.entityType || 'connection'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {result.data?.integration || result.integration || 'unknown'}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs ${
                      result.success 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {result.success ? 'Passed' : 'Failed'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {result.data?.responseTime ? `${result.data.responseTime}ms` : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {result.message || '-'}
                  </TableCell>
                  <TableCell>
                    <details className="cursor-pointer">
                      <summary className="text-sm text-blue-600">View</summary>
                      <pre className="text-xs mt-2 p-2 bg-gray-50 rounded max-w-xs overflow-auto">
                        {JSON.stringify(result.data || {}, null, 2)}
                      </pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No test results to display. Run some tests to see results here.
          </div>
        )}
      </div>
    </div>
  );
};