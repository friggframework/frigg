import React from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'

/**
 * TestAreaErrorBoundary
 * Catches errors in TestArea without hiding logs
 */
class TestAreaErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('TestAreaErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="max-w-2xl w-full space-y-6">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="w-8 h-8" />
              <h2 className="text-2xl font-bold">Component Error</h2>
            </div>

            <div className="space-y-4">
              <p className="text-muted-foreground">
                An error occurred while rendering the test area. The error has been logged to the console.
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="bg-muted/30 p-4 rounded-lg">
                  <summary className="cursor-pointer text-sm font-medium hover:text-primary">
                    Error details (development only)
                  </summary>
                  <pre className="mt-4 text-xs text-destructive whitespace-pre-wrap overflow-auto max-h-96">
                    {this.state.error.toString()}
                    {'\n\n'}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}

              <div className="flex gap-2">
                <Button onClick={this.handleReset} variant="default">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button onClick={() => window.location.reload()} variant="outline">
                  Reload Page
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                💡 Tip: Check the Live Log Panel below for server errors and debugging information.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default TestAreaErrorBoundary
