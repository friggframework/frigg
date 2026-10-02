import React from 'react'
import { Card } from '../Card'
import { StatusBadge } from '../StatusBadge'

/**
 * Lambda Functions Metrics Component
 * Displays detailed metrics for AWS Lambda functions
 */
function LambdaMetrics({ metrics }) {
    if (!metrics || metrics.error) {
        return (
            <Card>
                <div className="text-center py-8 text-gray-500">
                    {metrics?.error || 'No Lambda metrics available'}
                </div>
            </Card>
        )
    }

    const { functions = [] } = metrics

    const getStatusFromMetrics = (fn) => {
        if (fn.metrics?.errors > 0) return 'error'
        if (fn.metrics?.throttles > 0) return 'warning'
        if (fn.metrics?.invocations > 0) return 'success'
        return 'inactive'
    }

    const formatDuration = (duration) => {
        if (!duration) return '0ms'
        if (duration < 1000) return `${Math.round(duration)}ms`
        return `${(duration / 1000).toFixed(2)}s`
    }

    return (
        <div className="space-y-4">
            <Card>
                <h3 className="text-lg font-semibold mb-4">
                    Lambda Functions ({functions.length})
                </h3>
                
                {functions.length === 0 ? (
                    <p className="text-gray-500">No Lambda functions found for this service</p>
                ) : (
                    <div className="space-y-4">
                        {functions.map((fn, index) => (
                            <div key={index} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h4 className="font-semibold">{fn.functionName}</h4>
                                        <div className="text-sm text-gray-600 space-x-4">
                                            <span>Runtime: {fn.runtime}</span>
                                            <span>Memory: {fn.memorySize}MB</span>
                                            <span>Timeout: {fn.timeout}s</span>
                                        </div>
                                    </div>
                                    <StatusBadge 
                                        status={getStatusFromMetrics(fn)}
                                        text={getStatusFromMetrics(fn)}
                                    />
                                </div>

                                {fn.metrics && (
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                                        <div>
                                            <div className="text-sm text-gray-600">Invocations</div>
                                            <div className="text-xl font-mono">
                                                {fn.metrics.invocations || 0}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">Errors</div>
                                            <div className="text-xl font-mono text-red-600">
                                                {fn.metrics.errors || 0}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">Avg Duration</div>
                                            <div className="text-xl font-mono">
                                                {formatDuration(fn.metrics.duration)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">Throttles</div>
                                            <div className="text-xl font-mono text-yellow-600">
                                                {fn.metrics.throttles || 0}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600">Concurrent</div>
                                            <div className="text-xl font-mono">
                                                {Math.round(fn.metrics.concurrentexecutions || 0)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {fn.metrics && (fn.metrics.errors > 0 || fn.metrics.throttles > 0) && (
                                    <div className="mt-3 p-3 bg-red-50 rounded text-sm">
                                        {fn.metrics.errors > 0 && (
                                            <div className="text-red-700">
                                                ⚠️ This function has errors. Check CloudWatch logs for details.
                                            </div>
                                        )}
                                        {fn.metrics.throttles > 0 && (
                                            <div className="text-yellow-700">
                                                ⚠️ This function is being throttled. Consider increasing reserved concurrency.
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="text-xs text-gray-500 mt-2">
                                    Last modified: {new Date(fn.lastModified).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Summary Statistics */}
            {functions.length > 0 && (
                <Card>
                    <h3 className="text-lg font-semibold mb-4">Summary Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <div className="text-sm text-gray-600">Total Invocations</div>
                            <div className="text-2xl font-mono">
                                {functions.reduce((sum, fn) => sum + (fn.metrics?.invocations || 0), 0)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Total Errors</div>
                            <div className="text-2xl font-mono text-red-600">
                                {functions.reduce((sum, fn) => sum + (fn.metrics?.errors || 0), 0)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Error Rate</div>
                            <div className="text-2xl font-mono">
                                {(() => {
                                    const totalInvocations = functions.reduce((sum, fn) => sum + (fn.metrics?.invocations || 0), 0)
                                    const totalErrors = functions.reduce((sum, fn) => sum + (fn.metrics?.errors || 0), 0)
                                    return totalInvocations > 0 
                                        ? `${((totalErrors / totalInvocations) * 100).toFixed(2)}%`
                                        : '0%'
                                })()}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Avg Duration</div>
                            <div className="text-2xl font-mono">
                                {(() => {
                                    const validFunctions = functions.filter(fn => fn.metrics?.duration > 0)
                                    if (validFunctions.length === 0) return '0ms'
                                    const avgDuration = validFunctions.reduce((sum, fn) => sum + fn.metrics.duration, 0) / validFunctions.length
                                    return formatDuration(avgDuration)
                                })()}
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    )
}

export default LambdaMetrics