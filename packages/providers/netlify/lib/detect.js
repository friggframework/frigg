/**
 * Netlify Platform Detection
 *
 * Auto-detect if the current runtime is a Netlify Function.
 * Netlify sets the NETLIFY environment variable during builds and function execution.
 *
 * @returns {boolean}
 */
function detect() {
    return !!process.env.NETLIFY;
}

module.exports = { detect };
