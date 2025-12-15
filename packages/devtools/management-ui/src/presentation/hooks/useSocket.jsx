import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import io from 'socket.io-client'

const SocketContext = createContext()

// Module-level singleton to persist across React StrictMode remounts
let globalSocket = null
let globalSocketUrl = null

export const useSocket = () => {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider')
  }
  return context
}

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(globalSocket)
  const [connected, setConnected] = useState(globalSocket?.connected || false)
  const mountedRef = useRef(false)

  useEffect(() => {
    // Use environment variable or default to current origin
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin

    // Reuse existing socket if it's still valid and for the same URL
    if (globalSocket && globalSocket.connected && globalSocketUrl === socketUrl) {
      setSocket(globalSocket)
      setConnected(true)
      return
    }

    // Clean up any existing disconnected socket
    if (globalSocket && !globalSocket.connected) {
      globalSocket.removeAllListeners()
      globalSocket = null
    }

    // Only log and create on first mount (not StrictMode remount)
    if (!mountedRef.current) {
      console.log('Connecting to WebSocket at:', socketUrl)
    }
    mountedRef.current = true

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      maxReconnectionAttempts: 5,
    })

    // Store globally to persist across StrictMode remounts
    globalSocket = newSocket
    globalSocketUrl = socketUrl

    newSocket.on('connect', () => {
      console.log('Connected to server:', newSocket.id)
      setConnected(true)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason)
      setConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      setConnected(false)
    })

    setSocket(newSocket)

    // Don't disconnect on cleanup - keep socket alive across StrictMode remounts
    // Socket will be cleaned up when the page unloads
    return () => {
      // Only disconnect if we're actually unmounting (not StrictMode)
      // We can detect this by checking if the socket is still the global one
      // If a new socket was created, the old one should be cleaned up
    }
  }, []) // Empty dependency array to prevent re-creation

  const emit = (event, data) => {
    if (socket && connected) {
      socket.emit(event, data)
    }
  }

  const on = (event, callback) => {
    if (socket) {
      socket.on(event, callback)
      return () => socket.off(event, callback)
    }
  }

  return (
    <SocketContext.Provider value={{ socket, connected, emit, on }}>
      {children}
    </SocketContext.Provider>
  )
}