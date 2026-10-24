/**
 * Netlify Platform Detection
 *
 * True when the process runs on Netlify. Core's isDeployedRuntime() asks the
 * active provider this question (providers/runtime-detection), so a Netlify
 * Function is treated as deployed (fail closed) rather than as a local run.
 *
 * Signals, in order of reliability:
 * - FRIGG_PROVIDER=netlify: set by the preamble of every generated function
 *   entry point (lib/get-function-entry-points), so it holds inside a deployed
 *   Netlify Function whatever the site environment contains. It is the
 *   reliable runtime signal: Netlify documents NETLIFY, SITE_ID, CONTEXT and
 *   the deploy URLs as build-time variables, not as Function runtime ones.
 * - NETLIFY: set during Netlify builds (and in some runtimes).
 *
 * `netlify dev` sets NETLIFY_DEV=true; core treats that as a local run before
 * consulting detect().
 *
 * @param {Object} [env=process.env]
 * @returns {boolean}
 */
function detect(env = process.env) {
    return env.FRIGG_PROVIDER === 'netlify' || !!env.NETLIFY;
}

module.exports = { detect };
