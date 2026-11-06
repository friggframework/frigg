import { CloudWatchClient, GetMetricStatisticsCommand, ListMetricsCommand, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch'
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand } from '@aws-sdk/client-lambda'
import { APIGatewayClient, GetRestApisCommand, GetResourcesCommand } from '@aws-sdk/client-api-gateway'
import { SQSClient, GetQueueAttributesCommand, ListQueuesCommand } from '@aws-sdk/client-sqs'
import { EventEmitter } from 'events'

/**
 * AWS Monitoring Service for Frigg Production Instances
 * Provides real-time metrics collection and monitoring for AWS resources
 */
export class AWSMonitoringService extends EventEmitter {
    constructor(config = {}) {
        super()
        this.region = config.region || process.env.AWS_REGION || 'us-east-1'
        this.stage = config.stage || process.env.STAGE || 'production'
        this.serviceName = config.serviceName || process.env.SERVICE_NAME || 'frigg'
        
        // Initialize AWS clients
        this.cloudWatchClient = new CloudWatchClient({ region: this.region })
        this.lambdaClient = new LambdaClient({ region: this.region })
        this.apiGatewayClient = new APIGatewayClient({ region: this.region })
        this.sqsClient = new SQSClient({ region: this.region })
        
        // Metrics collection interval (default 60 seconds)
        this.collectionInterval = config.collectionInterval || 60000
        this.metricsCache = new Map()
        this.isMonitoring = false
    }

    /**
     * Start monitoring AWS resources
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('Monitoring already started')
            return
        }

        this.isMonitoring = true
        console.log(`Starting AWS monitoring for ${this.serviceName}-${this.stage}`)
        
        // Initial collection
        await this.collectAllMetrics()
        
        // Set up periodic collection
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.collectAllMetrics()
            } catch (error) {
                console.error('Error collecting metrics:', error)
                this.emit('error', { type: 'collection_error', error: error.message })
            }
        }, this.collectionInterval)
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval)
            this.monitoringInterval = null
        }
        this.isMonitoring = false
        console.log('Monitoring stopped')
    }

    /**
     * Collect all metrics from various AWS services
     */
    async collectAllMetrics() {
        const startTime = Date.now()
        
        try {
            const [lambdaMetrics, apiGatewayMetrics, sqsMetrics] = await Promise.all([
                this.collectLambdaMetrics(),
                this.collectAPIGatewayMetrics(),
                this.collectSQSMetrics()
            ])

            const allMetrics = {
                timestamp: new Date().toISOString(),
                region: this.region,
                stage: this.stage,
                serviceName: this.serviceName,
                lambda: lambdaMetrics,
                apiGateway: apiGatewayMetrics,
                sqs: sqsMetrics,
                collectionDuration: Date.now() - startTime
            }

            // Update cache
            this.metricsCache.set('latest', allMetrics)
            
            // Emit metrics for real-time updates
            this.emit('metrics', allMetrics)
            
            return allMetrics
        } catch (error) {
            console.error('Error collecting metrics:', error)
            throw error
        }
    }

    /**
     * Collect Lambda function metrics
     */
    async collectLambdaMetrics() {
        try {
            // List all functions for this service
            const listCommand = new ListFunctionsCommand({})
            const { Functions } = await this.lambdaClient.send(listCommand)
            
            // Filter functions by service name and stage
            const serviceFunctions = Functions.filter(fn => 
                fn.FunctionName.includes(this.serviceName) && 
                fn.FunctionName.includes(this.stage)
            )

            // Collect metrics for each function
            const functionMetrics = await Promise.all(
                serviceFunctions.map(async (fn) => {
                    const metrics = await this.getLambdaMetrics(fn.FunctionName)
                    return {
                        functionName: fn.FunctionName,
                        runtime: fn.Runtime,
                        memorySize: fn.MemorySize,
                        timeout: fn.Timeout,
                        lastModified: fn.LastModified,
                        metrics
                    }
                })
            )

            return {
                totalFunctions: functionMetrics.length,
                functions: functionMetrics
            }
        } catch (error) {
            console.error('Error collecting Lambda metrics:', error)
            return { error: error.message }
        }
    }

    /**
     * Get CloudWatch metrics for a specific Lambda function
     */
    async getLambdaMetrics(functionName) {
        const endTime = new Date()
        const startTime = new Date(endTime.getTime() - 3600000) // Last hour
        
        const metricQueries = [
            { metricName: 'Invocations', stat: 'Sum' },
            { metricName: 'Errors', stat: 'Sum' },
            { metricName: 'Duration', stat: 'Average' },
            { metricName: 'Throttles', stat: 'Sum' },
            { metricName: 'ConcurrentExecutions', stat: 'Average' }
        ]

        const metrics = {}
        
        for (const query of metricQueries) {
            try {
                const command = new GetMetricStatisticsCommand({
                    Namespace: 'AWS/Lambda',
                    MetricName: query.metricName,
                    Dimensions: [
                        {
                            Name: 'FunctionName',
                            Value: functionName
                        }
                    ],
                    StartTime: startTime,
                    EndTime: endTime,
                    Period: 300, // 5 minutes
                    Statistics: [query.stat]
                })
                
                const { Datapoints } = await this.cloudWatchClient.send(command)
                
                // Get the most recent datapoint
                const latestDatapoint = Datapoints.sort((a, b) => 
                    new Date(b.Timestamp) - new Date(a.Timestamp)
                )[0]
                
                metrics[query.metricName.toLowerCase()] = latestDatapoint 
                    ? latestDatapoint[query.stat] 
                    : 0
            } catch (error) {
                console.error(`Error getting ${query.metricName} for ${functionName}:`, error)
                metrics[query.metricName.toLowerCase()] = null
            }
        }
        
        return metrics
    }

    /**
     * Collect API Gateway metrics
     */
    async collectAPIGatewayMetrics() {
        try {
            // Get REST APIs
            const { items } = await this.apiGatewayClient.send(new GetRestApisCommand({}))
            
            // Filter APIs by service name
            const serviceApis = items.filter(api => 
                api.name.includes(this.serviceName) && 
                api.name.includes(this.stage)
            )

            // Collect metrics for each API
            const apiMetrics = await Promise.all(
                serviceApis.map(async (api) => {
                    const metrics = await this.getAPIGatewayMetrics(api.name)
                    return {
                        apiId: api.id,
                        apiName: api.name,
                        description: api.description,
                        createdDate: api.createdDate,
                        metrics
                    }
                })
            )

            return {
                totalApis: apiMetrics.length,
                apis: apiMetrics
            }
        } catch (error) {
            console.error('Error collecting API Gateway metrics:', error)
            return { error: error.message }
        }
    }

    /**
     * Get CloudWatch metrics for API Gateway
     */
    async getAPIGatewayMetrics(apiName) {
        const endTime = new Date()
        const startTime = new Date(endTime.getTime() - 3600000) // Last hour
        
        const metricQueries = [
            { metricName: 'Count', stat: 'Sum' },
            { metricName: '4XXError', stat: 'Sum' },
            { metricName: '5XXError', stat: 'Sum' },
            { metricName: 'Latency', stat: 'Average' },
            { metricName: 'IntegrationLatency', stat: 'Average' }
        ]

        const metrics = {}
        
        for (const query of metricQueries) {
            try {
                const command = new GetMetricStatisticsCommand({
                    Namespace: 'AWS/ApiGateway',
                    MetricName: query.metricName,
                    Dimensions: [
                        {
                            Name: 'ApiName',
                            Value: apiName
                        }
                    ],
                    StartTime: startTime,
                    EndTime: endTime,
                    Period: 300, // 5 minutes
                    Statistics: [query.stat]
                })
                
                const { Datapoints } = await this.cloudWatchClient.send(command)
                
                // Get the most recent datapoint
                const latestDatapoint = Datapoints.sort((a, b) => 
                    new Date(b.Timestamp) - new Date(a.Timestamp)
                )[0]
                
                metrics[query.metricName.toLowerCase()] = latestDatapoint 
                    ? latestDatapoint[query.stat] 
                    : 0
            } catch (error) {
                console.error(`Error getting ${query.metricName} for ${apiName}:`, error)
                metrics[query.metricName.toLowerCase()] = null
            }
        }
        
        // Calculate error rate
        if (metrics.count > 0) {
            metrics.errorRate = ((metrics['4xxerror'] + metrics['5xxerror']) / metrics.count) * 100
        } else {
            metrics.errorRate = 0
        }
        
        return metrics
    }

    /**
     * Collect SQS queue metrics
     */
    async collectSQSMetrics() {
        try {
            // List all queues
            const { QueueUrls } = await this.sqsClient.send(new ListQueuesCommand({}))
            
            // Filter queues by service name
            const serviceQueues = QueueUrls.filter(url => 
                url.includes(this.serviceName) && 
                url.includes(this.stage)
            )

            // Get attributes for each queue
            const queueMetrics = await Promise.all(
                serviceQueues.map(async (queueUrl) => {
                    const queueName = queueUrl.split('/').pop()
                    
                    try {
                        const { Attributes } = await this.sqsClient.send(new GetQueueAttributesCommand({
                            QueueUrl: queueUrl,
                            AttributeNames: ['All']
                        }))
                        
                        return {
                            queueName,
                            queueUrl,
                            messagesAvailable: parseInt(Attributes.ApproximateNumberOfMessages || 0),
                            messagesInFlight: parseInt(Attributes.ApproximateNumberOfMessagesNotVisible || 0),
                            messagesDelayed: parseInt(Attributes.ApproximateNumberOfMessagesDelayed || 0),
                            createdTimestamp: Attributes.CreatedTimestamp,
                            lastModifiedTimestamp: Attributes.LastModifiedTimestamp,
                            visibilityTimeout: parseInt(Attributes.VisibilityTimeout || 0),
                            messageRetentionPeriod: parseInt(Attributes.MessageRetentionPeriod || 0)
                        }
                    } catch (error) {
                        console.error(`Error getting attributes for queue ${queueName}:`, error)
                        return {
                            queueName,
                            queueUrl,
                            error: error.message
                        }
                    }
                })
            )

            return {
                totalQueues: queueMetrics.length,
                queues: queueMetrics
            }
        } catch (error) {
            console.error('Error collecting SQS metrics:', error)
            return { error: error.message }
        }
    }

    /**
     * Get current cached metrics
     */
    getLatestMetrics() {
        return this.metricsCache.get('latest') || null
    }

    /**
     * Get historical metrics (last N collections)
     */
    getHistoricalMetrics(limit = 10) {
        // This would typically query from a time-series database
        // For now, we'll just return the latest metrics
        const latest = this.getLatestMetrics()
        return latest ? [latest] : []
    }

    /**
     * Custom metric publishing for application-specific metrics
     */
    async publishCustomMetric(metricName, value, unit = 'Count', dimensions = []) {
        try {
            const command = new PutMetricDataCommand({
                Namespace: `Frigg/${this.serviceName}`,
                MetricData: [
                    {
                        MetricName: metricName,
                        Value: value,
                        Unit: unit,
                        Timestamp: new Date(),
                        Dimensions: [
                            {
                                Name: 'Stage',
                                Value: this.stage
                            },
                            ...dimensions
                        ]
                    }
                ]
            })
            
            await this.cloudWatchClient.send(command)
            console.log(`Published custom metric: ${metricName} = ${value}`)
        } catch (error) {
            console.error('Error publishing custom metric:', error)
            throw error
        }
    }
}

// Create singleton instance
let monitoringService = null

export function getMonitoringService(config = {}) {
    if (!monitoringService) {
        monitoringService = new AWSMonitoringService(config)
    }
    return monitoringService
}

export default AWSMonitoringService