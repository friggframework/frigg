import React from 'react'
import { Card } from '../Card'
import { StatusBadge } from '../StatusBadge'

/**
 * API Gateway Metrics Component
 * Displays detailed metrics for AWS API Gateway endpoints
 */
function APIGatewayMetrics({ metrics }) {
    if (!metrics || metrics.error) {
        return (
            <Card>
                <div className="text-center py-8 text-gray-500">
                    {metrics?.error || 'No API Gateway metrics available'}
                </div>
            </Card>
        )
    }

    const { apis = [] } = metrics

    const getStatusFromMetrics = (api) => {
        if (api.metrics?.['5xxerror'] > 0) return 'error'
        if (api.metrics?.['4xxerror'] > 0) return 'warning'
        if (api.metrics?.count > 0) return 'success'
        return 'inactive'
    }

    const formatLatency = (latency) => {
        if (!latency) return '0ms'
        return `${Math.round(latency)}ms`
    }

    return (
        <div className="space-y-4">
            <Card>
                <h3 className="text-lg font-semibold mb-4">
                    API Gateways ({apis.length})
                </h3>
                
                {apis.length === 0 ? (
                    <p className="text-gray-500">No API Gateways found for this service</p>
                ) : (
                    <div className="space-y-4">
                        {apis.map((api, index) => (
                            <div key={index} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h4 className="font-semibold">{api.apiName}</h4>
                                        <div className="text-sm text-gray-600">
                                            <span>ID: {api.apiId}</span>
                                            {api.description && (
                                                <span className="ml-4">{api.description}</span>
                                            )}
                                        </div>
                                    </div>
                                    <StatusBadge 
                                        status={getStatusFromMetrics(api)}
                                        text={getStatusFromMetrics(api)}
                                    />
                                </div>

                                {api.metrics && (
                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-4">
                                        <div>
                                            <div className="text-sm text-gray-600">Total Requests</div>
                                            <div className="text-xl font-mono">
                                                {api.metrics.count || 0}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">4XX Errors</div>
                                            <div className="text-xl font-mono text-yellow-600">
                                                {api.metrics['4xxerror'] || 0}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">5XX Errors</div>
                                            <div className="text-xl font-mono text-red-600">
                                                {api.metrics['5xxerror'] || 0}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">Error Rate</div>
                                            <div className="text-xl font-mono">
                                                {api.metrics.errorRate?.toFixed(2) || 0}%
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">Avg Latency</div>
                                            <div className="text-xl font-mono">
                                                {formatLatency(api.metrics.latency)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">Integration</div>
                                            <div className="text-xl font-mono">
                                                {formatLatency(api.metrics.integrationlatency)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {api.metrics && (api.metrics['5xxerror'] > 0 || api.metrics.errorRate > 5) && (
                                    <div className="mt-3 p-3 bg-red-50 rounded text-sm">
                                        {api.metrics['5xxerror'] > 0 && (
                                            <div className="text-red-700">
                                                ⚠️ Server errors detected. Check Lambda function logs and API Gateway execution logs.
                                            </div>
                                        )}
                                        {api.metrics.errorRate > 5 && (
                                            <div className="text-yellow-700">
                                                ⚠️ High error rate detected ({api.metrics.errorRate.toFixed(2)}%). Review recent deployments.
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="text-xs text-gray-500 mt-2">
                                    Created: {new Date(api.createdDate).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Performance Analysis */}
            {apis.length > 0 && apis.some(api => api.metrics?.count > 0) && (
                <Card>
                    <h3 className="text-lg font-semibold mb-4">Performance Analysis</h3>
                    <div className="space-y-4">
                        {/* Latency Distribution */}
                        <div>
                            <h4 className="font-medium mb-2">Latency Breakdown</h4>
                            <div className="space-y-2">
                                {apis.filter(api => api.metrics?.latency > 0).map((api, index) => {
                                    const totalLatency = api.metrics.latency || 0
                                    const integrationLatency = api.metrics.integrationlatency || 0
                                    const gatewayLatency = totalLatency - integrationLatency
                                    
                                    return (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="w-32 text-sm truncate">{api.apiName}</div>
                                            <div className="flex-1 flex h-6 rounded overflow-hidden">
                                                <div 
                                                    className="bg-blue-500 flex items-center justify-center text-xs text-white"
                                                    style={{ width: `${(gatewayLatency / totalLatency) * 100}%` }}
                                                >
                                                    {formatLatency(gatewayLatency)}
                                                </div>
                                                <div 
                                                    className="bg-green-500 flex items-center justify-center text-xs text-white"
                                                    style={{ width: `${(integrationLatency / totalLatency) * 100}%` }}
                                                >
                                                    {formatLatency(integrationLatency)}
                                                </div>
                                            </div>
                                            <div className="text-sm font-mono w-20 text-right">
                                                {formatLatency(totalLatency)}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="flex gap-4 mt-2 text-xs">
                                <div className="flex items-center gap-1">
                                    <div className="w-3 h-3 bg-blue-500 rounded"></div>
                                    <span>Gateway Overhead</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                                    <span>Integration (Lambda)</span>
                                </div>
                            </div>
                        </div>

                        {/* Summary Statistics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                            <div>
                                <div className="text-sm text-gray-600">Total Requests</div>
                                <div className="text-2xl font-mono">
                                    {apis.reduce((sum, api) => sum + (api.metrics?.count || 0), 0)}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">Total Errors</div>
                                <div className="text-2xl font-mono text-red-600">
                                    {apis.reduce((sum, api) => sum + (api.metrics?.['4xxerror'] || 0) + (api.metrics?.['5xxerror'] || 0), 0)}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">Avg Error Rate</div>
                                <div className="text-2xl font-mono">
                                    {(() => {
                                        const validApis = apis.filter(api => api.metrics?.count > 0)
                                        if (validApis.length === 0) return '0%'
                                        const avgErrorRate = validApis.reduce((sum, api) => sum + (api.metrics.errorRate || 0), 0) / validApis.length
                                        return `${avgErrorRate.toFixed(2)}%`
                                    })()}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">Avg Latency</div>
                                <div className="text-2xl font-mono">
                                    {(() => {
                                        const validApis = apis.filter(api => api.metrics?.latency > 0)
                                        if (validApis.length === 0) return '0ms'
                                        const avgLatency = validApis.reduce((sum, api) => sum + api.metrics.latency, 0) / validApis.length
                                        return formatLatency(avgLatency)
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    )
}

export default APIGatewayMetrics