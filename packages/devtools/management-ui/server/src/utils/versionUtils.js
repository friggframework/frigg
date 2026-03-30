/**
 * Utility functions for version checking and parsing
 */

/**
 * Checks if a version string represents version 2.0.0 or higher
 * @param {string} version - The version string to check (e.g., "2.0.0", "^2.0.0", "next", "^2.0.0-next.41")
 * @returns {boolean} - True if version is 2.0.0 or higher
 */
export function isVersion2OrHigher(version) {
    if (!version) {
        return false
    }

    // Handle special cases
    if (version === 'next' || version.includes('next')) {
        // "next" typically means latest development version, which should be v2+
        return true
    }

    // Remove any ^ or ~ prefix and pre-release info
    const cleanVersion = version.replace(/^[^0-9]*/, '').split('-')[0]

    // Parse major version
    const majorMatch = cleanVersion.match(/^(\d+)/)
    if (majorMatch) {
        const major = parseInt(majorMatch[1], 10)
        return major >= 2
    }

    return false
}

/**
 * Extracts the core version from a dependency string
 * @param {string} dependencyString - The dependency string (e.g., "@friggframework/core@^2.0.0-next.41")
 * @returns {string|null} - The version string or null if not found
 */
export function extractCoreVersion(dependencyString) {
    if (!dependencyString || !dependencyString.startsWith('@friggframework/core@')) {
        return null
    }

    const versionMatch = dependencyString.match(/@friggframework\/core@(.+)/)
    return versionMatch ? versionMatch[1] : null
}

/**
 * Checks if a repository has @friggframework/core v2+ based on its dependencies
 * @param {Object} repo - The repository object
 * @returns {boolean} - True if the repository has @friggframework/core v2+
 */
export function hasFriggCoreV2(repo) {
    // Check if the repository has @friggframework/core dependency
    if (!repo.friggDependencies || !Array.isArray(repo.friggDependencies)) {
        return false
    }

    // Look for @friggframework/core in the dependencies with version info
    const coreDependency = repo.friggDependencies.find(dep =>
        dep.startsWith('@friggframework/core@')
    )

    if (!coreDependency) {
        return false
    }

    const version = extractCoreVersion(coreDependency)
    return version ? isVersion2OrHigher(version) : false
}
