import { EventEmitter } from 'events'

class WebSocketHandler extends EventEmitter {
    constructor() {
        super();
        this.clients = new Map();
        this.subscriptions = new Map();
    }

    setupWebSocket(wss) {
        wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            
            console.log(`New WebSocket connection: ${clientId}`);
            
            // Store client connection
            this.clients.set(clientId, {
                ws,
                subscriptions: new Set(),
                connectedAt: new Date()
            });

            // Send welcome message
            this.sendToClient(clientId, {
                type: 'connection',
                data: {
                    clientId,
                    message: 'Connected to Frigg Management Server',
                    timestamp: new Date().toISOString()
                }
            });

            // Handle incoming messages
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleMessage(clientId, data);
                } catch (error) {
                    console.error('Invalid WebSocket message:', error);
                    this.sendToClient(clientId, {
                        type: 'error',
                        data: {
                            message: 'Invalid message format',
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            });

            // Handle client disconnect
            ws.on('close', () => {
                console.log(`Client disconnected: ${clientId}`);
                this.handleDisconnect(clientId);
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error(`WebSocket error for client ${clientId}:`, error);
                this.handleDisconnect(clientId);
            });

            // Ping to keep connection alive
            const pingInterval = setInterval(() => {
                if (ws.readyState === ws.OPEN) {
                    ws.ping();
                } else {
                    clearInterval(pingInterval);
                }
            }, 30000);
        });
    }

    handleMessage(clientId, message) {
        const { type, data } = message;

        switch (type) {
            case 'subscribe':
                this.handleSubscribe(clientId, data);
                break;
            case 'unsubscribe':
                this.handleUnsubscribe(clientId, data);
                break;
            case 'ping':
                this.sendToClient(clientId, { type: 'pong', data: { timestamp: new Date().toISOString() } });
                break;
            default:
                // Emit custom events for other components to handle
                this.emit(type, { clientId, data });
        }
    }

    handleSubscribe(clientId, data) {
        const { topics } = data;
        const client = this.clients.get(clientId);
        
        if (!client) return;

        topics.forEach(topic => {
            client.subscriptions.add(topic);
            
            if (!this.subscriptions.has(topic)) {
                this.subscriptions.set(topic, new Set());
            }
            this.subscriptions.get(topic).add(clientId);
        });

        this.sendToClient(clientId, {
            type: 'subscribed',
            data: {
                topics,
                timestamp: new Date().toISOString()
            }
        });
    }

    handleUnsubscribe(clientId, data) {
        const { topics } = data;
        const client = this.clients.get(clientId);
        
        if (!client) return;

        topics.forEach(topic => {
            client.subscriptions.delete(topic);
            
            const topicSubscribers = this.subscriptions.get(topic);
            if (topicSubscribers) {
                topicSubscribers.delete(clientId);
                if (topicSubscribers.size === 0) {
                    this.subscriptions.delete(topic);
                }
            }
        });

        this.sendToClient(clientId, {
            type: 'unsubscribed',
            data: {
                topics,
                timestamp: new Date().toISOString()
            }
        });
    }

    handleDisconnect(clientId) {
        const client = this.clients.get(clientId);
        
        if (!client) return;

        // Remove from all topic subscriptions
        client.subscriptions.forEach(topic => {
            const topicSubscribers = this.subscriptions.get(topic);
            if (topicSubscribers) {
                topicSubscribers.delete(clientId);
                if (topicSubscribers.size === 0) {
                    this.subscriptions.delete(topic);
                }
            }
        });

        // Remove client
        this.clients.delete(clientId);
    }

    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        
        if (client && client.ws.readyState === client.ws.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    broadcast(topic, message) {
        const subscribers = this.subscriptions.get(topic);
        
        if (!subscribers) return;

        const broadcastMessage = {
            type: 'broadcast',
            topic,
            data: message,
            timestamp: new Date().toISOString()
        };

        subscribers.forEach(clientId => {
            this.sendToClient(clientId, broadcastMessage);
        });
    }

    broadcastToAll(message) {
        const broadcastMessage = {
            type: 'broadcast',
            data: message,
            timestamp: new Date().toISOString()
        };

        this.clients.forEach((client, clientId) => {
            this.sendToClient(clientId, broadcastMessage);
        });
    }

    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Create singleton instance
const wsHandler = new WebSocketHandler()

/**
 * Setup WebSocket handling for Socket.IO server
 * @param {Server} io - Socket.IO server instance
 */
function setupWebSocket(io) {
    io.on('connection', (socket) => {
        const clientId = wsHandler.generateClientId()
        
        console.log(`New WebSocket connection: ${clientId}`)
        
        // Store client connection
        wsHandler.clients.set(clientId, {
            socket,
            subscriptions: new Set(),
            connectedAt: new Date()
        })

        // Send welcome message
        socket.emit('connection', {
            clientId,
            message: 'Connected to Frigg Management Server',
            timestamp: new Date().toISOString()
        })

        // Handle incoming messages
        socket.on('message', (data) => {
            try {
                wsHandler.handleMessage(clientId, data)
            } catch (error) {
                console.error('Invalid WebSocket message:', error)
                socket.emit('error', {
                    message: 'Invalid message format',
                    timestamp: new Date().toISOString()
                })
            }
        })

        // Handle subscriptions
        socket.on('subscribe', (data) => {
            wsHandler.handleSubscribe(clientId, data)
        })

        socket.on('unsubscribe', (data) => {
            wsHandler.handleUnsubscribe(clientId, data)
        })

        // Handle ping
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: new Date().toISOString() })
        })

        // Handle client disconnect
        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${clientId}`)
            wsHandler.handleDisconnect(clientId)
        })

        // Handle errors
        socket.on('error', (error) => {
            console.error(`WebSocket error for client ${clientId}:`, error)
            wsHandler.handleDisconnect(clientId)
        })

        // Keep-alive ping
        const pingInterval = setInterval(() => {
            if (socket.connected) {
                socket.emit('ping', { timestamp: new Date().toISOString() })
            } else {
                clearInterval(pingInterval)
            }
        }, 30000)
    })

    // Store io instance for broadcasting
    wsHandler.io = io
}

// Enhanced handler methods
WebSocketHandler.prototype.sendToClient = function(clientId, message) {
    const client = this.clients.get(clientId)
    
    if (client && client.socket.connected) {
        client.socket.emit('message', message)
    }
}

WebSocketHandler.prototype.broadcast = function(topic, message) {
    const subscribers = this.subscriptions.get(topic)
    
    if (!subscribers) {
        // If no specific subscribers, broadcast to all connected clients
        this.broadcastToAll({ topic, ...message })
        return
    }

    const broadcastMessage = {
        type: 'broadcast',
        topic,
        data: message,
        timestamp: new Date().toISOString()
    }

    subscribers.forEach(clientId => {
        this.sendToClient(clientId, broadcastMessage)
    })
}

WebSocketHandler.prototype.broadcastToAll = function(message) {
    if (this.io) {
        this.io.emit('broadcast', {
            data: message,
            timestamp: new Date().toISOString()
        })
    }
}

// Export setup function and handler instance
export { setupWebSocket, wsHandler }