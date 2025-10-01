import React from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Card } from '../ui/card'
import { Play, Loader2, CheckCircle, AlertCircle, Square, Radio } from 'lucide-react'
import { cn } from '../../../lib/utils'

/**
 * Welcome screen for Test Area
 * Shows banner prompting user to start Frigg application
 */
const TestAreaWelcome = ({
  friggStatus,
  onStartFrigg,
  onStopFrigg,
  onAttachToExisting,
  isStarting,
  isStopping,
  error,
  existingProcess
}) => {
  const isRunning = friggStatus?.isRunning
  const projectName = friggStatus?.projectName || 'Frigg Project'

  return (
    <div className="h-full flex items-center justify-center p-8">
      <Card className="max-w-2xl w-full p-8">
        <div className="text-center space-y-6">
          {/* Status Icon */}
          <div className="flex justify-center">
            {isStarting ? (
              <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-yellow-600 dark:text-yellow-400 animate-spin" />
              </div>
            ) : isRunning ? (
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900/20 flex items-center justify-center">
                <Play className="w-8 h-8 text-gray-600 dark:text-gray-400" />
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold mb-2">
              {isRunning ? 'Frigg Application Running' : 'Welcome to Test Area'}
            </h2>
            <p className="text-muted-foreground">
              {isRunning
                ? `${projectName} is running and ready for testing`
                : 'To begin testing, start your Frigg application'
              }
            </p>
          </div>

          {/* Status Badge */}
          {friggStatus && (
            <div className="flex justify-center gap-3">
              <Badge
                className={cn(
                  isRunning
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'
                )}
              >
                {friggStatus.status || 'stopped'}
              </Badge>
              {isRunning && friggStatus.port && (
                <Badge variant="outline">
                  Port: {friggStatus.port}
                </Badge>
              )}
            </div>
          )}

          {/* Detected Existing Process Warning */}
          {friggStatus?.detectedExisting && (
            <div className="flex items-start gap-2 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-left text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-1">Existing Process Detected</p>
                <p>Found a Frigg process already running on port {friggStatus.port}. This process was started outside the Management UI. You can use it, but logs won't be streamed to this interface.</p>
              </div>
            </div>
          )}

          {/* Existing Process Conflict */}
          {existingProcess && (
            <div className="flex items-start gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-left text-sm text-yellow-800 dark:text-yellow-200 space-y-2 flex-1">
                <div>
                  <p className="font-semibold mb-1">Process Already Running</p>
                  <p>A Frigg process is already running on PID {existingProcess.pid}, port {existingProcess.port}. Choose an option:</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAttachToExisting}
                    disabled={isStopping}
                    className="flex items-center gap-2"
                  >
                    <Radio className="w-3 h-3" />
                    Attach to Existing
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onStopFrigg}
                    disabled={isStopping}
                    className="flex items-center gap-2"
                  >
                    <Square className="w-3 h-3" />
                    {isStopping ? 'Stopping...' : 'Stop & Restart'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && !existingProcess && (
            <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-left text-sm text-red-800 dark:text-red-200">
                {error}
              </div>
            </div>
          )}

          {/* Action Button */}
          {!isRunning && !existingProcess && (
            <div className="pt-4">
              <Button
                size="lg"
                onClick={onStartFrigg}
                disabled={isStarting}
                className="min-w-[200px]"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Frigg Application
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Info Text */}
          <div className="text-sm text-muted-foreground space-y-2">
            {isRunning ? (
              <>
                <p>✓ Your Frigg application is now running</p>
                <p>✓ Ready to proceed to user selection</p>
              </>
            ) : (
              <>
                <p>The Frigg application must be running to test integrations</p>
                <p>This will start the local development server</p>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default TestAreaWelcome