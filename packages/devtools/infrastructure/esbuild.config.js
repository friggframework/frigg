/**
 * esbuild Configuration for Frigg Lambda Functions
 * 
 * Optimized for AWS Lambda Node.js 22.x runtime with:
 * - Tree-shaking for minimal bundle size
 * - AWS SDK v3 externalization (provided by Lambda)
 * - Prisma client externalization (in Lambda layer)
 * - Source maps for debugging
 */

module.exports = {
    bundle: true,
    minify: true,
    sourcemap: true,
    target: 'node22',              // AWS Lambda Node.js 22.x (latest supported)
    platform: 'node',
    format: 'cjs',                 // CommonJS for Lambda
    mainFields: ['main', 'module'],

    // External packages - not included in bundle
    external: [
        // AWS SDK v3 - provided by Lambda runtime
        '@aws-sdk/*',
        'aws-sdk',                 // Legacy v2 SDK

        // Prisma - in Lambda layer
        '@prisma/client',
        'prisma',
        '.prisma/*',

        // Native modules
        'sharp',
        'canvas',
        'sqlite3',
        'pg-native',
    ],

    // Package manager
    packager: 'npm',

    // Additional esbuild options
    keepNames: true,               // Preserve function names for debugging
    metafile: true,                // Generate build metadata

    // Exclude patterns (for serverless-esbuild plugin)
    exclude: [
        'aws-sdk',
        '@aws-sdk/*',
        '@prisma/client',
        'prisma',
    ],
};

