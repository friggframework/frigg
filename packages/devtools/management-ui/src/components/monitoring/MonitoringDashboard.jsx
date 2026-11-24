import React, { useState, useEffect } from 'react'
import { Card } from '../Card'
import { Button } from '../Button'
import { StatusBadge } from '../StatusBadge'
import LoadingSpinner from '../LoadingSpinner'
import { useSocket } from '../../hooks/useSocket'
import LambdaMetrics from './LambdaMetrics'
import APIGatewayMetrics from './APIGatewayMetrics'
import SQSMetrics from './SQSMetrics'
import MetricsChart from './MetricsChart'
import './monitoring.css'

/**
 * Production Monitoring Dashboard Component
 * Displays real-time metrics from AWS CloudWatch for production Frigg instances
 */
function MonitoringDashboard() {
    const [monitoringStatus, setMonitoringStatus] = useState({
        initialized: false,
        isMonitoring: false,
        config: null
    })
    const [metrics, setMetrics] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [selectedView, setSelectedView] = useState('overview')
    
    const { socket, connected } = useSocket()

    // Initialize monitoring on component mount
    useEffect(() => {
        checkMonitoringStatus()
    }, [])

    // Subscribe to real-time metrics via WebSocket
    useEffect(() => {
        if (!socket || !connected) return

        const handleMetrics = (data) => {
            setMetrics(data)
            setError(null)
        }

        const handleError = (error) => {
            setError(error.message || 'Monitoring error occurred')
        }

        // Subscribe to monitoring events
        socket.emit('subscribe', { topics: ['monitoring:metrics', 'monitoring:error'] })
        
        socket.on('broadcast', (message) => {
            if (message.topic === 'monitoring:metrics') {
                handleMetrics(message.data)
            } else if (message.topic === 'monitoring:error') {
                handleError(message.data)
            }
        })

        return () => {
            socket.emit('unsubscribe', { topics: ['monitoring:metrics', 'monitoring:error'] })
            socket.off('broadcast')
        }
    }, [socket, connected])

    const checkMonitoringStatus = async () => {
        try {
            const response = await fetch('/api/monitoring/status')
            const data = await response.json()
            setMonitoringStatus(data)
        } catch (err) {
            console.error('Failed to check monitoring status:', err)
        }
    }

    const initializeMonitoring = async () => {
        setLoading(true)
        setError(null)
        
        try {
            // Initialize with default configuration
            const initResponse = await fetch('/api/monitoring/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collectionInterval: 60000 // 1 minute
                })
            })
            
            if (!initResponse.ok) {
                throw new Error('Failed to initialize monitoring')
            }

            // Start monitoring
            const startResponse = await fetch('/api/monitoring/start', {
                method: 'POST'
            })
            
            if (!startResponse.ok) {
                throw new Error('Failed to start monitoring')
            }

            await checkMonitoringStatus()
            
            // Force initial collection
            await collectMetricsNow()
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const stopMonitoring = async () => {
        setLoading(true)
        
        try {
            const response = await fetch('/api/monitoring/stop', {
                method: 'POST'
            })
            
            if (!response.ok) {
                throw new Error('Failed to stop monitoring')
            }

            await checkMonitoringStatus()
            setMetrics(null)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const collectMetricsNow = async () => {
        setLoading(true)
        
        try {
            const response = await fetch('/api/monitoring/metrics/collect', {
                method: 'POST'
            })
            
            if (!response.ok) {
                throw new Error('Failed to collect metrics')
            }

            const result = await response.json()
            if (result.success) {
                setMetrics(result.data)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const renderOverview = () => {
        if (!metrics) {
            return (
                <div className="text-center py-8 text-gray-500">
                    No metrics available. Start monitoring to see data.
                </div>
            )
        }

        const { lambda, apiGateway, sqs } = metrics

        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Lambda Overview */}
                <Card>
                    <h3 className="text-lg font-semibold mb-2">Lambda Functions</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>Total Functions:</span>
                            <span className="font-mono">{lambda.totalFunctions || 0}</span>
                        </div>
                        {lambda.functions && lambda.functions.length > 0 && (
                            <>
                                <div className="flex justify-between">
                                    <span>Total Invocations:</span>
                                    <span className="font-mono">
                                        {lambda.functions.reduce((sum, fn) => 
                                            sum + (fn.metrics?.invocations || 0), 0
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Total Errors:</span>
                                    <span className="font-mono text-red-600">
                                        {lambda.functions.reduce((sum, fn) => 
                                            sum + (fn.metrics?.errors || 0), 0
                                        )}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </Card>

                {/* API Gateway Overview */}
                <Card>
                    <h3 className="text-lg font-semibold mb-2">API Gateway</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>Total APIs:</span>
                            <span className="font-mono">{apiGateway.totalApis || 0}</span>
                        </div>
                        {apiGateway.apis && apiGateway.apis.length > 0 && (
                            <>
                                <div className="flex justify-between">
                                    <span>Total Requests:</span>
                                    <span className="font-mono">
                                        {apiGateway.apis.reduce((sum, api) => 
                                            sum + (api.metrics?.count || 0), 0
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Error Rate:</span>
                                    <span className="font-mono">
                                        {apiGateway.apis[0]?.metrics?.errorRate?.toFixed(2) || 0}%
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </Card>

                {/* SQS Overview */}
                <Card>
                    <h3 className="text-lg font-semibold mb-2">SQS Queues</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>Total Queues:</span>
                            <span className="font-mono">{sqs.totalQueues || 0}</span>
                        </div>
                        {sqs.queues && sqs.queues.length > 0 && (
                            <>
                                <div className="flex justify-between">
                                    <span>Messages Available:</span>
                                    <span className="font-mono">
                                        {sqs.queues.reduce((sum, queue) => 
                                            sum + (queue.messagesAvailable || 0), 0
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Messages In Flight:</span>
                                    <span className="font-mono">
                                        {sqs.queues.reduce((sum, queue) => 
                                            sum + (queue.messagesInFlight || 0), 0
                                        )}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </Card>
            </div>
        )
    }

    return (
        <div className="monitoring-dashboard">
            <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Production Monitoring</h2>
                <p className="text-gray-600">
                    Monitor your production Frigg instances in real-time with AWS CloudWatch integration
                </p>
            </div>

            {/* Status Bar */}
            <Card className="mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <StatusBadge 
                            status={monitoringStatus.isMonitoring ? 'success' : 'inactive'}
                            text={monitoringStatus.isMonitoring ? 'Monitoring Active' : 'Monitoring Inactive'}
                        />
                        {monitoringStatus.config && (
                            <div className="text-sm text-gray-600">
                                Region: <span className="font-mono">{monitoringStatus.config.region}</span> | 
                                Stage: <span className="font-mono">{monitoringStatus.config.stage}</span> | 
                                Service: <span className="font-mono">{monitoringStatus.config.serviceName}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {!monitoringStatus.isMonitoring ? (
                            <Button 
                                onClick={initializeMonitoring}
                                disabled={loading}
                            >
                                {loading ? <LoadingSpinner size="sm" /> : 'Start Monitoring'}
                            </Button>
                        ) : (
                            <>
                                <Button 
                                    variant="secondary"
                                    onClick={collectMetricsNow}
                                    disabled={loading}
                                >
                                    Refresh Now
                                </Button>
                                <Button 
                                    variant="secondary"
                                    onClick={stopMonitoring}
                                    disabled={loading}
                                >
                                    Stop Monitoring
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </Card>

            {/* Error Display */}
            {error && (
                <Card className="mb-6 border-red-500 bg-red-50">
                    <div className="text-red-700">
                        <strong>Error:</strong> {error}
                    </div>
                </Card>
            )}

            {/* Navigation Tabs */}
            <div className="flex gap-2 mb-6">
                <Button
                    variant={selectedView === 'overview' ? 'primary' : 'secondary'}
                    onClick={() => setSelectedView('overview')}
                >
                    Overview
                </Button>
                <Button
                    variant={selectedView === 'lambda' ? 'primary' : 'secondary'}
                    onClick={() => setSelectedView('lambda')}
                >
                    Lambda Functions
                </Button>
                <Button
                    variant={selectedView === 'apigateway' ? 'primary' : 'secondary'}
                    onClick={() => setSelectedView('apigateway')}
                >
                    API Gateway
                </Button>
                <Button
                    variant={selectedView === 'sqs' ? 'primary' : 'secondary'}
                    onClick={() => setSelectedView('sqs')}
                >
                    SQS Queues
                </Button>
                <Button
                    variant={selectedView === 'charts' ? 'primary' : 'secondary'}
                    onClick={() => setSelectedView('charts')}
                >
                    Charts
                </Button>
            </div>

            {/* Content Area */}
            {loading && !metrics ? (
                <Card>
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner />
                        <span className="ml-2">Loading metrics...</span>
                    </div>
                </Card>
            ) : (
                <>
                    {selectedView === 'overview' && renderOverview()}
                    {selectedView === 'lambda' && <LambdaMetrics metrics={metrics?.lambda} />}
                    {selectedView === 'apigateway' && <APIGatewayMetrics metrics={metrics?.apiGateway} />}
                    {selectedView === 'sqs' && <SQSMetrics metrics={metrics?.sqs} />}
                    {selectedView === 'charts' && <MetricsChart metrics={metrics} />}
                </>
            )}

            {/* Last Updated */}
            {metrics && (
                <div className="mt-4 text-sm text-gray-500 text-right">
                    Last updated: {new Date(metrics.timestamp).toLocaleString()}
                    {metrics.collectionDuration && (
                        <span> (collected in {metrics.collectionDuration}ms)</span>
                    )}
                </div>
            )}
        </div>
    )
}

export default MonitoringDashboard