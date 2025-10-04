/**
 * OAuth2 Callback Handler Component
 * Handles OAuth2 redirects from external providers
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'

const OAuthCallback = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [status, setStatus] = useState('processing') // 'processing', 'success', 'error'
    const [message, setMessage] = useState('')
    const [entity, setEntity] = useState(null)

    useEffect(() => {
        handleOAuthCallback()
    }, [])

    const handleOAuthCallback = async () => {
        try {
            const error = searchParams.get('error')
            const success = searchParams.get('success')
            const module = searchParams.get('module')
            const entityId = searchParams.get('entityId')

            if (error) {
                setStatus('error')
                setMessage(`OAuth error: ${error}`)
                return
            }

            if (success === 'true' && module && entityId) {
                setStatus('success')
                setMessage(`Successfully connected to ${module}!`)
                setEntity({ module, entityId })
                return
            }

            // If we get here, something went wrong
            setStatus('error')
            setMessage('Invalid callback parameters')
        } catch (err) {
            setStatus('error')
            setMessage('Failed to process OAuth callback')
        }
    }

    const handleReturnToTestArea = () => {
        navigate('/test-area')
    }

    if (status === 'processing') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="w-full max-w-md p-8 text-center">
                    <div className="flex flex-col items-center space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <h2 className="text-xl font-semibold">Completing Connection</h2>
                        <p className="text-muted-foreground">
                            Please wait while we finalize your OAuth connection...
                        </p>
                    </div>
                </Card>
            </div>
        )
    }

    if (status === 'success') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="w-full max-w-md p-8 text-center">
                    <div className="flex flex-col items-center space-y-4">
                        <CheckCircle className="h-12 w-12 text-green-500" />
                        <h2 className="text-xl font-semibold text-green-700">Connection Successful!</h2>
                        <p className="text-muted-foreground">
                            {message}
                        </p>
                        {entity && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full">
                                <p className="text-sm text-green-800">
                                    <strong>Module:</strong> {entity.module}
                                </p>
                                <p className="text-sm text-green-800">
                                    <strong>Entity ID:</strong> {entity.entityId}
                                </p>
                            </div>
                        )}
                        <Button onClick={handleReturnToTestArea} className="w-full">
                            Return to Test Area
                        </Button>
                    </div>
                </Card>
            </div>
        )
    }

    if (status === 'error') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="w-full max-w-md p-8 text-center">
                    <div className="flex flex-col items-center space-y-4">
                        <XCircle className="h-12 w-12 text-red-500" />
                        <h2 className="text-xl font-semibold text-red-700">Connection Failed</h2>
                        <p className="text-muted-foreground">
                            {message}
                        </p>
                        <Button onClick={handleReturnToTestArea} variant="outline" className="w-full">
                            Return to Test Area
                        </Button>
                    </div>
                </Card>
            </div>
        )
    }

    return null
}

export default OAuthCallback
