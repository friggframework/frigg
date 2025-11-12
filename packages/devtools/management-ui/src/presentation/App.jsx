import React from 'react'
import { BrowserRouter as Router } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppRouter from './components/layout/AppRouter'
import ErrorBoundary from './components/layout/ErrorBoundary'
import { SocketProvider } from './hooks/useSocket'
import { FriggProvider } from './hooks/useFrigg'
import ThemeProvider from './components/theme/ThemeProvider'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system">
          <SocketProvider>
            <FriggProvider>
              <Router>
                <AppRouter />
              </Router>
            </FriggProvider>
          </SocketProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App