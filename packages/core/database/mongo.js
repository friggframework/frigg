// Best Practices Connecting from AWS Lambda:
// https://dev.to/adnanrahic/building-a-serverless-rest-api-with-nodejs-and-mongodb-43db
// https://mongoosejs.com/docs/lambda.html
// https://www.mongodb.com/blog/post/optimizing-aws-lambda-performance-with-mongodb-atlas-and-nodejs
const { Encrypt } = require('../encrypt');
const { mongoose } = require('./mongoose');
const { debug, flushDebugLog } = require('../logs');
const { findNearestBackendPackageJson } = require('../utils');
const path = require('path');
const fs = require('fs');

mongoose.plugin(Encrypt);
mongoose.set('applyPluginsToDiscriminators', true); // Needed for LHEncrypt

// Load app definition to check for DocumentDB configuration
let appDefinition = {};
let mongoConfig = {
    useNewUrlParser: true,
    bufferCommands: false, // Disable mongoose buffering
    autoCreate: false, // Disable because auto creation does not work without buffering
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
};

const checkIsConnected = () => mongoose.connection?.readyState > 0;

const connectToDatabase = async () => {
    if (checkIsConnected()) {
        debug('=> using existing database connection');
        return;
    }

    console.log('🔗 Connecting to database...');

    // Load appDefinition inside the function
    try {
        console.log(
            '🔍 Loading app definition for DocumentDB configuration...'
        );

        const backendPath = findNearestBackendPackageJson();
        if (!backendPath) {
            throw new Error('Could not find backend package.json');
        }

        const backendDir = path.dirname(backendPath);
        const backendFilePath = path.join(backendDir, 'index.js');
        if (!fs.existsSync(backendFilePath)) {
            throw new Error('Could not find index.js');
        }

        const backend = require(backendFilePath);
        appDefinition = backend.Definition;

        console.log('📁 AppDefinition content:', JSON.stringify(appDefinition));

        // Add DocumentDB TLS configuration if enabled
        if (appDefinition.database?.documentDB?.enable === true) {
            console.log('📄 DocumentDB configuration detected, enabling TLS');
            console.log('📁 Current working directory:', process.cwd());
            console.log(
                '📋 App definition database config:',
                JSON.stringify(appDefinition.database, null, 2)
            );

            mongoConfig.tls = true;

            // Set TLS CA file path if specified
            if (appDefinition.database.documentDB.tlsCAFile) {
                const tlsCAFile = appDefinition.database.documentDB.tlsCAFile;

                // Basic safety: reject obviously dangerous paths
                if (tlsCAFile.includes('..') || path.isAbsolute(tlsCAFile)) {
                    console.warn(
                        '⚠️  Rejecting potentially unsafe tlsCAFile path:',
                        tlsCAFile
                    );
                } else {
                    const tlsCAFilePath = path.resolve(
                        process.cwd(),
                        tlsCAFile
                    );

                    console.log('📄 DocumentDB TLS CA file configured:');
                    console.log('   📎 Original path:', tlsCAFile);
                    console.log('   📎 Resolved path:', tlsCAFilePath);
                    console.log(
                        '   📄 File exists:',
                        fs.existsSync(tlsCAFilePath)
                    );

                    // Only set tlsCAFile if the file actually exists
                    if (fs.existsSync(tlsCAFilePath)) {
                        mongoConfig.tlsCAFile = tlsCAFilePath;
                        console.log('✅ TLS CA file configured successfully');
                    } else {
                        throw new Error(
                            `TLS CA file not found at ${tlsCAFilePath}`
                        );
                    }

                    // Debug directory listing (only in development)
                    if (process.env.NODE_ENV !== 'production') {
                        try {
                            console.log('📁 Current directory contents:');
                            fs.readdirSync(process.cwd()).forEach((item) => {
                                const stats = fs.statSync(
                                    path.join(process.cwd(), item)
                                );
                                console.log(
                                    `   ${
                                        stats.isDirectory() ? '📁' : '📄'
                                    } ${item}`
                                );
                            });

                            const securityDir = path.join(
                                process.cwd(),
                                'security'
                            );
                            if (fs.existsSync(securityDir)) {
                                console.log('📁 Security directory contents:');
                                fs.readdirSync(securityDir).forEach((item) => {
                                    console.log(`   📄 ${item}`);
                                });
                            } else {
                                console.log(
                                    '❌ Security directory does not exist at:',
                                    securityDir
                                );
                            }
                        } catch (error) {
                            console.log(
                                '❌ Error listing directory contents:',
                                error.message
                            );
                        }
                    }
                }
            }
        } else {
            console.log(
                '📄 DocumentDB not enabled, using standard MongoDB configuration'
            );
        }
    } catch (error) {
        console.error('❌ Error loading app definition:', error.message);
        debug(
            'Could not load app definition for DocumentDB configuration:',
            error.message
        );
    }

    console.log('🔗 MongoDB URI:', process.env.MONGO_URI ? 'SET' : 'NOT SET');
    console.log('🔧 Final mongoConfig:', JSON.stringify(mongoConfig, null, 2));

    debug('=> using new database connection');
    await mongoose.connect(process.env.MONGO_URI, mongoConfig);
    debug('Connection state:', mongoose.STATES[mongoose.connection.readyState]);
    mongoose.connection.on('error', (error) => flushDebugLog(error));
};

const disconnectFromDatabase = async () => mongoose.disconnect();

const createObjectId = () => new mongoose.Types.ObjectId();

module.exports = {
    connectToDatabase,
    disconnectFromDatabase,
    createObjectId,
};
