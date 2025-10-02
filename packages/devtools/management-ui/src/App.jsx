import React from 'react'
import { BrowserRouter as Router } from 'react-router-dom'
import AppRouter from './presentation/components/AppRouter'
import ErrorBoundary from './presentation/components/layout/ErrorBoundary'
import { SocketProvider } from './hooks/useSocket'
import { FriggProvider } from './presentation/hooks/useFrigg'
import { ThemeProvider } from './presentation/components/theme/ThemeProvider'

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <SocketProvider>
          <FriggProvider>
            <Router>
              <AppRouter />
            </Router>
          </FriggProvider>
        </SocketProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App