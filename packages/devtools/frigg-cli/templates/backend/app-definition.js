/**
 * Frigg Application Definition
 * 
 * This file defines your Frigg application configuration including
 * integrations, user management, security settings, and more.
 */

const HubSpotIntegration = require('./src/integrations/HubSpotIntegration');

/**
 * Main application definition
 * This object configures your entire Frigg backend
 */
const appDefinition = {
    /**
     * Integrations Array
     * Add your integration classes here to enable them in your application
     */
    integrations: [
        HubSpotIntegration,
        // Add more integrations here as you install them
        // Example:
        // SlackIntegration,
        // SalesforceIntegration,
    ],

    /**
     * User Configuration
     * Configure how users are managed in your application
     */
    user: {
        // Enable password-based authentication
        password: true,
        
        // Additional user fields (optional)
        // fields: ['email', 'firstName', 'lastName'],
        
        // Custom user model (optional)
        // model: CustomUserModel,
    },

    /**
     * Authentication Configuration
     * Configure how authentication works for your integrations
     */
    auth: {
        // JWT secret - should be set via environment variable
        // jwtSecret: process.env.JWT_SECRET,
        
        // Token expiration time
        // tokenExpiry: '24h',
        
        // Refresh token settings
        // refreshTokenExpiry: '7d',
    },

    /**
     * Database Configuration
     * Configure your database connection and models
     */
    database: {
        // Database URI - should be set via environment variable
        // uri: process.env.DATABASE_URL,
        
        // MongoDB-specific options
        // mongodb: {
        //     useNewUrlParser: true,
        //     useUnifiedTopology: true,
        // },
    },

    /**
     * Security Configuration
     * Configure security settings for your application
     */
    security: {
        // CORS settings
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            credentials: true,
        },
        
        // Rate limiting
        // rateLimit: {
        //     windowMs: 15 * 60 * 1000, // 15 minutes
        //     max: 100, // limit each IP to 100 requests per windowMs
        // },
    },

    /**
     * Webhook Configuration
     * Configure webhook handling for your integrations
     */
    webhooks: {
        // Webhook secret for signature verification
        // secret: process.env.WEBHOOK_SECRET,
        
        // Webhook endpoint prefix
        // prefix: '/webhooks',
    },

    /**
     * Logging Configuration
     * Configure logging for your application
     */
    logging: {
        // Log level (error, warn, info, debug)
        level: process.env.LOG_LEVEL || 'info',
        
        // Log format
        // format: 'json',
    },

    /**
     * Custom Configuration
     * Add any custom configuration specific to your application
     */
    custom: {
        // Application name
        appName: 'My Frigg Application',
        
        // Version
        version: '1.0.0',
        
        // Environment
        environment: process.env.NODE_ENV || 'development',
        
        // Any other custom settings
        // features: {
        //     enableAnalytics: true,
        //     enableNotifications: false,
        // },
    },
};

module.exports = appDefinition;