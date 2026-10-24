import React from 'react'
import { Card } from '../Card'

/**
 * Metrics Charts Component
 * Displays visual charts for metrics data
 * Note: This is a placeholder for future chart implementation
 */
function MetricsChart({ metrics }) {
    if (!metrics) {
        return (
            <Card>
                <div className="text-center py-8 text-gray-500">
                    No metrics data available for charting
                </div>
            </Card>
        )
    }

    // Simple bar chart implementation using CSS
    const renderSimpleBarChart = (data, title, color = 'blue') => {
        if (!data || data.length === 0) return null
        
        const maxValue = Math.max(...data.map(d => d.value))
        
        return (
            <div className="mb-6">
                <h4 className="font-medium mb-3">{title}</h4>
                <div className="space-y-2">
                    {data.map((item, index) => (
                        <div key={index} className="flex items-center gap-3">
                            <div className="w-32 text-sm truncate">{item.label}</div>
                            <div className="flex-1 flex items-center">
                                <div className="flex-1 bg-gray-200 rounded h-6 relative">
                                    <div
                                        className={`bg-${color}-500 h-full rounded transition-all duration-300`}
                                        style={{ width: `${(item.value / maxValue) * 100}%` }}
                                    />
                                </div>
                                <span className="ml-2 text-sm font-mono w-16 text-right">
                                    {item.value}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    // Prepare chart data
    const lambdaInvocationsData = metrics.lambda?.functions?.map(fn => ({
        label: fn.functionName.split('-').pop() || fn.functionName,
        value: fn.metrics?.invocations || 0
    })) || []

    const lambdaErrorsData = metrics.lambda?.functions?.map(fn => ({
        label: fn.functionName.split('-').pop() || fn.functionName,
        value: fn.metrics?.errors || 0
    })) || []

    const apiRequestsData = metrics.apiGateway?.apis?.map(api => ({
        label: api.apiName.split('-').pop() || api.apiName,
        value: api.metrics?.count || 0
    })) || []

    const queueMessagesData = metrics.sqs?.queues?.map(queue => ({
        label: queue.queueName.split('-').pop() || queue.queueName,
        value: (queue.messagesAvailable || 0) + (queue.messagesInFlight || 0)
    })) || []

    return (
        <div className="space-y-6">
            <Card>
                <h3 className="text-lg font-semibold mb-4">Metrics Visualization</h3>
                <p className="text-gray-600 mb-6">
                    Visual representation of your Frigg application metrics. 
                    Charts are updated in real-time as new metrics are collected.
                </p>

                {/* Lambda Invocations Chart */}
                {lambdaInvocationsData.length > 0 && (
                    renderSimpleBarChart(
                        lambdaInvocationsData.filter(d => d.value > 0),
                        'Lambda Function Invocations (Last Hour)',
                        'blue'
                    )
                )}

                {/* Lambda Errors Chart */}
                {lambdaErrorsData.some(d => d.value > 0) && (
                    renderSimpleBarChart(
                        lambdaErrorsData.filter(d => d.value > 0),
                        'Lambda Function Errors (Last Hour)',
                        'red'
                    )
                )}

                {/* API Gateway Requests Chart */}
                {apiRequestsData.length > 0 && (
                    renderSimpleBarChart(
                        apiRequestsData.filter(d => d.value > 0),
                        'API Gateway Requests (Last Hour)',
                        'green'
                    )
                )}

                {/* SQS Messages Chart */}
                {queueMessagesData.length > 0 && (
                    renderSimpleBarChart(
                        queueMessagesData.filter(d => d.value > 0),
                        'SQS Queue Messages',
                        'yellow'
                    )
                )}

                {/* Performance Comparison */}
                {metrics.lambda?.functions?.length > 0 && (
                    <div className="mt-8">
                        <h4 className="font-medium mb-3">Average Duration Comparison</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {metrics.lambda.functions
                                .filter(fn => fn.metrics?.duration > 0)
                                .sort((a, b) => (b.metrics?.duration || 0) - (a.metrics?.duration || 0))
                                .map((fn, index) => (
                                    <div key={index} className="border rounded p-3">
                                        <div className="text-sm font-medium truncate">
                                            {fn.functionName.split('-').pop() || fn.functionName}
                                        </div>
                                        <div className="text-2xl font-mono">
                                            {fn.metrics.duration < 1000
                                                ? `${Math.round(fn.metrics.duration)}ms`
                                                : `${(fn.metrics.duration / 1000).toFixed(2)}s`
                                            }
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {fn.metrics.invocations} invocations
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

                {/* Health Score */}
                <div className="mt-8 p-4 bg-gray-50 rounded">
                    <h4 className="font-medium mb-2">System Health Score</h4>
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            {(() => {
                                const totalInvocations = metrics.lambda?.functions?.reduce(
                                    (sum, fn) => sum + (fn.metrics?.invocations || 0), 0
                                ) || 0
                                const totalErrors = metrics.lambda?.functions?.reduce(
                                    (sum, fn) => sum + (fn.metrics?.errors || 0), 0
                                ) || 0
                                const errorRate = totalInvocations > 0 ? (totalErrors / totalInvocations) * 100 : 0
                                const healthScore = Math.max(0, 100 - errorRate * 10)
                                
                                let healthColor = 'green'
                                if (healthScore < 80) healthColor = 'yellow'
                                if (healthScore < 60) healthColor = 'red'
                                
                                return (
                                    <>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span>Overall Health</span>
                                            <span>{Math.round(healthScore)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-4">
                                            <div
                                                className={`bg-${healthColor}-500 h-4 rounded-full transition-all duration-300`}
                                                style={{ width: `${healthScore}%` }}
                                            />
                                        </div>
                                        <div className="text-xs text-gray-600 mt-1">
                                            Based on error rates and response times
                                        </div>
                                    </>
                                )
                            })()}
                        </div>
                    </div>
                </div>

                {/* Future Chart Integration Notice */}
                <div className="mt-8 p-4 bg-blue-50 rounded text-sm text-blue-700">
                    <strong>Coming Soon:</strong> Interactive time-series charts with Chart.js or D3.js 
                    for historical trend analysis and real-time metric streaming.
                </div>
            </Card>
        </div>
    )
}

export default MetricsChart