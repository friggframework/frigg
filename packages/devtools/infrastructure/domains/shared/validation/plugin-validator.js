/**
 * Plugin Validator
 *
 * Validation Layer - Hexagonal Architecture
 *
 * Validates serverless plugin configuration to detect conflicts and provide
 * migration guidance for packaging plugins (serverless-esbuild vs serverless-jetpack).
 */

/**
 * Detect conflicting packaging plugins in serverless configuration
 *
 * @param {Array<string>} plugins - List of serverless plugins
 * @returns {Object} Validation result with conflict detection
 */
function detectConflictingPlugins(plugins = []) {
    const hasEsbuild = plugins.includes('serverless-esbuild');
    const hasJetpack = plugins.includes('serverless-jetpack');

    const result = {
        hasConflict: false,
        hasEsbuild,
        hasJetpack,
        warnings: [],
        recommendations: [],
    };

    // Check for explicit conflict - both plugins present
    if (hasEsbuild && hasJetpack) {
        result.hasConflict = true;
        result.warnings.push(
            'Both serverless-esbuild and serverless-jetpack are configured. ' +
            'These plugins have overlapping functionality for Lambda packaging.'
        );
        result.recommendations.push(
            'Remove serverless-jetpack from your serverless.yml plugins array.',
            'The Frigg framework now uses serverless-esbuild as the standard bundling solution.',
            'See docs/reference/aws-sdk-v3-osls-migration.md for migration guidance.'
        );
    }

    // Check for legacy jetpack usage (jetpack without esbuild)
    if (hasJetpack && !hasEsbuild) {
        result.warnings.push(
            'serverless-jetpack is a legacy packaging plugin. ' +
            'Frigg framework now recommends serverless-esbuild for better performance and compatibility.'
        );
        result.recommendations.push(
            'Consider migrating to serverless-esbuild for improved build times and tree-shaking.',
            'Update your serverless.yml to use serverless-esbuild instead of serverless-jetpack.',
            'See docs/reference/aws-sdk-v3-osls-migration.md for migration guidance.'
        );
    }

    // Validate esbuild is present (standard for Frigg)
    if (!hasEsbuild && !hasJetpack) {
        result.warnings.push(
            'No packaging plugin detected. Serverless will use default packaging which may be slow.'
        );
        result.recommendations.push(
            'Add serverless-esbuild to your serverless.yml plugins array for optimized Lambda bundling.'
        );
    }

    return result;
}

/**
 * Validate and clean plugin list by removing conflicts
 *
 * Automatically removes serverless-jetpack if serverless-esbuild is present.
 * This provides automatic migration for users with legacy configurations.
 *
 * @param {Array<string>} plugins - List of serverless plugins
 * @param {Object} options - Validation options
 * @param {boolean} options.autoFix - Automatically fix conflicts by removing jetpack (default: true)
 * @param {boolean} options.silent - Suppress console warnings (default: false)
 * @returns {Object} Result with cleaned plugins and validation info
 */
function validateAndCleanPlugins(plugins = [], options = {}) {
    const { autoFix = true, silent = false } = options;
    const validation = detectConflictingPlugins(plugins);

    let cleanedPlugins = [...plugins];
    let modified = false;

    // Auto-fix: Remove jetpack if esbuild is present
    if (validation.hasConflict && autoFix) {
        cleanedPlugins = plugins.filter(p => p !== 'serverless-jetpack');
        modified = true;

        if (!silent) {
            console.warn('\n⚠️  Plugin Conflict Detected and Auto-Fixed:');
            console.warn('   Removed serverless-jetpack (using serverless-esbuild instead)');
            console.warn('   The Frigg framework uses serverless-esbuild as the standard bundling solution.\n');
        }
    }

    // Show warnings for other cases
    if (!silent && validation.warnings.length > 0 && !modified) {
        console.warn('\n⚠️  Plugin Configuration Warning:');
        validation.warnings.forEach(warning => {
            console.warn(`   ${warning}`);
        });

        if (validation.recommendations.length > 0) {
            console.warn('\n💡 Recommendations:');
            validation.recommendations.forEach(rec => {
                console.warn(`   • ${rec}`);
            });
            console.warn('');
        }
    }

    return {
        plugins: cleanedPlugins,
        modified,
        validation,
    };
}

/**
 * Check if a serverless definition has proper packaging configuration
 *
 * @param {Object} serverlessDefinition - Serverless framework definition
 * @returns {Object} Validation result
 */
function validatePackagingConfiguration(serverlessDefinition) {
    const plugins = serverlessDefinition?.plugins || [];
    const custom = serverlessDefinition?.custom || {};

    const result = {
        valid: true,
        errors: [],
        warnings: [],
    };

    const hasEsbuild = plugins.includes('serverless-esbuild');
    const hasEsbuildConfig = custom.esbuild !== undefined;

    // If esbuild plugin is present, ensure it's configured
    if (hasEsbuild && !hasEsbuildConfig) {
        result.warnings.push(
            'serverless-esbuild plugin is present but custom.esbuild configuration is missing. ' +
            'Using default esbuild settings.'
        );
    }

    // Check for external dependencies in esbuild config
    if (hasEsbuildConfig && hasEsbuild) {
        const external = custom.esbuild.external || [];

        // Validate that AWS SDK and Prisma are externalized
        const hasAwsSdkExternal = external.some(e =>
            e === '@aws-sdk/*' || e === 'aws-sdk' || e.startsWith('@aws-sdk/')
        );
        const hasPrismaExternal = external.some(e =>
            e === '@prisma/client' || e === 'prisma' || e.startsWith('.prisma')
        );

        if (!hasAwsSdkExternal) {
            result.warnings.push(
                'AWS SDK is not externalized in esbuild config. ' +
                'Consider adding "@aws-sdk/*" to external array to reduce bundle size.'
            );
        }

        if (!hasPrismaExternal) {
            result.warnings.push(
                'Prisma is not externalized in esbuild config. ' +
                'Consider adding "@prisma/client" to external array since it\'s provided via Lambda Layer.'
            );
        }
    }

    if (result.errors.length > 0) {
        result.valid = false;
    }

    return result;
}

module.exports = {
    detectConflictingPlugins,
    validateAndCleanPlugins,
    validatePackagingConfiguration,
};
