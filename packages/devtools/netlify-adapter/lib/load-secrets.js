/**
 * Netlify Secrets Loader (No-Op)
 *
 * On Netlify, environment variables are injected natively into the function
 * runtime — no fetching needed (unlike AWS Secrets Manager on Lambda).
 *
 * This function exists to satisfy the provider plugin interface contract.
 */
async function loadSecrets() {
    // No-op: Netlify env vars are already in process.env
}

module.exports = { loadSecrets };
