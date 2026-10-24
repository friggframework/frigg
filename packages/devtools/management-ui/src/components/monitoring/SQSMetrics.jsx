import React from 'react'
import { Card } from '../Card'
import { StatusBadge } from '../StatusBadge'

/**
 * SQS Queue Metrics Component
 * Displays detailed metrics for AWS SQS queues
 */
function SQSMetrics({ metrics }) {
    if (!metrics || metrics.error) {
        return (
            <Card>
                <div className="text-center py-8 text-gray-500">
                    {metrics?.error || 'No SQS metrics available'}
                </div>
            </Card>
        )
    }

    const { queues = [] } = metrics

    const getQueueStatus = (queue) => {
        if (queue.error) return 'error'
        if (queue.messagesAvailable > 100) return 'warning'
        if (queue.messagesInFlight > 0) return 'success'
        return 'inactive'
    }

    const formatAge = (timestamp) => {
        if (!timestamp) return 'Unknown'
        const age = Date.now() - parseInt(timestamp) * 1000
        const days = Math.floor(age / (1000 * 60 * 60 * 24))
        const hours = Math.floor((age % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        
        if (days > 0) return `${days}d ${hours}h`
        if (hours > 0) return `${hours}h`
        return 'Just created'
    }

    const formatRetentionPeriod = (seconds) => {
        const days = Math.floor(seconds / (60 * 60 * 24))
        const hours = Math.floor((seconds % (60 * 60 * 24)) / (60 * 60))
        return `${days}d ${hours}h`
    }

    return (
        <div className="space-y-4">
            <Card>
                <h3 className="text-lg font-semibold mb-4">
                    SQS Queues ({queues.length})
                </h3>
                
                {queues.length === 0 ? (
                    <p className="text-gray-500">No SQS queues found for this service</p>
                ) : (
                    <div className="space-y-4">
                        {queues.map((queue, index) => (
                            <div key={index} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h4 className="font-semibold">{queue.queueName}</h4>
                                        <div className="text-sm text-gray-600">
                                            <span className="break-all">{queue.queueUrl}</span>
                                        </div>
                                    </div>
                                    <StatusBadge 
                                        status={getQueueStatus(queue)}
                                        text={getQueueStatus(queue)}
                                    />
                                </div>

                                {queue.error ? (
                                    <div className="mt-3 p-3 bg-red-50 rounded text-sm text-red-700">
                                        Error fetching queue metrics: {queue.error}
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                            <div>
                                                <div className="text-sm text-gray-600">Available</div>
                                                <div className="text-xl font-mono">
                                                    {queue.messagesAvailable || 0}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-gray-600">In Flight</div>
                                                <div className="text-xl font-mono text-blue-600">
                                                    {queue.messagesInFlight || 0}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-gray-600">Delayed</div>
                                                <div className="text-xl font-mono text-yellow-600">
                                                    {queue.messagesDelayed || 0}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-gray-600">Total</div>
                                                <div className="text-xl font-mono">
                                                    {(queue.messagesAvailable || 0) + 
                                                     (queue.messagesInFlight || 0) + 
                                                     (queue.messagesDelayed || 0)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t">
                                            <div>
                                                <div className="text-sm text-gray-600">Visibility Timeout</div>
                                                <div className="font-mono">{queue.visibilityTimeout}s</div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-gray-600">Retention Period</div>
                                                <div className="font-mono">
                                                    {formatRetentionPeriod(queue.messageRetentionPeriod)}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-gray-600">Age</div>
                                                <div className="font-mono">
                                                    {formatAge(queue.createdTimestamp)}
                                                </div>
                                            </div>
                                        </div>

                                        {queue.messagesAvailable > 100 && (
                                            <div className="mt-3 p-3 bg-yellow-50 rounded text-sm text-yellow-700">
                                                ⚠️ High message count detected. Queue may be backing up.
                                            </div>
                                        )}

                                        {queue.messagesInFlight > 10 && (
                                            <div className="mt-3 p-3 bg-blue-50 rounded text-sm text-blue-700">
                                                ℹ️ Multiple messages being processed. Monitor for processing delays.
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Queue Health Summary */}
            {queues.length > 0 && (
                <Card>
                    <h3 className="text-lg font-semibold mb-4">Queue Health Summary</h3>
                    
                    {/* Visual Queue Status */}
                    <div className="space-y-3 mb-4">
                        {queues.filter(q => !q.error).map((queue, index) => {
                            const total = (queue.messagesAvailable || 0) + 
                                        (queue.messagesInFlight || 0) + 
                                        (queue.messagesDelayed || 0)
                            const availablePercent = total > 0 ? (queue.messagesAvailable / total) * 100 : 0
                            const inFlightPercent = total > 0 ? (queue.messagesInFlight / total) * 100 : 0
                            const delayedPercent = total > 0 ? (queue.messagesDelayed / total) * 100 : 0
                            
                            return (
                                <div key={index}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium">{queue.queueName}</span>
                                        <span className="font-mono">{total} messages</span>
                                    </div>
                                    <div className="flex h-6 rounded overflow-hidden bg-gray-200">
                                        {availablePercent > 0 && (
                                            <div 
                                                className="bg-green-500"
                                                style={{ width: `${availablePercent}%` }}
                                                title={`${queue.messagesAvailable} available`}
                                            />
                                        )}
                                        {inFlightPercent > 0 && (
                                            <div 
                                                className="bg-blue-500"
                                                style={{ width: `${inFlightPercent}%` }}
                                                title={`${queue.messagesInFlight} in flight`}
                                            />
                                        )}
                                        {delayedPercent > 0 && (
                                            <div 
                                                className="bg-yellow-500"
                                                style={{ width: `${delayedPercent}%` }}
                                                title={`${queue.messagesDelayed} delayed`}
                                            />
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="flex gap-4 text-xs">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-green-500 rounded"></div>
                            <span>Available</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-blue-500 rounded"></div>
                            <span>In Flight</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                            <span>Delayed</span>
                        </div>
                    </div>

                    {/* Summary Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t">
                        <div>
                            <div className="text-sm text-gray-600">Total Messages</div>
                            <div className="text-2xl font-mono">
                                {queues.reduce((sum, q) => sum + 
                                    (q.messagesAvailable || 0) + 
                                    (q.messagesInFlight || 0) + 
                                    (q.messagesDelayed || 0), 0
                                )}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Available</div>
                            <div className="text-2xl font-mono text-green-600">
                                {queues.reduce((sum, q) => sum + (q.messagesAvailable || 0), 0)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Processing</div>
                            <div className="text-2xl font-mono text-blue-600">
                                {queues.reduce((sum, q) => sum + (q.messagesInFlight || 0), 0)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Delayed</div>
                            <div className="text-2xl font-mono text-yellow-600">
                                {queues.reduce((sum, q) => sum + (q.messagesDelayed || 0), 0)}
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    )
}

export default SQSMetrics