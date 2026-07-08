/**
 * Compute the rollup window keys a usage event falls into.
 * Windows are UTC and prefixed by their granularity so the store can filter a
 * series by bucket (`window startsWith 'day:'`).
 *
 * @param {Date} [date] Defaults to now.
 * @returns {string[]} e.g. ['day:2026-07-05', 'hour:2026-07-05T14']
 */
function computeUsageWindows(date = new Date()) {
    const iso = date.toISOString(); // 2026-07-05T14:23:00.000Z
    return [`day:${iso.slice(0, 10)}`, `hour:${iso.slice(0, 13)}`];
}

module.exports = { computeUsageWindows };
