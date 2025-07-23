import React from 'react'
import { BrowserRouter as Router } from 'react-router-dom'
import AppRouter from './components/AppRouter'
import ErrorBoundary from './components/ErrorBoundary'
import { SocketProvider } from './hooks/useSocket'
import { FriggProvider } from './hooks/useFrigg'
import { ThemeProvider } from './components/theme-provider'

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